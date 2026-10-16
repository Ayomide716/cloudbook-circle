import { useEffect, useRef, useState } from "react";
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
import { cn, toDate } from "@/lib/utils";
import { lastSeen } from "@/lib/time";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { dbChannel } from "@/lib/realtime";
import EmptyState from "@/components/EmptyState";
import InviteFriends from "@/components/InviteFriends";

/** The Requests / Sent / Friends / Suggested tabs as round chips. */
const FRIEND_CHIP =
  "h-[34px] rounded-full border-0 bg-secondary px-2 py-0 text-[14px] font-semibold text-foreground hover:bg-secondary/80 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none sm:h-9 sm:text-sm";


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
  const [unfriendTarget, setUnfriendTarget] = useState<Friendship | null>(null);
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
    setActiveTab((tab) => tab ?? (pending.length ? "requests" : "friends"));
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
        .filter((f) => byId.has(otherId(f)))
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

  const handleAccept = async (requestId: string) => {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", requestId);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    loadData();
  };

  const handleDecline = async (requestId: string) => {
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", requestId);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
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
        description: error.message,
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
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", requestId);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    loadData();
  };

  const handleUnfriend = async () => {
    if (!unfriendTarget) return;
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", unfriendTarget.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Unfriended ${unfriendTarget.friend.full_name || "user"}` });
      loadData();
    }
    setUnfriendTarget(null);
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
      <Link to={`/profile/${profile.id}`}>
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
        variant="outline"
        onClick={() => handleSendRequest(profile.id)}
        className="h-9 flex-1 gap-1 rounded-lg border-primary/60 font-semibold text-primary hover:bg-primary/10 hover:text-primary"
      >
        <UserPlus className="h-4 w-4" />
        Add friend
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`More options for ${profile.full_name || "this person"}`} className="flex h-9 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground hover:bg-secondary/80">
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
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />
      
      <div className="page-flush max-w-[1000px] mx-auto px-0 sm:px-4 pb-6 sm:py-6">
        <PageHeader title="Friends" className="sm:mb-4">
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
                        variant="outline"
                        className="h-8 shrink-0 gap-1 rounded-full border-primary/60 px-3 font-semibold text-primary hover:bg-primary/10 hover:text-primary"
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

        <Tabs value={activeTab ?? "friends"} onValueChange={setActiveTab} className="w-full">
          {/* Round chips, the same as Groups, Messages and Notifications, all on screen. */}
          <TabsList className="mb-2 flex w-full gap-1.5 border-0 px-3 py-0.5 sm:mb-4 sm:gap-2 sm:px-0">
            <TabsTrigger value="requests" className={FRIEND_CHIP}>
              Requests
              {pendingRequests.length > 0 && (
                <span className="bg-destructive text-destructive-foreground text-[11px] rounded-full h-[18px] min-w-[18px] px-1 inline-flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent" className={FRIEND_CHIP}>Sent</TabsTrigger>
            <TabsTrigger value="friends" className={FRIEND_CHIP}>Friends</TabsTrigger>
            <TabsTrigger value="suggestions" className={FRIEND_CHIP}>
              <span className="sm:hidden">Suggested</span>
              <span className="hidden sm:inline">People You May Know</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="space-y-2 sm:space-y-4">
            {pendingRequests.length === 0 ? (
              <Card className="feed-section flat-list">
                <EmptyState emoji="mailbox" title="No friend requests" text="When someone sends you a friend request, it'll show up here." />
              </Card>
            ) : (
              <Section title="Friend requests" count={pendingRequests.length}>
                <div className="divide-y">
                  {pendingRequests.map((request) => {
                    const mutual = requestMutuals[request.user_id] ?? 0;
                    return (
                      <div key={request.id} className="flex items-start gap-3 sm:gap-4 px-4 py-3">
                        <Link to={`/profile/${request.profiles.id}`}>
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
                          <div className="mt-2 grid max-w-sm grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant="accent"
                            onClick={() => handleAccept(request.id)}
                            className="h-9 gap-1 rounded-lg font-semibold"
                          >
                            <Check className="h-4 w-4" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDecline(request.id)}
                            aria-label="Decline request"
                            className="h-9 rounded-lg font-semibold"
                          >
                            Delete
                          </Button>
                          </div>
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
          </TabsContent>

          <TabsContent value="sent">
            <Card className="feed-section flat-list">
              {sentRequests.length === 0 ? (
                <EmptyState emoji="mailbox" title="No sent requests" text="Requests you send will wait here until they're answered." action={<Button onClick={() => setActiveTab("suggestions")} className="rounded-full px-5">Find people</Button>} />
              ) : (
                <div className="divide-y">
                  {sentRequests.map((request) => (
                    <div key={request.id} className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
                      <Link to={`/profile/${request.profiles.id}`}>
                        <Avatar className="h-12 w-12 sm:h-14 sm:w-14">
                          <AvatarImage src={request.profiles.avatar_url || undefined} />
                          <AvatarFallback>
                            {request.profiles.full_name?.[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Link to={`/profile/${request.profiles.id}`} className="min-w-0">
                            <p className="font-semibold truncate hover:underline">
                              {request.profiles.full_name || "Anonymous"}
                            </p>
                          </Link>
                          <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">Pending</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Sent {formatDistanceToNow(new Date(request.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCancelRequest(request.id)}
                        className="h-8 shrink-0 rounded-full px-3 font-semibold"
                      >
                        Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
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
                    <div
                      key={friendship.id}
                      className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors"
                    >
                      <Link to={`/profile/${friendship.friend.id}`} className="relative shrink-0">
                        <Avatar className="h-12 w-12 sm:h-14 sm:w-14">
                          <AvatarImage src={friendship.friend.avatar_url || undefined} />
                          <AvatarFallback>
                            {friendship.friend.full_name?.[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        {isOnline(friendship.friend) && (
                          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-card" aria-hidden />
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link to={`/profile/${friendship.friend.id}`}>
                          <p className="font-semibold truncate hover:underline">
                            {friendship.friend.full_name || "Anonymous"}
                          </p>
                        </Link>
                        <p className={cn("text-xs", isOnline(friendship.friend) ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                          {isOnline(friendship.friend)
                            ? "Online"
                            : friendship.friend.last_seen
                              ? lastSeen(friendship.friend.last_seen)
                              : `Friends since ${formatDistanceToNow(toDate(friendship.created_at), { addSuffix: true })}`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setUnfriendTarget(friendship)}
                        aria-label={`Unfriend ${friendship.friend.full_name || "this person"}`}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </div>
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
