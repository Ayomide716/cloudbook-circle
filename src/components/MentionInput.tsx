import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "@/components/icons";
import { cn } from "@/lib/utils";
import { mentionName, mentionQueryAt, mentionTokenAt, rankPeople, type Mention, type MentionCandidate } from "@/lib/mentions";

interface MentionInputProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Classes for the box around the field (e.g. flex-1 in a row). */
  wrapperClassName?: string;
  /** Mentions keep the full name and are reported through onMention (saved with the person's id). */
  rich?: boolean;
  onMention?: (mention: Mention) => void;
  /** The people picked so far: highlighted in the text, and removed whole with Backspace. */
  mentions?: Mention[];
  /** Only these people (a group chat's members), instead of your friends and anyone on Ember. */
  candidates?: MentionCandidate[];
}

// Your friends, fetched once (they're the people you mention most), for a few minutes.
let friendsCache: { userId: string; at: number; people: MentionCandidate[] } | null = null;
async function loadFriends(): Promise<{ me: string | null; friends: MentionCandidate[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  const me = session?.user.id;
  if (!me) return { me: null, friends: [] };
  if (friendsCache && friendsCache.userId === me && Date.now() - friendsCache.at < 5 * 60_000) return { me, friends: friendsCache.people };
  const { data: links } = await supabase
    .from("friendships")
    .select("user_id, friend_id")
    .or(`user_id.eq.${me},friend_id.eq.${me}`)
    .eq("status", "accepted");
  const ids = (links ?? []).map((f) => (f.user_id === me ? f.friend_id : f.user_id));
  const { data } = ids.length ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids) : { data: [] };
  const people = (data ?? []).map((p) => ({ ...p, friend: true }));
  friendsCache = { userId: me, at: Date.now(), people };
  return { me, friends: people };
}

/**
 * A text box where typing @ suggests people: your friends first, then anyone on Ember. Arrow keys
 * and Enter (or Tab) pick, Esc closes. Picked names are highlighted and Backspace removes them
 * whole. Takes any textarea prop (ref, onKeyDown, rows…).
 */
const MentionInput = forwardRef<HTMLTextAreaElement, MentionInputProps>(({
  value, onChange, placeholder, className, disabled, rich, onMention, mentions = [], wrapperClassName, onKeyDown, onScroll, candidates, ...rest
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [people, setPeople] = useState<MentionCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  // Above the field when there's room (a comment box at the bottom), below it otherwise.
  const [above, setAbove] = useState(true);

  const open = query !== null;
  // Where the caret goes once the new text is in the field (after picking or removing a name).
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el && pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value]);

  // Friends straight away (even for a bare "@"), then others on Ember as you type more.
  useEffect(() => {
    if (!query) { setPeople([]); return; }
    let cancelled = false;
    const q = query.query.trim();
    setLoading(true);
    if (candidates) {
      setPeople(rankPeople(candidates, q, 6));
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      const { me, friends } = await loadFriends();
      if (cancelled) return;
      const mine = rankPeople(friends, q, 6);
      setPeople(mine);
      if (q.length >= 2 && mine.length < 6) {
        const { data } = await supabase.from("profiles").select("id, full_name, avatar_url").ilike("full_name", `%${q.replace(/[%_]/g, "")}%`).limit(8);
        if (cancelled) return;
        // Never yourself.
        setPeople(rankPeople([...friends, ...(data ?? []).filter((p) => p.id !== me)], q, 6));
      }
      setLoading(false);
    }, q ? 150 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, candidates]);
  useEffect(() => setActive(0), [query?.query]);

  const syncQuery = (text: string, caret: number) => {
    const q = mentionQueryAt(text, caret);
    setQuery(q);
    if (q && textareaRef.current) {
      const rect = textareaRef.current.getBoundingClientRect();
      setAbove(rect.top > 280);
    }
  };

  const pick = (p: MentionCandidate) => {
    const el = textareaRef.current;
    if (!el || !query) return;
    const caret = el.selectionStart ?? value.length;
    const name = rich ? mentionName(p.full_name) : (p.full_name || "User").replace(/\s+/g, "");
    const next = `${value.slice(0, query.start)}@${name} ${value.slice(caret)}`;
    onChange(next);
    if (rich) onMention?.({ id: p.id, name });
    setQuery(null);
    pendingCaret.current = query.start + name.length + 2;
    el.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && people.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % people.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + people.length) % people.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(people[active]); return; }
    }
    if (open && e.key === "Escape") { e.preventDefault(); setQuery(null); return; }
    // Backspace at the end of a picked name removes the whole name.
    if (e.key === "Backspace" && rich && mentions.length) {
      const el = e.currentTarget;
      if (el.selectionStart === el.selectionEnd) {
        const token = mentionTokenAt(value, el.selectionStart ?? 0, mentions);
        if (token) {
          e.preventDefault();
          pendingCaret.current = token.start;
          onChange(value.slice(0, token.start) + value.slice(token.end));
          return;
        }
      }
    }
    onKeyDown?.(e);
  };

  // Picked names, highlighted: a copy of the text behind-the-scenes with the names marked,
  // laid exactly over the field.
  const marked = rich && mentions.length > 0;
  useLayoutEffect(() => {
    if (marked && mirrorRef.current && textareaRef.current) mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
  });
  const highlighted = (() => {
    if (!marked) return null;
    const names = mentions.map((m) => `@${m.name}`).sort((a, b) => b.length - a.length);
    const parts: React.ReactNode[] = [];
    let i = 0;
    while (i < value.length) {
      const hit = names.find((n) => value.startsWith(n, i));
      if (hit) { parts.push(<mark key={i} className="rounded bg-primary/15 text-transparent">{hit}</mark>); i += hit.length; }
      else { const next = names.reduce((min, n) => { const j = value.indexOf(n, i + 1); return j > 0 && j < min ? j : min; }, value.length); parts.push(value.slice(i, next)); i = next; }
    }
    return parts;
  })();

  return (
    <div className={cn("relative", wrapperClassName)}>
      <Textarea
        {...rest}
        ref={textareaRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); syncQuery(e.target.value, e.target.selectionStart ?? 0); }}
        onKeyDown={handleKeyDown}
        onClick={(e) => syncQuery(value, e.currentTarget.selectionStart ?? 0)}
        onBlur={(e) => { rest.onBlur?.(e); window.setTimeout(() => setQuery(null), 150); }}
        onScroll={(e) => { onScroll?.(e); if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop; }}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        role="combobox"
        aria-expanded={open && people.length > 0}
        aria-autocomplete="list"
        aria-controls={open ? "mention-suggestions" : undefined}
        aria-activedescendant={open && people[active] ? `mention-${people[active].id}` : undefined}
      />
      {marked && (
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className={cn(
            // The Textarea's own box, so the copy lines up letter for letter.
            "flex min-h-[80px] w-full rounded-md border border-input px-3 py-2 text-sm",
            className,
            "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border-transparent bg-transparent text-transparent"
          )}
        >
          <span className="block w-full">{highlighted}{"​"}</span>
        </div>
      )}
      {open && (loading || people.length > 0 || query.query.trim().length >= 2) && (
        <div
          id="mention-suggestions"
          role="listbox"
          aria-label="People to mention"
          className={cn(
            "absolute inset-x-0 z-50 max-h-[260px] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-1 shadow-xl animate-in fade-in-0 zoom-in-95 duration-150",
            above ? "bottom-full mb-1.5 origin-bottom" : "top-full mt-1.5 origin-top"
          )}
          data-vaul-no-drag=""
        >
          {people.map((p, i) => (
            <button
              key={p.id}
              id={`mention-${p.id}`}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors", i === active ? "bg-accent" : "hover:bg-accent/60")}
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={p.avatar_url || undefined} alt="" className="object-cover" />
                <AvatarFallback className="bg-secondary text-xs">{p.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{p.full_name || "Someone"}</span>
                <span className="block text-xs text-muted-foreground">{p.friend ? "Friend" : "On Ember"}</span>
              </span>
            </button>
          ))}
          {loading && people.length === 0 && (
            <div className="space-y-1 p-1" aria-label="Looking for people">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-3 px-1.5 py-1.5">
                  <span className="h-9 w-9 animate-pulse rounded-full bg-secondary" />
                  <span className="h-3.5 w-1/2 animate-pulse rounded bg-secondary" />
                </div>
              ))}
            </div>
          )}
          {!loading && people.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">No one found for “{query.query.trim()}”</p>
          )}
          {loading && people.length > 0 && <Loader2 className="mx-auto my-1 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
});

MentionInput.displayName = "MentionInput";

export default MentionInput;
