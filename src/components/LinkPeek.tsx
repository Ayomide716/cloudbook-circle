import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MapPin, MessageCircle } from "@/components/icons";
import { haptic } from "@/lib/haptics";
import { plainMentions } from "@/lib/mentions";
import { shortTime } from "@/lib/time";

const HOLD_MS = 450;
const MOVE_SLOP = 10;

type Peek = { kind: "profile" | "post"; id: string; href: string };
type ProfilePeek = { id: string; full_name: string | null; avatar_url: string | null; cover_url: string | null; bio: string | null; location: string | null };
type PostPeek = {
  id: string; content: string | null; image_url: string | null; image_urls: string[] | null; created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

/** The profile or post a link points to, if it's one we can preview. */
function peekFor(href: string | null): Peek | null {
  if (!href) return null;
  const m = href.match(/^\/(profile|post)\/([0-9a-f-]{36})$/i);
  return m ? { kind: m[1] as Peek["kind"], id: m[2], href } : null;
}

/**
 * Hold a link to someone's profile or to a post for a moment to peek at it in a sheet, without
 * leaving the page (as Instagram does). Let go and tap "View" to open it. Touch only.
 */
const LinkPeek = () => {
  const navigate = useNavigate();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [profile, setProfile] = useState<ProfilePeek | null>(null);
  const [post, setPost] = useState<PostPeek | null>(null);
  const [loading, setLoading] = useState(false);
  const swallowClick = useRef(false);

  useEffect(() => {
    let timer = 0;
    let start: { x: number; y: number } | null = null;
    const cancel = () => { window.clearTimeout(timer); start = null; };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !e.isPrimary) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      const target = peekFor(link?.getAttribute("href") ?? null);
      if (!target || link?.closest("[data-no-peek]")) return;
      start = { x: e.clientX, y: e.clientY };
      timer = window.setTimeout(() => {
        start = null;
        swallowClick.current = true;
        haptic(15);
        setPeek(target);
      }, HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_SLOP) cancel();
    };
    // The tap that follows a hold must not also open the link.
    const click = (e: MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const menu = (e: Event) => { if (peekFor((e.target as Element | null)?.closest?.("a[href]")?.getAttribute("href") ?? null)) e.preventDefault(); };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", cancel, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("click", click, true);
    document.addEventListener("contextmenu", menu, true);
    return () => {
      cancel();
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", cancel, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("contextmenu", menu, true);
    };
  }, []);

  useEffect(() => {
    setProfile(null);
    setPost(null);
    if (!peek) return;
    setLoading(true);
    let cancelled = false;
    // A click that never came (the finger lifted off the link) mustn't swallow the next tap.
    const reset = window.setTimeout(() => { swallowClick.current = false; }, 600);
    (async () => {
      if (peek.kind === "profile") {
        const { data } = await supabase.from("profiles").select("id, full_name, avatar_url, cover_url, bio, location").eq("id", peek.id).maybeSingle();
        if (!cancelled) setProfile(data as ProfilePeek | null);
      } else {
        const { data } = await supabase
          .from("posts")
          .select("id, content, image_url, image_urls, created_at, profiles:user_id (full_name, avatar_url)")
          .eq("id", peek.id)
          .maybeSingle();
        if (!cancelled) setPost(data as unknown as PostPeek | null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; window.clearTimeout(reset); };
  }, [peek]);

  const open = (href: string) => { setPeek(null); navigate(href); };
  const photo = post?.image_urls?.[0] ?? post?.image_url ?? null;

  return (
    <Drawer open={!!peek} onOpenChange={(o) => !o && setPeek(null)}>
      <DrawerContent aria-describedby={undefined}>
        <DrawerTitle className="sr-only">{peek?.kind === "post" ? "Post preview" : "Profile preview"}</DrawerTitle>
        <DrawerDescription className="sr-only">A quick look without leaving the page.</DrawerDescription>
        <div className="overflow-y-auto px-4 pb-4 pt-3">
          {peek && loading && (
            <div className="space-y-3 py-2" aria-label="Loading">
              <div className="flex items-center gap-3">
                <span className="h-14 w-14 animate-pulse rounded-full bg-secondary" />
                <span className="h-4 w-1/2 animate-pulse rounded bg-secondary" />
              </div>
              <span className="block h-24 animate-pulse rounded-2xl bg-secondary" />
            </div>
          )}

          {profile && (
            <div className="animate-in fade-in-0 duration-200">
              <div className="relative mb-12 h-28 overflow-hidden rounded-2xl bg-secondary">
                {profile.cover_url && <img src={profile.cover_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <Avatar className="-mt-[5.5rem] ml-3 h-20 w-20 border-4 border-card">
                <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="bg-secondary text-2xl">{profile.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              <p className="mt-2 text-xl font-bold">{profile.full_name || "Someone"}</p>
              {profile.location && <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" /> {profile.location}</p>}
              {profile.bio && <p className="mt-2 line-clamp-3 text-[15px]">{profile.bio}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button className="h-11" onClick={() => open(`/profile/${profile.id}`)}>View profile</Button>
                <Button variant="secondary" className="h-11" onClick={() => open(`/messages?user=${profile.id}`)}>
                  <MessageCircle className="h-4 w-4" /> Message
                </Button>
              </div>
            </div>
          )}

          {post && (
            <div className="animate-in fade-in-0 duration-200">
              <div className="mb-3 flex items-center gap-2.5">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={post.profiles?.avatar_url || undefined} className="object-cover" />
                  <AvatarFallback className="bg-secondary">{post.profiles?.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{post.profiles?.full_name || "Someone"}</p>
                  <p className="text-[13px] text-muted-foreground">{shortTime(post.created_at)}</p>
                </div>
              </div>
              {post.content && <p className="mb-3 line-clamp-6 whitespace-pre-wrap text-[15px]">{plainMentions(post.content)}</p>}
              {photo && <img src={photo} alt="" className="mb-3 max-h-[45dvh] w-full rounded-2xl object-cover" />}
              <Button className="h-11 w-full" onClick={() => open(`/post/${post.id}`)}>View post</Button>
            </div>
          )}

          {peek && !loading && !profile && !post && (
            <p className="py-6 text-center text-sm text-muted-foreground">This isn't available any more.</p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default LinkPeek;
