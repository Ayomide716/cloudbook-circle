import { PageHeader } from "@/components/layout/PageHeader";
import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Shield, Flag, Users, FileText, AlertTriangle, CheckCircle, Trash2, Eye, X } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import MoveMediaCard from "@/components/MoveMediaCard";
import StorageStatusCard from "@/components/StorageStatusCard";
import PushTestCard from "@/components/PushTestCard";
import { formatDistanceToNow } from "date-fns";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface Report {
  id: string;
  reporter_id: string;
  reported_id: string;
  reported_type: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  created_at: string | null;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [pendingDeletePost, setPendingDeletePost] = useState<Report | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalUsers: 0, totalPosts: 0, totalReports: 0, pendingReports: 0 });

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setCurrentUserId(session.user.id);

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setIsAdmin(true);
    await Promise.all([fetchReports(), fetchUsers(), fetchStats()]);
    setLoading(false);
  });

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const fetchReports = async () => {
    const { data } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    // Admins can read every report via the "Admins can view all reports" RLS policy.
    setReports((data as Report[]) || []);
  };

  const fetchUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setUsers((data as UserProfile[]) || []);
  };

  const fetchStats = async () => {
    const [usersRes, postsRes] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("posts").select("id", { count: "exact", head: true }),
    ]);
    setStats({
      totalUsers: usersRes.count || 0,
      totalPosts: postsRes.count || 0,
      totalReports: 0,
      pendingReports: 0,
    });
  };

  const setReportStatus = async (report: Report, status: "resolved" | "dismissed") => {
    const { error } = await supabase.from("reports").update({ status }).eq("id", report.id);
    if (error) {
      toast({ title: "Couldn't update the report", variant: "destructive" });
      return false;
    }
    setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status } : r)));
    return true;
  };

  const handleDeletePost = async (report: Report) => {
    setPendingDeletePost(null);
    const { error } = await supabase.from("posts").delete().eq("id", report.reported_id);
    if (error) {
      toast({ title: "Cannot delete this post", description: error.message, variant: "destructive" });
      return;
    }
    await setReportStatus(report, "resolved");
    toast({ title: "Post removed and report resolved" });
  };

  /** Where the reported thing lives (the id is a post's, reel's or person's, depending on the type). */
  const reportedPath = (report: Report) =>
    report.reported_type === "post" ? `/post/${report.reported_id}`
    : report.reported_type === "reel" ? `/reels/${report.reported_id}`
    : report.reported_type === "profile" ? `/profile/${report.reported_id}`
    : null;

  if (loading) return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 rounded-lg bg-primary" />
      </div>
    </div>
  );

  if (isAdmin === false) return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium">Access Denied</p>
        <p className="text-sm text-muted-foreground">You need admin privileges to view this page.</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />

      <div className="max-w-5xl mx-auto px-4 py-6 mb-20 space-y-6">
        <PageHeader back title="Admin Dashboard" className="!mb-0 !pb-0" />

        {/* Is uploading to Cloudflare R2 working, and where did the last upload go. */}
        <StorageStatusCard />
        <PushTestCard />
        <MoveMediaCard />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4 text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{stats.totalUsers}</p>
            <p className="text-xs text-muted-foreground">Total Users</p>
          </Card>
          <Card className="p-4 text-center">
            <FileText className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold">{stats.totalPosts}</p>
            <p className="text-xs text-muted-foreground">Total Posts</p>
          </Card>
          <Card className="p-4 text-center">
            <Flag className="h-5 w-5 mx-auto mb-1 text-orange-500" />
            <p className="text-2xl font-bold">{reports.length}</p>
            <p className="text-xs text-muted-foreground">Reports</p>
          </Card>
          <Card className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-destructive" />
            <p className="text-2xl font-bold">{reports.filter(r => r.status === 'pending').length}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </Card>
        </div>

        <Tabs defaultValue="reports">
          <TabsList className="w-full">
            <TabsTrigger value="reports" className="flex-1">Reports</TabsTrigger>
            <TabsTrigger value="users" className="flex-1">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-3 mt-4">
            {reports.length === 0 ? (
              <Card className="p-8 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                <p className="text-lg font-medium">No reports to review</p>
                <p className="text-sm text-muted-foreground">Everything looks good!</p>
              </Card>
            ) : (
              reports.map((report) => (
                <Card key={report.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={report.status === "pending" ? "destructive" : "secondary"}>
                          {report.status}
                        </Badge>
                        <Badge variant="outline">{report.reported_type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="font-medium text-sm">{report.reason}</p>
                      {report.description && (
                        <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {reportedPath(report) && (
                        <Button variant="ghost" size="icon" onClick={() => navigate(reportedPath(report)!)} title="View" aria-label={`View reported ${report.reported_type}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {report.reported_type === "post" && report.status === "pending" && (
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setPendingDeletePost(report)} title="Delete post" aria-label="Delete reported post">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {report.status === "pending" && (
                        <>
                          <Button variant="ghost" size="icon" className="text-green-600" onClick={() => setReportStatus(report, "resolved")} title="Mark resolved" aria-label="Mark resolved">
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setReportStatus(report, "dismissed")} title="Dismiss" aria-label="Dismiss report">
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <ConfirmDialog
            open={!!pendingDeletePost}
            onOpenChange={(open) => !open && setPendingDeletePost(null)}
            title="Delete the reported post?"
            description="The post is removed for everyone and the report is marked resolved."
            onConfirm={() => pendingDeletePost && handleDeletePost(pendingDeletePost)}
          />

          <TabsContent value="users" className="space-y-2 mt-4">
            {users.map((user) => (
              <Card key={user.id} className="p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback>{user.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{user.full_name || "Anonymous"}</p>
                      {user.is_verified && <Badge variant="secondary" className="text-xs">Verified</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Joined {user.created_at ? formatDistanceToNow(new Date(user.created_at), { addSuffix: true }) : "unknown"}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/profile/${user.id}`)}>
                    View
                  </Button>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
