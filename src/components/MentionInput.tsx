import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface UserSuggestion {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

const MentionInput = ({ value, onChange, placeholder, className, disabled }: MentionInputProps) => {
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!mentionQuery || mentionQuery.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .ilike("full_name", `%${mentionQuery}%`)
        .limit(5);
      setSuggestions(data || []);
      setShowSuggestions((data || []).length > 0);
    }, 200);

    return () => clearTimeout(timer);
  }, [mentionQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const pos = e.target.selectionStart || 0;
    setCursorPosition(pos);
    onChange(newValue);

    // Check if we're typing a mention
    const textBeforeCursor = newValue.slice(0, pos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
    } else {
      setMentionQuery("");
      setShowSuggestions(false);
    }
  };

  const insertMention = (user: UserSuggestion) => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const textAfterCursor = value.slice(cursorPosition);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      const beforeMention = textBeforeCursor.slice(0, mentionMatch.index);
      const displayName = (user.full_name || "User").replace(/\s+/g, "");
      const newValue = `${beforeMention}@${displayName} ${textAfterCursor}`;
      onChange(newValue);
    }
    setShowSuggestions(false);
    setMentionQuery("");
    textareaRef.current?.focus();
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
      />
      {showSuggestions && (
        <div className="absolute bottom-full left-0 mb-1 w-64 bg-card border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
          {suggestions.map((user) => (
            <button
              key={user.id}
              type="button"
              className="w-full flex items-center gap-2 p-2 hover:bg-accent transition-colors text-left"
              onMouseDown={(e) => { e.preventDefault(); insertMention(user); }}
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-secondary">
                  {user.full_name?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium truncate">{user.full_name || "User"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MentionInput;
