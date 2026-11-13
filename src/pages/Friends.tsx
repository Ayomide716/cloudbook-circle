import { useEffect, useRef, useState } from "react";
import PullToRefresh from "@/components/PullToRefresh";
import { m as motion } from "framer-motion";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import FriendsSkeleton from "@/components/skeletons/FriendsSkeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToastAction } from "@/components/ui/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, UserPlus, Check, UserMinus, MoreHorizontal, EyeOff } from "@/components/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { PageHeader, PageSearch } from "@/components/layout/PageHeader";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { cn, friendlyError, toDate } from "@/lib/utils";
import { lastSeen } from "@/lib/time";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { dbChannel } from "@/lib/realtime";
import EmptyState from "@/components/EmptyState";
import InviteFriends from "@/components/InviteFriends";
import { cancelDelete, deleteLater } from "@/lib/pending-deletes";
import PersonRow from "@/components/PersonRow";
import FriendsPosts from "@/components/feed/FriendsPosts";

/** The Requests / Sent / Friends / Suggested tabs as round chips. */
const FRIEND_CHIP =
  "h-8 shrink-0 rounded-full border-0 bg-secondary px-3 py-0 text-[13px] font-semibold text-foreground hover:bg-secondary/80 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none sm:h-9 sm:text-sm";


interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_online?: boolean | null;
  last_seen?: string | null;
}

/** Online means seen in the last five minutes, as in chat. */
const isOnline = (p: Profile) => !!p.is_online && !!p.last_seen && new Date(p.last_seen).getTime() > Date.now() - 5 * 60 * 1000;

const mutualLabel = (n: number) => `${n} mutual ${n === 1 ? "friend" : "friends"}`;

/** A titled card, as Facebook groups requests and suggestions, with "See all" when there's more. */
const Section = ({ title, count, onSeeAll, children }: { title: string; count?: number; onSeeAll?: () => void; children: React.ReactNode }) => (
  <Card className="feed-section flat-list overflow-hidden">
    <div className="flex items-center justify-between px-4 pb-1 pt-3">
      <h2 className="text-[16px] font-bold">
        {title}
        {!!count && <span className="ml-1.5 text-primary">{count}</span>}
      </h2>
      {onSeeAll && <button type="button" onClick={onSeeAll} className="text-sm font-semibold text-primary">See all</button>}
    </div>
    {children}
  </Card>
);

interface SuggestedProfile extends Profile {
  /** 0 for "new on Ember" suggestions. */
  mutualCount: number;
}

interface FriendRequest {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
  created_at: string;
  profiles: Profile;
}

interface Friendship {
  id: string;
  friend: Profile;
  created_at: string | null;
}

const Friends = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Friends", description: "Manage your friends on Ember." });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedProfile[]>([]);
  /** Mutual friends with each person who sent you a request. */
  const [requestMutuals, setRequestMutuals] = useState<Record<string, number>>({});
  const [hiddenSuggestions, setHiddenSuggestions] = useState<Set<string>>(new Set());
  // Requests you just accepted: they show "You're now friends" for a moment before leaving the list.
  const [justAccepted, setJustAccepted] = useState<Set<string>>(new Set());
  // The list as it was when you tapped Accept, so a realtime reload doesn't pull the row away early.
  const [heldRequests, setHeldRequests] = useState<FriendRequest[] | null>(null);
  const shownRequests = heldRequests ?? pendingRequests;
  const [unfriendTarget, setUnfriendTarget] = useState<Friendship | null>(null);
  const unfriending = useRef(new Set<string>());
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(searchQuery.trim());
  const searchSeq = useRef(0);

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
  });

  useEffect(() => {
    checkAuth();
  }, [navigate, checkAuth]);

  const loadData = useEffectEvent(async () => {
    const [pending] = await Promise.all([
      loadPendingRequests(),
      loadSentRequests(),
      loadFriends(),
      loadSuggestions(),
    ]);
    // Open on requests only when there are some; otherwise show your friends.
    setActiveTab((tab) => tab ?? (pending.length ? "requests" : "posts"));
    setIsLoading(false);
  });

  const loadPendingRequests = async (): Promise<FriendRequest[]> => {
    if (!currentUserId) return [];

    const { data } = await supabase
      .from("friendships")
      .select(`
        id,
        user_id,
        friend_id,
        status,
        created_at,
        profiles:user_id (id, full_name, avatar_url)
      `)
      .eq("friend_id", currentUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const list = (data as unknown as FriendRequest[]) || [];
    setPendingRequests(list);
    // Mutual friends for each request (a few at most), so you know who they are.
    void Promise.all(
      list.slice(0, 20).map(async (r) => {
        const { data: stats } = await supabase.rpc("profile_friend_stats", { _user_id: r.user_id });
        return [r.user_id, stats?.[0]?.mutual_ids?.length ?? 0] as const;
      })
    ).then((pairs) => setRequestMutuals(Object.fromEntries(pairs)));
    return list;
  };

  const loadSentRequests = async () => {
    if (!currentUserId) return;

    const { data } = await supabase
      .from("friendships")
      .select(`
        id,
        user_id,
        friend_id,
        status,
        created_at,
        profiles:friend_id (id, full_name, avatar_url)
      `)
      .eq("user_id", currentUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    setSentRequests(data as unknown as FriendRequest[] || []);
  };

  const loadFriends = async () => {
    if (!currentUserId) return;

    const { data: friendships } = await supabase
      .from("friendships")
      .select("*")
      .eq("status", "accepted")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

    // All friends' profiles in one query rather than one per friend.
    const otherId = (f: { user_id: string; friend_id: string }) => (f.user_id === currentUserId ? f.friend_id : f.user_id);
    const ids = (friendships ?? []).map(otherId);
    const [{ data: profiles }, { data: statuses }] = ids.length
      ? await Promise.all([
          supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids),
          supabase.from("user_status").select("user_id, is_online, last_seen").in("user_id", ids),
        ])
      : [{ data: [] as Profile[] }, { data: [] }];
    // Who's online or was active lately, as in chat.
    const status = new Map((statuses ?? []).map((st) => [st.user_id, st]));
    const byId = new Map<string, Profile>(
      (profiles ?? []).map((p) => [p.id, { ...p, is_online: status.get(p.id)?.is_online, last_seen: status.get(p.id)?.last_seen }])
    );
    setFriends(
      (friendships ?? [])
        .filter((f) => byId.has(otherId(f)) && !unfriending.current.has(f.id))
        .map((f) => ({ id: f.id, friend: byId.get(otherId(f))!, created_at: f.created_at }))
        .sort((a, b) => (a.friend.full_name ?? "").localeCompare(b.friend.full_name ?? ""))
    );
  };

  /**
   * Friends of your friends, from a database function (other people's friendships are
   * private, so they can't be read directly). Until it's installed, or when it finds no
   * one, suggest people who joined recently instead.
   */
  const loadSuggestions = async () => {
    if (!currentUserId) return;
    const { data: ranked, error } = await supabase.rpc("friend_suggestions", { _limit: 10 });
    if (!error && ranked?.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ranked.map((r) => r.user_id));
      const mutual = new Map(ranked.map((r) => [r.user_id, Number(r.mutual_count)]));
      setSuggestions(
        (profiles ?? [])
          .map((p) => ({ ...p, mutualCount: mutual.get(p.id) ?? 0 }))
          .sort((a, b) => b.mutualCount - a.mutualCount)
      );
      return;
    }

    const { data: mine } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);
    const connected = new Set<string>([currentUserId]);
    for (const f of mine ?? []) { connected.add(f.user_id); connected.add(f.friend_id); }
    const { data: recent } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .order("created_at", { ascending: false })
      .limit(30);
    setSuggestions((recent ?? []).filter((p) => !connected.has(p.id)).slice(0, 10).map((p) => ({ ...p, mutualCount: 0 })));
  };

  const setupRealtimeSubscription = useEffectEvent(() => {
    const channel = dbChannel("friends-page")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  });

  useEffect(() => {
    if (currentUserId) {
      loadData();
      return setupRealtimeSubscription();
    }
  }, [currentUserId, loadData, setupRealtimeSubscription]);

  // Shown as accepted at once; put back if saving fails.
  const handleAccept = async (requestId: string) => {
    setHeldRequests((held) => held ?? pendingRequests);
    setJustAccepted((s) => new Set(s).add(requestId));
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", requestId);

    if (error) {
      setJustAccepted((s) => {
        const next = new Set(s);
        next.delete(requestId);
        if (next.size === 0) setHeldRequests(null);
        return next;
      });
      toast({
        title: "Couldn't accept the request",
        description: friendlyError(error),
        variant: "destructive",
      });
      return;
    }

    window.setTimeout(() => {
      setJustAccepted((s) => {
        const next = new Set(s);
        next.delete(requestId);
        if (next.size === 0) setHeldRequests(null);
        return next;
      });
      loadData();
    }, 1600);
  };

  const handleDecline = async (requestId: string) => {
    // Gone from the list at once; back if it fails.
    const before = pendingRequests;
    setPendingRequests((list) => list.filter((r) => r.id !== requestId));
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", requestId);

    if (error) {
      setPendingRequests(before);
      toast({
        title: "Couldn't decline the request",
        description: friendlyError(error),
        variant: "destructive",
      });
      return;
    }

    loadData();
  };

  const handleSendRequest = async (userId: string) => {
    if (!currentUserId) return;
    // Immediately hide the suggestion
    setHiddenSuggestions((prev) => new Set(prev).add(userId));

    const { data, error } = await supabase
      .from("friendships")
      .insert({
        user_id: currentUserId,
        friend_id: userId,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      // Restore suggestion on error
      setHiddenSuggestions((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      toast({
        title: "Error",
        description: friendlyError(error),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Friend request sent!",
      description: "Tap Undo to cancel.",
      action: (
        <ToastAction
          altText="Undo friend request"
          onClick={async () => {
            if (data?.id) {
              await supabase.from("friendships").delete().eq("id", data.id);
              setHiddenSuggestions((prev) => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
              });
              loadData();
            }
          }}
        >
          Undo
        </ToastAction>
      ),
    });
    loadData();
  };

  const handleCancelRequest = async (requestId: string) => {
    const before = sentRequests;
    setSentRequests((list) => list.filter((r) => r.id !== requestId));
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", requestId);

    if (error) {
      setSentRequests(before);
      toast({
        title: "Couldn't cancel the request",
        description: friendlyError(error),
        variant: "destructive",
      });
      return;
    }

    loadData();
  };

  // Gone from the list at once, with Undo for 5 seconds; only really removed after that.
  const handleUnfriend = async () => {
    if (!unfriendTarget) return;
    const target = unfriendTarget;
    setUnfriendTarget(null);
    // Kept out of the list even if it reloads meanwhile.
    unfriending.current.add(target.id);
    setFriends((list) => list.filter((f) => f.id !== target.id));
    const key = `unfriend:${target.id}`;
    deleteLater(key, 5000, {
      run: async () => {
        const { error } = await supabase.from("friendships").delete().eq("id", target.id);
        unfriending.current.delete(target.id);
        if (error) toast({ title: "Couldn't remove friend", description: friendlyError(error), variant: "destructive" });
        loadData();
      },
    });
    toast({
      title: `Removed ${target.friend.full_name || "friend"}`,
      duration: 5000,
      action: (
        <ToastAction altText="Undo remove friend" onClick={() => { cancelDelete(key); unfriending.current.delete(target.id); loadData(); }}>
          Undo
        </ToastAction>
      ),
    });
  };

  // Search waits for typing to pause, ignores replies to older searches, and leaves you out.
  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setIsSearching(true);
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .ilike("full_name", `%${debouncedSearch}%`)
      .neq("id", currentUserId ?? "")
      .limit(10)
      .then(({ data, error }) => {
        if (seq !== searchSeq.current) return;
        setIsSearching(false);
        if (!error) setSearchResults(data ?? []);
      });
  }, [debouncedSearch, currentUserId]);

  const relationTo = (id: string) =>
    friends.some((f) => f.friend.id === id) ? "Friends"
    : sentRequests.some((r) => r.friend_id === id) ? "Requested"
    : pendingRequests.some((r) => r.user_id === id) ? "Wants to connect"
    : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <FriendsSkeleton />
      </div>
    );
  }

  const visibleSuggestions = suggestions.filter((p) => !hiddenSuggestions.has(p.id));
  const hideSuggestion = (id: string) => setHiddenSuggestions((prev) => new Set(prev).add(id));
  const suggestionRow = (profile: SuggestedProfile) => (
    <div key={profile.id} className="flex items-start gap-3 sm:gap-4 px-4 py-3">
      <Link to={`/profile/${profile.id}`} aria-label={profile.full_name || "Profile"}>
        <Avatar className="h-[72px] w-[72px]">
          <AvatarImage src={profile.avatar_url || undefined} />
          <AvatarFallback>
            {profile.full_name?.[0]?.toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <Link to={`/profile/${profile.id}`}>
          <p className="font-semibold truncate hover:underline">
            {profile.full_name || "Anonymous"}
          </p>
        </Link>
        <p className="text-xs text-muted-foreground">
          {profile.mutualCount > 0 ? mutualLabel(profile.mutualCount) : "New on Ember"}
        </p>
        <div className="mt-2 flex max-w-sm items-center gap-2">
      <Button
        size="sm"
        variant="accent"
        onClick={() => handleSendRequest(profile.id)}
        className="h-10 flex-1 gap-1 rounded-xl font-semibold"
      >
        <UserPlus className="h-4 w-4" />
        Add friend
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`More options for ${profile.full_name || "this person"}`} className="flex h-10 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground hover:bg-secondary/80">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/profile/${profile.id}`)}>
            <UserPlus className="mr-2 h-4 w-4" /> View profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => hideSuggestion(profile.id)}>
            <EyeOff className="mr-2 h-4 w-4" /> Remove suggestion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
        </div>
      </div>
    </div>
  );

  return (
    <div className="content-fade min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />
      
      <PullToRefresh onRefresh={async () => { await loadData(); }}>
      <div className="page-flush max-w-[1000px] mx-auto px-0 sm:px-4 pb-6 sm:py-6">
        <PageHeader back title="Friends" className="sm:mb-4">
          <PageSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search people" />
        </PageHeader>

        {/* Search Results */}
        {searchQuery.trim().length >= 2 && (
          <Card className="feed-section mb-2 sm:mb-4">
            {isSearching ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-muted-foreground">No users found</p>
              </div>
            ) : (
              <div className="divide-y">
                {searchResults.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => navigate(`/profile/${profile.id}`)}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={profile.avatar_url || undefined} />
                      <AvatarFallback>
                        {profile.full_name?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">
                        {profile.full_name || "Anonymous"}
                      </p>
                    </div>
                    {relationTo(profile.id) ? (
                      <span className="text-xs font-medium text-muted-foreground shrink-0">{relationTo(profile.id)}</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="accent"
                        className="h-8 shrink-0 gap-1 rounded-lg px-3 font-semibold"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendRequest(profile.id);
                        }}
                      >
                        <UserPlus className="h-4 w-4" /> Add friend
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Tabs value={activeTab ?? "posts"} onValueChange={setActiveTab} className="w-full">
          {/* Round chips, the same as Groups, Messages and Notifications, all on screen. */}
          <TabsList className="mb-2 flex w-full justify-start gap-1.5 overflow-x-auto border-0 px-4 py-0.5 scrollbar-hide sm:mb-4 sm:gap-2 sm:px-0">
            <TabsTrigger value="posts" className={FRIEND_CHIP}>Posts</TabsTrigger>
            <TabsTrigger value="requests" className={FRIEND_CHIP}>
              Requests
              {pendingRequests.length > 0 && (
                <span className="bg-badge text-white text-[11px] rounded-full h-[18px] min-w-[18px] px-1 inline-flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="suggestions" className={FRIEND_CHIP}>Suggestions</TabsTrigger>
            <TabsTrigger value="friends" className={FRIEND_CHIP}>All friends</TabsTrigger>
          </TabsList>

          <TabsContent value="posts">
            {currentUserId && activeTab === "posts" && <FriendsPosts currentUserId={currentUserId} />}
          </TabsContent>

          <TabsContent value="requests" className="space-y-2 sm:space-y-4">
            {shownRequests.length === 0 ? (
              <Card className="feed-section flat-list">
                <EmptyState emoji="mailbox" title="No friend requests" text="When someone sends you a friend request, it'll show up here." />
              </Card>
            ) : (
              <Section title="Friend requests" count={shownRequests.length}>
                <div className="divide-y">
                  {shownRequests.map((request) => {
                    const mutual = requestMutuals[request.user_id] ?? 0;
                    return (
                      <div key={request.id} className="flex items-start gap-3 sm:gap-4 px-4 py-3">
                        <Link to={`/profile/${request.profiles.id}`} aria-label={request.profiles.full_name || "Profile"}>
                          <Avatar className="h-[72px] w-[72px]">
                            <AvatarImage src={request.profiles.avatar_url || undefined} />
                            <AvatarFallback>
                              {request.profiles.full_name?.[0]?.toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link to={`/profile/${request.profiles.id}`}>
                            <p className="font-semibold truncate hover:underline">
                              {request.profiles.full_name || "Anonymous"}
                            </p>
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {mutual > 0 && `${mutualLabel(mutual)} · `}
                            {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                          </p>
                          {justAccepted.has(request.id) ? (
                          <motion.p
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                            className="mt-2 flex h-10 items-center gap-1.5 text-sm font-semibold"
                            role="status"
                          >
                            <motion.span
                              initial={{ scale: 0.6 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 500, damping: 22 }}
                              className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </motion.span>
                            You're now friends
                          </motion.p>
                          ) : (
                          <div className="mt-2 grid max-w-sm grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant="accent"
                            onClick={() => handleAccept(request.id)}
                            className="h-10 gap-1 rounded-xl font-semibold"
                          >
                            <Check className="h-4 w-4" />
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDecline(request.id)}
                            aria-label="Decline request"
                            className="h-10 rounded-xl font-semibold"
                          >
                            Delete
                          </Button>
                          </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}
            {/* People you may know, right under your requests (as on Facebook). */}
            {visibleSuggestions.length > 0 && (
              <Section title="People you may know" onSeeAll={() => setActiveTab("suggestions")}>
                <div className="divide-y">{visibleSuggestions.slice(0, 3).map(suggestionRow)}</div>
              </Section>
            )}
            {/* Requests you sent, until they're answered (was its own pill). */}
            {sentRequests.length > 0 && (
              <Section title="Requests you sent" count={sentRequests.length}>
                <Card className="feed-section flat-list">
                {(
                  <div className="divide-y">
                    {sentRequests.map((request) => (
                      <PersonRow
                        key={request.id}
                        id={request.profiles.id}
                        name={request.profiles.full_name}
                        avatarUrl={request.profiles.avatar_url}
                        subtitle={`Request sent ${formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}`}
                        actions={
                          <Button size="sm" variant="secondary" onClick={() => handleCancelRequest(request.id)} className="h-9 rounded-full px-3.5 font-semibold">
                            Cancel
                          </Button>
                        }
                      />
                    ))}
                  </div>
                )}
              </Card>
              </Section>
            )}
          </TabsContent>


          <TabsContent value="friends">
            <Card className="feed-section flat-list">
              {friends.length === 0 ? (
                <>
                  <EmptyState emoji="people" title="No friends yet" text="Add a few people you know and their posts will fill your feed." action={<Button onClick={() => setActiveTab("suggestions")} className="rounded-full px-5">Find people</Button>} />
                  {currentUserId && <InviteFriends userId={currentUserId} className="m-4 mt-0" />}
                </>
              ) : (
                <div className="divide-y">
                  {friends.map((friendship) => (
                    <PersonRow
                      key={friendship.id}
                      id={friendship.friend.id}
                      name={friendship.friend.full_name}
                      avatarUrl={friendship.friend.avatar_url}
                      online={isOnline(friendship.friend)}
                      subtitle={isOnline(friendship.friend)
                        ? "Online"
                        : friendship.friend.last_seen
                          ? lastSeen(friendship.friend.last_seen)
                          : `Friends since ${formatDistanceToNow(toDate(friendship.created_at), { addSuffix: true })}`}
                      actions={
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-10 w-10 rounded-full text-muted-foreground hover:text-destructive"
                          onClick={() => setUnfriendTarget(friendship)}
                          aria-label={`Unfriend ${friendship.friend.full_name || "this person"}`}
                        >
                          <UserMinus className="h-5 w-5" />
                        </Button>
                      }
                    />
                  ))}
                </div>
              )}
            </Card>
            {/* Few friends yet: invite the ones who aren't on Ember. */}
            {currentUserId && friends.length > 0 && friends.length < 10 && <InviteFriends userId={currentUserId} className="feed-section mt-2 sm:mt-4" />}
            {/* A short list leaves the page empty; suggest people to add underneath, as Facebook does. */}
            {friends.length > 0 && friends.length < 5 && visibleSuggestions.length > 0 && (
              <div className="mt-2 sm:mt-4">
                <Section title="People you may know" onSeeAll={() => setActiveTab("suggestions")}>
                  <div className="divide-y">{visibleSuggestions.slice(0, 5).map(suggestionRow)}</div>
                </Section>
              </div>
            )}
          </TabsContent>

          <TabsContent value="suggestions">
            <Card className="feed-section flat-list">
              {visibleSuggestions.length === 0 ? (
                <EmptyState emoji="search" title="No one to suggest right now" text="Try searching for people you know by name, above." />
              ) : (
                <div className="divide-y">
                  {visibleSuggestions.map(suggestionRow)}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      </PullToRefresh>

      {/* Unfriend Confirmation Dialog */}
      <AlertDialog open={!!unfriendTarget} onOpenChange={(open) => !open && setUnfriendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unfriend {unfriendTarget?.friend.full_name || "this person"}?</AlertDialogTitle>
            <AlertDialogDescription>
              They won't be notified, but you'll be removed from each other's friends lists. You can always send a new request later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnfriend}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Unfriend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Friends;
