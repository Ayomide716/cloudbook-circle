import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ArrowLeft, User, FileText, Users, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    if (open) {
      // Use requestAnimationFrame for better iOS Safari focus support
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      const saved = localStorage.getItem("recent_searches");
      if (saved) {
        try { setRecentSearches(JSON.parse(saved)); } catch {}
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
      case "post": navigate(`/?post=${item.id}`); break;
      case "group": navigate(`/groups/${item.id}`); break;
    }
  };

  const handleRecentClick = (term: string) => {
    setQuery(term);
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
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Search className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No results for "{query}"</p>
          </div>
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
          /* Recent searches */
          <div className="py-4">
            {recentSearches.length > 0 && (
              <>
                <div className="flex items-center justify-between px-4 mb-2">
                  <h3 className="text-sm font-semibold text-foreground">Recent</h3>
                  <button onClick={clearRecent} className="text-xs text-primary font-medium">Clear all</button>
                </div>
                {recentSearches.map((term, i) => (
                  <button
                    key={i}
                    onClick={() => handleRecentClick(term)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent active:bg-accent/80 transition-colors text-left"
                  >
                    <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="text-sm truncate">{term}</span>
                  </button>
                ))}
              </>
            )}
            {recentSearches.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Search className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Search for people, posts, and groups</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
