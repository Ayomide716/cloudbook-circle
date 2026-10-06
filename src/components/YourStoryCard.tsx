import { useEffect, useState } from "react";
import { FileText, Heart, Plus, Users, Eye } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { compactCount } from "@/lib/time";

interface YourStoryCardProps {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  /** Opens your stories if you have any, otherwise "Create story". */
  onOpen: () => void;
}

interface Stats {
  posts: number;
  likes: number;
  friends: number;
  views: number;
}

/** Your own numbers at a glance, next to "Create a story": posts, likes, friends, story views. */
const YourStoryCard = ({ userId, name, avatarUrl, onOpen }: YourStoryCardProps) => {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [posts, likes, friends, views] = await Promise.all([
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("reactions").select("id, posts!inner(user_id)", { count: "exact", head: true }).eq("posts.user_id", userId),
        supabase.from("friendships").select("id", { count: "exact", head: true }).eq("status", "accepted").or(`user_id.eq.${userId},friend_id.eq.${userId}`),
        supabase.from("story_views").select("id, stories!inner(user_id)", { count: "exact", head: true }).eq("stories.user_id", userId),
      ]);
      if (!cancelled) {
        setStats({ posts: posts.count ?? 0, likes: likes.count ?? 0, friends: friends.count ?? 0, views: views.count ?? 0 });
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const tiles = [
    { icon: FileText, label: "Posts", value: stats?.posts, color: "text-primary" },
    { icon: Heart, label: "Likes", value: stats?.likes, color: "text-rose-400" },
    { icon: Users, label: "Friends", value: stats?.friends, color: "text-primary" },
    { icon: Eye, label: "Views", value: stats?.views, color: "text-amber-400" },
  ];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Your story"
      className="flex-shrink-0 w-[118px] h-[184px] rounded-2xl border border-border bg-card p-2 text-left flex flex-col transition-transform duration-200 active:scale-[0.98]"
    >
      <div className="flex flex-col items-center">
        <div className="relative rounded-full p-[2px] bg-primary shadow-[0_0_14px_hsl(var(--primary)/0.5)]">
          <Avatar className="h-11 w-11 border-2 border-card">
            <AvatarImage src={avatarUrl || undefined} alt="" />
            <AvatarFallback className="text-sm font-semibold">{name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary ring-2 ring-card">
            <Plus className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
          </span>
        </div>
        <p className="mt-1 w-full truncate text-center text-[12px] font-semibold">{name || "You"}</p>
      </div>
      <div className="mt-1 grid flex-1 grid-cols-2 gap-1">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-secondary/60 px-1.5 py-1">
            <t.icon className={`h-3 w-3 ${t.color}`} aria-hidden="true" />
            <p className="text-[12px] font-bold leading-tight">{t.value === undefined ? "–" : compactCount(t.value)}</p>
            <p className="text-[9px] leading-tight text-muted-foreground">{t.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-center text-[12px] font-semibold">Your Story</p>
    </button>
  );
};

export default YourStoryCard;
