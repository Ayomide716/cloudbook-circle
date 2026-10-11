import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ArrowLeft, User, FileText, Users, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EmptyState from "@/components/EmptyState";

interface SearchResult {
  type: "user" | "post" | "group";
  id: string;
  title: string;
  avatar?: string | null;
}

interface MobileSearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileSearchOverlay({ open, onClose }: MobileSearchOverlayProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // Before you type: people you aren't friends with yet, and groups to look at.
  const [people, setPeople] = useState<{ id: string; full_name: string | null; avatar_url: string | null }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; image_url: string | null }[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const me = session?.user.id;
      if (!me) return;
      const [friendships, profiles, groupRows] = await Promise.all([
        supabase.from("friendships").select("user_id, friend_id").or(`user_id.eq.${me},friend_id.eq.${me}`),
        supabase.from("profiles").select("id, full_name, avatar_url").neq("id", me).order("created_at", { ascending: false }).limit(20),
        supabase.from("groups").select("id, name, image_url").order("created_at", { ascending: false }).limit(4),
      ]);
      if (cancelled) return;
      const known = new Set((friendships.data ?? []).map((f) => (f.user_id === me ? f.friend_id : f.user_id)));
      setPeople((profiles.data ?? []).filter((p) => !known.has(p.id)).slice(0, 8));
      setGroups(groupRows.data ?? []);
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (open) {
      // Use requestAnimationFrame for better iOS Safari focus support
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      const saved = localStorage.getItem("recent_searches");
      if (saved) {
        try { setRecentSearches(JSON.parse(saved)); } catch { localStorage.removeItem("recent_searches"); }
      }
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timeout = setTimeout(() => search(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const search = async (q: string) => {
    setLoading(true);
    const lower = `%${q.toLowerCase()}%`;
    const [profiles, posts, groups] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url").ilike("full_name", lower).limit(5),
      supabase.from("posts").select("id, content").ilike("content", lower).limit(5),
      supabase.from("groups").select("id, name, image_url").ilike("name", lower).limit(5),
    ]);
    setResults([
      ...(profiles.data || []).map((p) => ({ type: "user" as const, id: p.id, title: p.full_name || "User", avatar: p.avatar_url })),
      ...(posts.data || []).map((p) => ({ type: "post" as const, id: p.id, title: p.content.substring(0, 60) + (p.content.length > 60 ? "..." : "") })),
      ...(groups.data || []).map((g) => ({ type: "group" as const, id: g.id, title: g.name, avatar: g.image_url })),
    ]);
    setLoading(false);
  };

  const saveRecentSearch = (term: string) => {
    const updated = [term, ...recentSearches.filter((s) => s !== term)].slice(0, 8);
    setRecentSearches(updated);
    localStorage.setItem("recent_searches", JSON.stringify(updated));
  };

  const handleSelect = (item: SearchResult) => {
    saveRecentSearch(item.title);
    onClose();
    switch (item.type) {
      case "user": navigate(`/profile/${item.id}`); break;
      case "post": navigate(`/post/${item.id}`); break;
      case "group": navigate(`/groups/${item.id}`); break;
    }
  };

  const handleRecentClick = (term: string) => {
    setQuery(term);
  };

  const removeRecent = (term: string) => {
    const updated = recentSearches.filter((s) => s !== term);
    setRecentSearches(updated);
    localStorage.setItem("recent_searches", JSON.stringify(updated));
  };

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const clearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem("recent_searches");
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "user": return <User className="h-4 w-4" />;
      case "post": return <FileText className="h-4 w-4" />;
      case "group": return <Users className="h-4 w-4" />;
      default: return <Search className="h-4 w-4" />;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border safe-area-top">
        <button onClick={onClose} className="p-2 -ml-1 rounded-full hover:bg-secondary active:scale-95 transition-all">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex-1 flex items-center bg-secondary rounded-full px-4 py-2.5 gap-2">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, posts, groups..."
            className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults([]); }} className="active:scale-90">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Searching...</p>
          </div>
        ) : query && results.length === 0 ? (
          <EmptyState emoji="search" title={`Nothing for “${query}”`} text="Try a different name or word." />
        ) : results.length > 0 ? (
          <div className="py-2">
            {results.map((item) => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => handleSelect(item)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent active:bg-accent/80 transition-colors text-left"
              >
                {item.type === "user" || item.type === "group" ? (
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={item.avatar || ""} />
                    <AvatarFallback className="bg-secondary text-sm">{item.title[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="h-11 w-11 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                    {getIcon(item.type)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{item.type}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          // Before you type: recent searches, people you may know and groups to explore.
          <div className="space-y-5 py-4">
            {recentSearches.length > 0 && (
              <section>
                <div className="mb-1 flex items-center justify-between px-4">
                  <h3 className="text-[15px] font-semibold">Recent</h3>
                  <button onClick={clearRecent} className="text-xs font-semibold text-primary">Clear all</button>
                </div>
                {recentSearches.map((term) => (
                  <div key={term} className="flex items-center gap-3 px-4 py-1.5 transition-colors hover:bg-accent/60">
                    <button type="button" onClick={() => handleRecentClick(term)} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <span className="truncate text-sm">{term}</span>
                    </button>
                    <button type="button" onClick={() => removeRecent(term)} aria-label={`Remove ${term}`} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </section>
            )}

            {people.length > 0 && (
              <section>
                <h3 className="mb-2 px-4 text-[15px] font-semibold">People you may know</h3>
                <div className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
                  {people.map((p) => (
                    <button key={p.id} type="button" onClick={() => go(`/profile/${p.id}`)} className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 text-center">
                      <Avatar className="h-16 w-16">
                        <AvatarImage src={p.avatar_url || ""} className="object-cover" />
                        <AvatarFallback className="bg-secondary text-lg font-semibold">{p.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                      <span className="w-full truncate text-xs font-medium">{p.full_name?.split(" ")[0] || "User"}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {groups.length > 0 && (
              <section>
                <h3 className="mb-1 px-4 text-[15px] font-semibold">Groups to explore</h3>
                {groups.map((g) => (
                  <button key={g.id} type="button" onClick={() => go(`/groups/${g.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-accent/60">
                    <Avatar className="h-11 w-11 rounded-xl">
                      <AvatarImage src={g.image_url || ""} className="object-cover" />
                      <AvatarFallback className="rounded-xl bg-primary/15 text-primary"><Users className="h-5 w-5" /></AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-medium">{g.name}</span>
                  </button>
                ))}
              </section>
            )}

            {recentSearches.length === 0 && people.length === 0 && groups.length === 0 && (
              <EmptyState emoji="search" title="Find people, posts and groups" text="Start typing a name or a word." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
