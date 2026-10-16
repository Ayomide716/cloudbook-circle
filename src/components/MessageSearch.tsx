import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, ChevronUp, ChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";

interface MessageSearchProps {
  messages: Array<{ id: string; content: string }>;
  onHighlight: (messageId: string | null) => void;
  onClose: () => void;
}

const MessageSearch = ({ messages, onHighlight, onClose }: MessageSearchProps) => {
  const [query, setQuery] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  const results = query.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(query.toLowerCase()))
    : [];

  const navigate = (direction: "up" | "down") => {
    if (results.length === 0) return;
    const next = direction === "down"
      ? (currentIndex + 1) % results.length
      : (currentIndex - 1 + results.length) % results.length;
    setCurrentIndex(next);
    onHighlight(results[next].id);
  };

  const handleChange = (value: string) => {
    setQuery(value);
    setCurrentIndex(0);
    const filtered = value.trim()
      ? messages.filter((m) => m.content.toLowerCase().includes(value.toLowerCase()))
      : [];
    onHighlight(filtered.length > 0 ? filtered[0].id : null);
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-card border-b animate-fade-in">
      <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <Input
        placeholder="Search messages..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        className="h-8 text-sm border-none bg-transparent focus-visible:ring-0 shadow-none"
        autoFocus
      />
      {results.length > 0 && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {currentIndex + 1}/{results.length}
        </span>
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("up")} disabled={results.length === 0}>
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate("down")} disabled={results.length === 0}>
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { onHighlight(null); onClose(); }}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};

export default MessageSearch;
