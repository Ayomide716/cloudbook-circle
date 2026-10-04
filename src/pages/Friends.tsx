import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { useEffectEvent } from "@/hooks/use-effect-event";
import { toDate } from "@/lib/utils";


interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface SuggestedProfile extends Profile {
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
  useSEO({ title: "Friends", description: "Manage your friends on CloudBook." });
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
    await Promise.all([
      loadPendingRequests(),
      loadSentRequests(),
      loadFriends(),
      loadSuggestions(),
    ]);
    setIsLoading(false);
  });

  const loadPendingRequests = async () => {
    if (!currentUserId) return;

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

    setPendingRequests(data as unknown as FriendRequest[] || []);
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

    const friendsList: Friendship[] = [];

    for (const friendship of friendships || []) {
      const friendId = friendship.user_id === currentUserId
        ? friendship.friend_id
        : friendship.user_id;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", friendId)
        .single();

      if (profile) {
        friendsList.push({
          id: friendship.id,
          friend: profile,
          created_at: friendship.created_at,
        });
      }
    }

    setFriends(friendsList);
  };

  const loadSuggestions = async () => {
    if (!currentUserId) return;

    const { data: existingFriendships, error: existingError } = await supabase
      .from("friendships")
      .select("user_id, friend_id, status")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

    if (existingError) {
      setSuggestions([]);
      return;
    }

    const connectedUserIds = new Set<string>([currentUserId]);
    const myAcceptedFriendIds: string[] = [];

    existingFriendships?.forEach((f) => {
      connectedUserIds.add(f.user_id);
      connectedUserIds.add(f.friend_id);

      if (f.status === "accepted") {
        myAcceptedFriendIds.push(
          f.user_id === currentUserId ? f.friend_id : f.user_id
        );
      }
    });

    if (myAcceptedFriendIds.length === 0) {
      setSuggestions([]);
      return;
    }

    const [friendshipsByUserResult, friendshipsByFriendResult] = await Promise.all([
      supabase
        .from("friendships")
        .select("user_id, friend_id")
        .eq("status", "accepted")
        .in("user_id", myAcceptedFriendIds),
      supabase
        .from("friendships")
        .select("user_id, friend_id")
        .eq("status", "accepted")
        .in("friend_id", myAcceptedFriendIds),
    ]);

    const networkFriendships = [
      ...(friendshipsByUserResult.data || []),
      ...(friendshipsByFriendResult.data || []),
    ];
    const myAcceptedSet = new Set(myAcceptedFriendIds);
    const candidateMutualMap = new Map<string, Set<string>>();

    for (const friendship of networkFriendships) {
      if (
        myAcceptedSet.has(friendship.user_id) &&
        !connectedUserIds.has(friendship.friend_id) &&
        friendship.friend_id !== currentUserId
      ) {
        const mutualSet = candidateMutualMap.get(friendship.friend_id) || new Set<string>();
        mutualSet.add(friendship.user_id);
        candidateMutualMap.set(friendship.friend_id, mutualSet);
      }

      if (
        myAcceptedSet.has(friendship.friend_id) &&
        !connectedUserIds.has(friendship.user_id) &&
        friendship.user_id !== currentUserId
      ) {
        const mutualSet = candidateMutualMap.get(friendship.user_id) || new Set<string>();
        mutualSet.add(friendship.friend_id);
        candidateMutualMap.set(friendship.user_id, mutualSet);
      }
    }

    const candidateIds = [...candidateMutualMap.keys()];

    if (candidateIds.length === 0) {
      setSuggestions([]);
      return;
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", candidateIds.slice(0, 40));

    if (profilesError || !profiles) {
      setSuggestions([]);
      return;
    }

    const rankedSuggestions: SuggestedProfile[] = profiles
      .map((profile) => ({
        ...profile,
        mutualCount: candidateMutualMap.get(profile.id)?.size || 0,
      }))
      .filter((profile) => profile.mutualCount > 0)
      .sort((a, b) => b.mutualCount - a.mutualCount)
      .slice(0, 10);

    setSuggestions(rankedSuggestions);
  };

  const setupRealtimeSubscription = useEffectEvent(() => {
    const channel = supabase
      .channel("friends-page")
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

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .ilike("full_name", `%${query}%`)
      .limit(10);

    setIsSearching(false);

    if (!error && data) {
      setSearchResults(data);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-4">
      <Navigation currentUserId={currentUserId || undefined} />
      
      <div className="max-w-[1000px] mx-auto px-4 py-4 sm:py-6">
        <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold">Friends</h1>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search people..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Search Results */}
        {searchQuery.length >= 2 && (
          <Card className="mb-4">
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
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/profile/${profile.id}`);
                      }}
                    >
                      View Profile
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Tabs defaultValue="requests" className="w-full">
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="requests" className="relative">
              Requests
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="friends">Friends</TabsTrigger>
            <TabsTrigger value="suggestions">People You May Know</TabsTrigger>
          </TabsList>

          <TabsContent value="requests">
            <Card>
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
                    <div key={request.id} className="flex items-center gap-4 p-4">
                      <Link to={`/profile/${request.profiles.id}`}>
                        <Avatar className="h-14 w-14">
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
                      <div className="flex gap-2">
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
            <Card>
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
                    <div key={request.id} className="flex items-center gap-4 p-4">
                      <Link to={`/profile/${request.profiles.id}`}>
                        <Avatar className="h-14 w-14">
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
            <Card>
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
                        <Avatar className="h-14 w-14">
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
            <Card>
              {suggestions.filter(s => !hiddenSuggestions.has(s.id)).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">
                    No people to suggest yet
                  </p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    Add more friends to unlock mutual-based suggestions
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {suggestions.filter(s => !hiddenSuggestions.has(s.id)).map((profile) => (
                    <div key={profile.id} className="flex items-center gap-4 p-4">
                      <Link to={`/profile/${profile.id}`}>
                        <Avatar className="h-14 w-14">
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
                          {profile.mutualCount} mutual {profile.mutualCount === 1 ? "friend" : "friends"}
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
