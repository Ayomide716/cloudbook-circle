import EmptyState from "@/components/EmptyState";
import { uploadMedia } from "@/lib/media-upload";
import { getErrorMessage } from "@/lib/utils";
import { IMAGE_SIZES, shrinkImage } from "@/lib/image-compress";
import { useEffect, useState, useMemo, useRef } from "react";
import { useSingleFlight } from "@/hooks/use-single-flight";
import { groupInitials } from "@/lib/group-tile";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Globe, ImagePlus, Check } from "@/components/icons";
import { PageHeader, HeaderAction, PageSearch, Chips } from "@/components/layout/PageHeader";
import GroupsSkeleton from "@/components/skeletons/GroupsSkeleton";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { useGroupChats } from "@/lib/group-chats";
import { GroupInviteCards } from "@/components/groups/GroupListItems";
import GroupsHub from "@/components/groups/GroupsHub";

interface Group {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_by: string;
  member_count?: number;
  is_member?: boolean;
}

const Groups = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Groups", description: "Discover and join groups on Ember." });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  // Invites to community groups (group chat invites are answered in Messages).
  const { invites, reload: reloadInvites } = useGroupChats(currentUserId);
  const communityInvites = invites.filter((i) => i.group.is_chat !== true);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"all" | "mine" | "discover">("all");
  const [groupImage, setGroupImage] = useState<File | null>(null);
  const [groupImagePreview, setGroupImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

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

  const loadGroups = useEffectEvent(async () => {
    if (!currentUserId) return;
    setIsLoading(true);

    const { data: groupsData, error } = await supabase
      .from("groups")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error loading groups",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // Group chats (made in Messages) aren't communities, so they don't show here.
    const list = (groupsData || []).filter((g) => (g as { is_chat?: boolean }).is_chat !== true);
    const ids = list.map((g) => g.id);
    // Two queries for the whole list instead of two per group. Only members can
    // see a group's member rows, so counts come from a server function when it's installed.
    const [countsResult, mineResult] = await Promise.all([
      ids.length ? supabase.rpc("group_member_counts", { _group_ids: ids }) : Promise.resolve({ data: [], error: null }),
      supabase.from("group_members").select("group_id").eq("user_id", currentUserId),
    ]);
    const myGroups = new Set((mineResult.data || []).map((m) => m.group_id));
    const counts = new Map<string, number>();
    if (!countsResult.error) {
      for (const row of countsResult.data || []) counts.set(row.group_id, Number(row.member_count));
    }

    const groupsWithCounts = list.map((group) => ({
      ...group,
      member_count: countsResult.error ? undefined : counts.get(group.id) ?? 0,
      is_member: myGroups.has(group.id),
    }));

    setGroups(groupsWithCounts);
    setIsLoading(false);
  });

  useEffect(() => {
    if (currentUserId) {
      loadGroups();
    }
  }, [currentUserId, loadGroups]);

  // Filter groups based on search query
  const filteredGroups = useMemo(() => {
    const byView = groups.filter((g) => view === "all" || (view === "mine" ? g.is_member : !g.is_member));
    if (!searchQuery.trim()) return byView;

    const query = searchQuery.toLowerCase();
    return byView.filter(group =>
      group.name.toLowerCase().includes(query) ||
      group.description?.toLowerCase().includes(query)
    );
  }, [groups, searchQuery, view]);
  const myCount = groups.filter((g) => g.is_member).length;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file && !file.type.startsWith("image/")) {
      toast({ title: "Please choose an image", variant: "destructive" });
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Logos can be up to 5 MB.", variant: "destructive" });
      return;
    }
    if (file) {
      setGroupImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setGroupImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadGroupImage = async (groupId: string): Promise<string | null> => {
    if (!groupImage) return null;

    const small = await shrinkImage(groupImage, IMAGE_SIZES.avatar);
    const fileExt = small.name.split(".").pop();
    const fileName = `${groupId}-${Date.now()}.${fileExt}`;
    const filePath = `group-logos/${fileName}`;

    try {
      return await uploadMedia("avatars", filePath, small);
    } catch (uploadError) {
      console.error("Upload error:", uploadError);
      toast({
        title: "Image upload failed",
        description: getErrorMessage(uploadError),
        variant: "destructive",
      });
      return null;
    }
  };

  // Extra taps while this is saving do nothing (no double posts on a slow network).
  const onceHandleCreateGroup = useSingleFlight();
  const handleCreateGroup = onceHandleCreateGroup(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUserId) return;
    const name = formData.name.trim();
    if (!name) {
      toast({ title: "Give your group a name", variant: "destructive" });
      return;
    }
    setIsUploading(true);

    const { data, error } = await supabase
      .from("groups")
      .insert({
        name,
        description: formData.description.trim() || null,
        created_by: currentUserId,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Error creating group",
        description: error.message,
        variant: "destructive",
      });
      setIsUploading(false);
      return;
    }

    const groupId = data.id;

    // Upload image if selected
    if (groupImage) {
      const imageUrl = await uploadGroupImage(groupId);
      if (imageUrl) {
        await supabase
          .from("groups")
          .update({ image_url: imageUrl })
          .eq("id", groupId);
      }
    }

    // Add creator as admin member
    const { error: memberError } = await supabase
      .from("group_members")
      .insert({
        group_id: groupId,
        user_id: currentUserId,
        role: "admin",
      });

    if (memberError) {
      toast({
        title: "Group created, but you couldn't be added to it",
        description: memberError.message,
        variant: "destructive",
      });
    }
    setIsCreating(false);
    setFormData({ name: "", description: "" });
    setGroupImage(null);
    setGroupImagePreview(null);
    setIsUploading(false);
    navigate(`/groups/${groupId}`);
  });

  const handleJoinGroup = async (e: React.MouseEvent, groupId: string) => {
    e.stopPropagation();

    if (!currentUserId || joiningId) return;
    setJoiningId(groupId);

    const { error } = await supabase
      .from("group_members")
      .insert({
        group_id: groupId,
        user_id: currentUserId,
        role: "member",
      });

    setJoiningId(null);
    if (error) {
      toast({
        title: "Error joining group",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    navigate(`/groups/${groupId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <GroupsSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />
      
      <div className="page-flush max-w-[1200px] mx-auto px-0 sm:px-4 lg:px-6 pb-6 sm:py-6 space-y-2 sm:space-y-0">
        <PageHeader
          title="Groups"
          actions={<HeaderAction icon={Plus} label="Create group" primary onClick={() => setIsCreating(true)} />}
        >
          <PageSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search groups" />
          <Chips
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All" },
              { value: "mine", label: `Your groups${myCount ? ` · ${myCount}` : ""}` },
              { value: "discover", label: "Discover" },
            ]}
          />
          {searchQuery && (
            <p className="text-sm text-muted-foreground">
              {filteredGroups.length} {filteredGroups.length === 1 ? "group" : "groups"} found for "{searchQuery}"
            </p>
          )}
        </PageHeader>

        {communityInvites.length > 0 && (
          <div className="mb-3 sm:mb-4">
            <GroupInviteCards
              invites={communityInvites}
              onAnswered={(groupId, accepted) => { void reloadInvites(); if (accepted) navigate(`/groups/${groupId}`); }}
            />
          </div>
        )}

        {/* Facebook's Groups tab: your groups with new-post badges, then their latest posts. */}
        {view === "all" && !searchQuery && currentUserId && (
          <GroupsHub groups={groups.filter((g) => g.is_member)} userId={currentUserId} />
        )}

        {filteredGroups.length === 0 ? (
          <Card className="feed-section flat-list">
            {searchQuery || view !== "all" ? (
              <EmptyState
                emoji={searchQuery ? "search" : "people"}
                title={searchQuery ? "No groups found" : view === "mine" ? "You haven't joined any groups yet" : "You've joined every group"}
                text={searchQuery ? "Try a different search, or create a new group." : "Create one, or look through all groups."}
                action={
                  <Button onClick={() => { setSearchQuery(""); setView("all"); }} variant="outline" className="rounded-full">
                    {searchQuery ? "Clear search" : "Show all groups"}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                emoji="people"
                title="No groups yet"
                text="Create a group to connect with people who share your interests."
                action={
                  <Button onClick={() => setIsCreating(true)} className="rounded-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Create a group
                  </Button>
                }
              />
            )}
          </Card>
        ) : (
          // Flat rows on the page, as in native apps: photo, name and members, then Join.
          <div className="grid grid-cols-1 gap-0.5 md:grid-cols-2 md:gap-2">
            {filteredGroups.map((group) => (
              <div
                key={group.id}
                role="link"
                tabIndex={0}
                aria-label={group.name}
                className="group flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-accent/60 active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => navigate(`/groups/${group.id}`)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    navigate(`/groups/${group.id}`);
                  }
                }}
              >
                <div
                  className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary"
                >
                  {group.image_url ? (
                    <img src={group.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-lg font-bold text-foreground" aria-hidden="true">{groupInitials(group.name)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[16px] font-semibold">{group.name}</h3>
                  <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    {/* Without the count function, only members can count a group, so hide it. */}
                    {group.member_count !== undefined && (
                      <>
                        <span>{group.member_count} {group.member_count === 1 ? "member" : "members"}</span>
                        <span>·</span>
                      </>
                    )}
                    <Globe className="h-3 w-3" />
                    <span>Public</span>
                  </div>
                  {group.description && (
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{group.description}</p>
                  )}
                </div>
                {group.is_member ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground"><Check className="h-3.5 w-3.5" aria-hidden="true" />Joined</span>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 shrink-0 rounded-full px-4"
                    onClick={(e) => handleJoinGroup(e, group.id)}
                    onKeyDown={(e) => e.stopPropagation()}
                    disabled={joiningId === group.id}
                    aria-label={`Join ${group.name}`}
                  >
                    {joiningId === group.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Join
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Create Group Dialog */}
      <Dialog open={isCreating} onOpenChange={(open) => {
        setIsCreating(open);
        if (!open) {
          setGroupImage(null);
          setGroupImagePreview(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Group</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleCreateGroup} className="space-y-4">
            {/* Group Logo Upload */}
            <div className="space-y-2">
              <Label>Group Logo (optional)</Label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={groupImagePreview ? "Change group logo" : "Add group logo"}
                className="relative h-32 w-32 mx-auto rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors cursor-pointer overflow-hidden bg-secondary/50 flex items-center justify-center"
              >
                {groupImagePreview ? (
                  <img src={groupImagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center">
                    <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground mt-1 block">Add logo</span>
                  </div>
                )}
              </button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Group Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter group name"
                maxLength={100}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What is this group about?"
                className="min-h-[100px]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreating(false)}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isUploading}>
                {isUploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Group
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Groups;
