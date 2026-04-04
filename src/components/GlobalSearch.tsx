import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, User, FileText, Users, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface SearchResult {
  type: "user" | "post" | "group" | "page";
  id: string;
  title: string;
  subtitle?: string;
  avatar?: string | null;
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timeout = setTimeout(() => search(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const search = async (q: string) => {
    setLoading(true);
    const lower = `%${q.toLowerCase()}%`;

    const [profiles, posts, groups, pages] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url").ilike("full_name", lower).limit(5),
      supabase.from("posts").select("id, content, user_id").ilike("content", lower).limit(5),
      supabase.from("groups").select("id, name, image_url").ilike("name", lower).limit(5),
      supabase.from("pages").select("id, name, avatar_url, category").ilike("name", lower).limit(5),
    ]);

    const items: SearchResult[] = [
      ...(profiles.data || []).map((p) => ({
        type: "user" as const, id: p.id, title: p.full_name || "User", avatar: p.avatar_url,
      })),
      ...(posts.data || []).map((p) => ({
        type: "post" as const, id: p.id, title: p.content.substring(0, 60) + (p.content.length > 60 ? "..." : ""),
      })),
      ...(groups.data || []).map((g) => ({
        type: "group" as const, id: g.id, title: g.name, avatar: g.image_url,
      })),
      ...(pages.data || []).map((p) => ({
        type: "page" as const, id: p.id, title: p.name, subtitle: p.category, avatar: p.avatar_url,
      })),
    ];
    setResults(items);
    setLoading(false);
  };

  const handleSelect = (item: SearchResult) => {
    setIsOpen(false);
    setQuery("");
    switch (item.type) {
      case "user": navigate(`/profile/${item.id}`); break;
      case "post": navigate(`/?post=${item.id}`); break;
      case "group": navigate(`/groups/${item.id}`); break;
      case "page": navigate(`/pages/${item.id}`); break;
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "user": return <User className="h-4 w-4 text-muted-foreground" />;
      case "post": return <FileText className="h-4 w-4 text-muted-foreground" />;
      case "group": return <Users className="h-4 w-4 text-muted-foreground" />;
      default: return <Search className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <div className="flex items-center bg-secondary rounded-full px-3 py-2 gap-2 w-[240px]">
        <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => query && setIsOpen(true)}
          placeholder="Search AYO-CHAT"
          className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); }}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {isOpen && (query || results.length > 0) && (
        <div className="absolute top-full left-0 mt-2 w-[340px] bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
          ) : results.length === 0 && query ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No results for "{query}"</div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto py-2">
              {results.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-left"
                >
                  {item.type === "user" || item.type === "group" ? (
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={item.avatar || ""} />
                      <AvatarFallback className="bg-secondary text-xs">{item.title[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
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
          )}
        </div>
      )}
    </div>
  );
}
