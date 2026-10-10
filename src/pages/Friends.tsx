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
import { Loader2, Users, UserPlus, Check, X, UserCheck, Search, UserMinus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PageHeader, PageSearch } from "@/components/layout/PageHeader";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { toDate } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { dbChannel } from "@/lib/realtime";


interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

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
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids)
      : { data: [] as Profile[] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
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

    toast({ title: "Friend request accepted!" });
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

    toast({ title: "Friend request declined" });
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
              toast({ title: "Request cancelled" });
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

    toast({ title: "Friend request cancelled" });
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
                        className="gap-1 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendRequest(profile.id);
                        }}
                      >
                        <UserPlus className="h-4 w-4" /> Add
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Tabs value={activeTab ?? "friends"} onValueChange={setActiveTab} className="w-full">
          <TabsList className="feed-section w-full bg-card sm:bg-transparent px-2 sm:px-0 mb-2 sm:mb-4">
            <TabsTrigger value="requests">
              Requests
              {pendingRequests.length > 0 && (
                <span className="bg-destructive text-destructive-foreground text-[11px] rounded-full h-5 min-w-5 px-1.5 inline-flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="friends">Friends</TabsTrigger>
            <TabsTrigger value="suggestions">
              <span className="sm:hidden">Suggested</span>
              <span className="hidden sm:inline">People You May Know</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests">
            <Card className="feed-section">
              {pendingRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <UserPlus className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    No pending requests
                  </p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    When someone sends you a friend request, it'll appear here
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {pendingRequests.map((request) => (
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
                        <Link to={`/profile/${request.profiles.id}`}>
                          <p className="font-semibold truncate hover:underline">
                            {request.profiles.full_name || "Anonymous"}
                          </p>
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(request.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleAccept(request.id)}
                          className="gap-1"
                        >
                          <Check className="h-4 w-4" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDecline(request.id)}
                          aria-label="Decline request"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="sent">
            <Card className="feed-section">
              {sentRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <UserPlus className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    No sent requests
                  </p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    Friend requests you've sent will appear here
                  </p>
                </div>
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
                        <Link to={`/profile/${request.profiles.id}`}>
                          <p className="font-semibold truncate hover:underline">
                            {request.profiles.full_name || "Anonymous"}
                          </p>
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          Sent {formatDistanceToNow(new Date(request.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancelRequest(request.id)}
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
            <Card className="feed-section">
              {friends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <UserCheck className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    No friends yet
                  </p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    Start connecting with people!
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {friends.map((friendship) => (
                    <div
                      key={friendship.id}
                      className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors"
                    >
                      <Link to={`/profile/${friendship.friend.id}`}>
                        <Avatar className="h-12 w-12 sm:h-14 sm:w-14">
                          <AvatarImage src={friendship.friend.avatar_url || undefined} />
                          <AvatarFallback>
                            {friendship.friend.full_name?.[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link to={`/profile/${friendship.friend.id}`}>
                          <p className="font-semibold truncate hover:underline">
                            {friendship.friend.full_name || "Anonymous"}
                          </p>
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          Friends since {formatDistanceToNow(toDate(friendship.created_at), {
                            addSuffix: true,
                          })}
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
          </TabsContent>

          <TabsContent value="suggestions">
            <Card className="feed-section">
              {suggestions.filter(s => !hiddenSuggestions.has(s.id)).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    No one to suggest right now
                  </p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    Try searching for people you know above
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {suggestions.filter(s => !hiddenSuggestions.has(s.id)).map((profile) => (
                    <div key={profile.id} className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
                      <Link to={`/profile/${profile.id}`}>
                        <Avatar className="h-12 w-12 sm:h-14 sm:w-14">
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
                          {profile.mutualCount > 0
                            ? `${profile.mutualCount} mutual ${profile.mutualCount === 1 ? "friend" : "friends"}`
                            : "New on Ember"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleSendRequest(profile.id)}
                        className="gap-1"
                      >
                        <UserPlus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  ))}
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
