import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import BottomNav from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Users, Search, Globe, Lock } from "lucide-react";

interface Group {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_by: string;
  member_count?: number;
}

const Groups = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

  useEffect(() => {
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (currentUserId) {
      loadGroups();
    }
  }, [currentUserId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
  };

  const loadGroups = async () => {
    setIsLoading(true);

    const { data: groupsData, error } = await supabase
      .from("groups" as any)
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

    // Load member counts for each group
    const groupsWithCounts = await Promise.all(
      (groupsData || []).map(async (group: any) => {
        const { count } = await supabase
          .from("group_members" as any)
          .select("*", { count: "exact", head: true })
          .eq("group_id", group.id);

        return { ...group, member_count: count || 0 };
      })
    );

    setGroups(groupsWithCounts as any);
    setIsLoading(false);
  };

  // Filter groups based on search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    
    const query = searchQuery.toLowerCase();
    return groups.filter(group => 
      group.name.toLowerCase().includes(query) ||
      group.description?.toLowerCase().includes(query)
    );
  }, [groups, searchQuery]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUserId) return;

    const { data, error } = await supabase
      .from("groups" as any)
      .insert({
        name: formData.name,
        description: formData.description,
        created_by: currentUserId,
      } as any)
      .select()
      .single();

    if (error) {
      toast({
        title: "Error creating group",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // Add creator as admin member
    await supabase
      .from("group_members" as any)
      .insert({
        group_id: (data as any).id,
        user_id: currentUserId,
        role: "admin",
      } as any);

    toast({
      title: "Group created successfully",
    });
    setIsCreating(false);
    setFormData({ name: "", description: "" });
    loadGroups();
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
      
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-4 sm:py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Groups</h1>
              <p className="text-sm text-muted-foreground">{groups.length} groups available</p>
            </div>
          </div>
          <Button onClick={() => setIsCreating(true)} className="sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Create Group
          </Button>
        </div>

        {/* Search Bar - Facebook Style */}
        <Card className="p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base bg-secondary border-0 focus-visible:ring-1"
            />
          </div>
          {searchQuery && (
            <p className="text-sm text-muted-foreground mt-2">
              {filteredGroups.length} {filteredGroups.length === 1 ? 'group' : 'groups'} found for "{searchQuery}"
            </p>
          )}
        </Card>

        {filteredGroups.length === 0 ? (
          <Card className="p-12 text-center">
            {searchQuery ? (
              <>
                <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold mb-2">No groups found</h2>
                <p className="text-muted-foreground mb-4">
                  Try a different search term or create a new group
                </p>
                <Button onClick={() => setSearchQuery("")} variant="outline">
                  Clear search
                </Button>
              </>
            ) : (
              <>
                <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold mb-2">No groups yet</h2>
                <p className="text-muted-foreground mb-4">
                  Create a group to connect with people who share your interests
                </p>
                <Button onClick={() => setIsCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Group
                </Button>
              </>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGroups.map((group) => (
              <Card
                key={group.id}
                className="overflow-hidden hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => navigate(`/groups/${group.id}`)}
              >
                {/* Group Cover Image */}
                <div className="h-32 bg-gradient-to-br from-primary/20 to-primary/5 relative">
                  {group.image_url ? (
                    <img
                      src={group.image_url}
                      alt={group.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Users className="h-12 w-12 text-primary/30" />
                    </div>
                  )}
                </div>
                
                {/* Group Info */}
                <div className="p-4">
                  <h3 className="text-lg font-semibold mb-1 truncate group-hover:text-primary transition-colors">
                    {group.name}
                  </h3>
                  {group.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {group.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      <span>{group.member_count || 0} members</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-4 w-4" />
                      <span>Public</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomNav currentUserId={currentUserId || undefined} />

      {/* Create Group Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Group</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Group Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter group name"
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
              >
                Cancel
              </Button>
              <Button type="submit">Create Group</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Groups;
