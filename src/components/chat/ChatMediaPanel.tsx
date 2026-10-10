import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ArrowLeft, Link2, Loader2, Play, Star, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import PhotoViewer from "@/components/PhotoViewer";
import VoiceMessagePlayer from "@/components/VoiceMessagePlayer";
import { firstLink } from "@/lib/links";
import { displayUrl, safeWebsiteUrl } from "@/lib/safe-url";
import { useStarred, type ChatKind } from "@/lib/starred";
import { cn } from "@/lib/utils";

/** A message from either kind of chat, in one shape. */
export interface GalleryItem {
  id: string;
  chatKind: ChatKind;
  /** The other person (one-to-one) or the group. */
  chatId: string;
  senderId: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

export type GalleryTab = "media" | "links" | "voice" | "starred";

export type GalleryScope =
  | { kind: "dm"; otherId: string }
  | { kind: "group"; groupId: string }
  /** Every starred message, from all your chats. */
  | { kind: "starred" };

interface ChatMediaPanelProps {
  scope: GalleryScope;
  currentUserId: string;
  initialTab?: GalleryTab;
  onClose: () => void;
  /** Opens the chat at that message. */
  onJump: (item: GalleryItem) => void;
}

const LIMIT = 500;
const isVoice = (i: GalleryItem) => !!i.imageUrl && i.content.startsWith("🎤");
const isMedia = (i: GalleryItem) => !!i.imageUrl && !isVoice(i);
const isVideo = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url);
const voiceSeconds = (content: string) => {
  const m = content.match(/\((\d+):(\d{2})\)\s*$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};
const PLACEHOLDERS = ["📷 Photo", "🎥 Video", "GIF", "Sent an image"];

type Row = { id: string; content: string; image_url: string | null; created_at: string | null };
const fromDm = (me: string) => (m: Row & { sender_id: string; receiver_id: string }): GalleryItem => ({
  id: m.id, chatKind: "dm", chatId: m.sender_id === me ? m.receiver_id : m.sender_id, senderId: m.sender_id,
  content: m.content, imageUrl: m.image_url, createdAt: m.created_at ?? "",
});
const fromGroup = (m: Row & { user_id: string; group_id: string }): GalleryItem => ({
  id: m.id, chatKind: "group", chatId: m.group_id, senderId: m.user_id,
  content: m.content, imageUrl: m.image_url, createdAt: m.created_at ?? "",
});

/** Groups items under month headings ("October 2026"), newest first. */
const byMonth = (items: GalleryItem[]) => {
  const out: { month: string; items: GalleryItem[] }[] = [];
  for (const i of items) {
    const month = format(new Date(i.createdAt), "MMMM yyyy");
    if (out[out.length - 1]?.month !== month) out.push({ month, items: [] });
    out[out.length - 1].items.push(i);
  }
  return out;
};

/**
 * A chat's photos and videos, links, voice notes and starred messages, as in WhatsApp's
 * "Media, links and docs" (or every starred message, from the chat list).
 */
const ChatMediaPanel = ({ scope, currentUserId, initialTab = "media", onClose, onJump }: ChatMediaPanelProps) => {
  const { starred, version } = useStarred(currentUserId);
  const [tab, setTab] = useState<GalleryTab>(scope.kind === "starred" ? "starred" : initialTab);
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [starredItems, setStarredItems] = useState<GalleryItem[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<number | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const asked = useRef(new Set<string>());
  // The scope as plain values, so a new (but equal) scope object doesn't reload everything.
  const scopeKind = scope.kind;
  const scopeId = scope.kind === "dm" ? scope.otherId : scope.kind === "group" ? scope.groupId : "";

  // The chat's recent messages (for media, links and voice notes).
  useEffect(() => {
    if (scopeKind === "starred") { setItems([]); return; }
    let cancelled = false;
    (async () => {
      if (scopeKind === "dm") {
        const { data } = await supabase
          .from("messages")
          .select("id, sender_id, receiver_id, content, image_url, created_at, deleted_at")
          .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${scopeId}),and(sender_id.eq.${scopeId},receiver_id.eq.${currentUserId})`)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(LIMIT);
        if (!cancelled) setItems((data ?? []).map(fromDm(currentUserId)));
      } else {
        const { data } = await supabase
          .from("group_messages")
          .select("id, user_id, group_id, content, image_url, created_at")
          .eq("group_id", scopeId)
          .order("created_at", { ascending: false })
          .limit(LIMIT);
        if (!cancelled) setItems((data ?? []).map(fromGroup));
      }
    })();
    return () => { cancelled = true; };
  }, [scopeKind, scopeId, currentUserId]);

  // Starred messages, wherever they are (a chat's older ones too).
  const starredKey = [...starred.keys()].sort().join(",");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dmIds = [...starred].filter(([, k]) => k === "dm").map(([id]) => id);
      const groupIds = [...starred].filter(([, k]) => k === "group").map(([id]) => id);
      const wantDm = scopeKind !== "group" && dmIds.length > 0;
      const wantGroup = scopeKind !== "dm" && groupIds.length > 0;
      const [dm, group] = await Promise.all([
        wantDm ? supabase.from("messages").select("id, sender_id, receiver_id, content, image_url, created_at, deleted_at").in("id", dmIds).is("deleted_at", null) : Promise.resolve({ data: [] }),
        wantGroup ? supabase.from("group_messages").select("id, user_id, group_id, content, image_url, created_at").in("id", groupIds) : Promise.resolve({ data: [] }),
      ]);
      let list = [
        ...((dm.data ?? []) as Parameters<ReturnType<typeof fromDm>>[0][]).map(fromDm(currentUserId)),
        ...((group.data ?? []) as Parameters<typeof fromGroup>[0][]).map(fromGroup),
      ];
      if (scopeKind !== "starred") list = list.filter((i) => i.chatKind === scopeKind && i.chatId === scopeId);
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (!cancelled) setStarredItems(list);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- starredKey stands for the starred list
  }, [scopeKind, scopeId, currentUserId, starredKey, version]);

  // Names of the people (and, for all starred messages, the groups) shown.
  useEffect(() => {
    const all = [...(items ?? []), ...(starredItems ?? [])];
    // Each name is looked up once.
    const people = [...new Set(all.map((i) => i.senderId).concat(all.filter((i) => i.chatKind === "dm").map((i) => i.chatId)))].filter((id) => !asked.current.has(id));
    const groups = [...new Set(all.filter((i) => i.chatKind === "group").map((i) => i.chatId))].filter((id) => !asked.current.has(`g:${id}`));
    if (!people.length && !groups.length) return;
    people.forEach((id) => asked.current.add(id));
    groups.forEach((id) => asked.current.add(`g:${id}`));
    (async () => {
      const [{ data: profiles }, { data: gs }] = await Promise.all([
        people.length ? supabase.from("profiles").select("id, full_name").in("id", people) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
        groups.length ? supabase.from("groups").select("id, name").in("id", groups) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      setNames((prev) => ({
        ...prev,
        ...Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || "Anonymous"])),
        ...Object.fromEntries((gs ?? []).map((g) => [`g:${g.id}`, g.name])),
      }));
    })();
  }, [items, starredItems]);

  const nameOf = (id: string) => (id === currentUserId ? "You" : names[id] ?? "…");
  const media = useMemo(() => (items ?? []).filter(isMedia), [items]);
  const photos = useMemo(() => media.filter((i) => !isVideo(i.imageUrl!)), [media]);
  const links = useMemo(() => (items ?? []).filter((i) => !isVoice(i) && firstLink(i.content)), [items]);
  const voice = useMemo(() => (items ?? []).filter(isVoice), [items]);

  const tabs: { key: GalleryTab; label: string; count: number | null }[] = [
    { key: "media", label: "Media", count: items ? media.length : null },
    { key: "links", label: "Links", count: items ? links.length : null },
    { key: "voice", label: "Voice", count: items ? voice.length : null },
    { key: "starred", label: "Starred", count: starredItems ? starredItems.length : null },
  ];
  const loading = tab === "starred" ? starredItems === null : items === null;

  const empty = (text: string) => <p className="px-8 py-16 text-center text-sm text-muted-foreground">{text}</p>;

  // Portalled to the page itself, so it sits over the app's bars (the page has its own layer).
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in-0 slide-in-from-right-10 duration-200 md:inset-y-6 md:left-1/2 md:right-auto md:w-[640px] md:-translate-x-1/2 md:rounded-2xl md:border md:shadow-2xl">
      <div className="flex flex-shrink-0 items-center gap-1 px-1.5 pb-1 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-6" aria-label="Back" onClick={onClose}>
          <ArrowLeft />
        </Button>
        <h2 className="text-lg font-semibold">{scope.kind === "starred" ? "Starred messages" : "Media, links and voice"}</h2>
      </div>
      {scope.kind !== "starred" && (
        <div role="tablist" className="flex flex-shrink-0 border-b px-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 border-b-2 px-1 py-2.5 text-sm font-semibold transition-colors",
                tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.count ? <span className="ml-1 text-xs font-normal opacity-75">{t.count}</span> : null}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : tab === "media" ? (
          media.length === 0 ? empty("Photos, videos and GIFs shared in this chat show up here.") : byMonth(media).map((g) => (
            <section key={g.month}>
              <h3 className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.month}</h3>
              <div className="grid grid-cols-3 gap-0.5 sm:grid-cols-4">
                {g.items.map((i) => {
                  const vid = isVideo(i.imageUrl!);
                  return (
                    <button
                      key={i.id}
                      type="button"
                      className="relative aspect-square overflow-hidden bg-secondary"
                      aria-label={vid ? "Play video" : "Open photo"}
                      onClick={() => (vid ? setVideo(i.imageUrl) : setViewer(photos.findIndex((p) => p.id === i.id)))}
                    >
                      {vid ? (
                        <video src={`${i.imageUrl}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                      ) : (
                        <img src={i.imageUrl!} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                      {vid && <span className="absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"><Play className="h-3 w-3 fill-white" /></span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        ) : tab === "links" ? (
          links.length === 0 ? empty("Links shared in this chat show up here.") : (
            <ul className="divide-y">
              {links.map((i) => {
                const href = safeWebsiteUrl(firstLink(i.content));
                return (
                  <li key={i.id}>
                    <a href={href ?? undefined} target="_blank" rel="noopener noreferrer" className="flex gap-3 px-4 py-3 hover:bg-secondary/60">
                      <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Link2 className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-primary">{href ? displayUrl(href) : "Link"}</span>
                        <span className="line-clamp-2 text-sm text-muted-foreground">{i.content}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{nameOf(i.senderId)} · {format(new Date(i.createdAt), "d MMM yyyy")}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )
        ) : tab === "voice" ? (
          voice.length === 0 ? empty("Voice messages in this chat show up here.") : (
            <ul className="space-y-2 p-3">
              {voice.map((i) => (
                <li key={i.id} className="rounded-xl border bg-card p-2.5">
                  <p className="mb-1 flex justify-between px-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{nameOf(i.senderId)}</span>
                    <span>{format(new Date(i.createdAt), "d MMM yyyy, HH:mm")}</span>
                  </p>
                  <VoiceMessagePlayer audioUrl={i.imageUrl!} duration={voiceSeconds(i.content)} isOwnMessage={false} />
                </li>
              ))}
            </ul>
          )
        ) : (starredItems ?? []).length === 0 ? (
          <div className="flex flex-col items-center px-8 py-16 text-center">
            <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary"><Star className="h-7 w-7" /></span>
            <p className="font-semibold">No starred messages</p>
            <p className="mt-1 text-sm text-muted-foreground">Press and hold a message and tap Star to find it here later.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {(starredItems ?? []).map((i) => {
              const where = i.chatKind === "group" ? names[`g:${i.chatId}`] : i.senderId === currentUserId ? names[i.chatId] : "You";
              const text = isVoice(i) ? "🎤 Voice message" : i.imageUrl && PLACEHOLDERS.includes(i.content) ? "" : i.content;
              return (
                <li key={i.id}>
                  <button type="button" onClick={() => onJump(i)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-secondary/60">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="truncate font-semibold text-foreground">{nameOf(i.senderId)}</span>
                        {scope.kind === "starred" && where && (
                          <>
                            <span aria-hidden="true">▸</span>
                            {i.chatKind === "group" && <Users className="h-3 w-3 flex-shrink-0" />}
                            <span className="truncate">{where}</span>
                          </>
                        )}
                        <span className="ml-auto flex-shrink-0 pl-2">{format(new Date(i.createdAt), "d MMM yyyy")}</span>
                      </span>
                      {text && <span className="mt-0.5 line-clamp-3 block whitespace-pre-wrap break-words text-[15px]">{text}</span>}
                      {!text && i.imageUrl && !isVoice(i) && <span className="mt-0.5 block text-[15px] text-muted-foreground">{isVideo(i.imageUrl) ? "🎥 Video" : "📷 Photo"}</span>}
                    </span>
                    {i.imageUrl && !isVoice(i) && !isVideo(i.imageUrl) && (
                      <img src={i.imageUrl} alt="" loading="lazy" className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" />
                    )}
                    <Star className="mt-0.5 h-4 w-4 flex-shrink-0 fill-amber-400 text-amber-400" aria-label="Starred" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PhotoViewer images={photos.map((p) => p.imageUrl!)} index={viewer} onIndexChange={setViewer} />
      {video && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95" onClick={() => setVideo(null)}>
          <button type="button" aria-label="Close video" className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-full bg-white/15 p-2 text-white" onClick={() => setVideo(null)}>
            <X className="h-6 w-6" />
          </button>
          <video src={video} controls autoPlay playsInline className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>,
    document.body
  );
};

export default ChatMediaPanel;
