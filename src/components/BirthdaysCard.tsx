import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cake, X } from "@/components/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { saveDraft } from "@/lib/chat-drafts";
import { isBirthdayToday } from "@/lib/birthdays";

interface Friend { id: string; full_name: string | null; avatar_url: string | null }

const HIDE_KEY = "ember:birthdays-hidden";
const today = () => new Date().toISOString().slice(0, 10);

/** Friends' birthdays today, at the top of Home, as on Facebook, with a quick wish. */
const BirthdaysCard = ({ currentUserId }: { currentUserId: string }) => {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === today(); } catch { return false; }
  });

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    (async () => {
      const { data: links } = await supabase
        .from("friendships")
        .select("user_id, friend_id")
        .eq("status", "accepted")
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);
      const ids = (links ?? []).map((f) => (f.user_id === currentUserId ? f.friend_id : f.user_id));
      if (ids.length === 0) return;
      const { data: people } = await supabase.from("profiles").select("id, full_name, avatar_url, birthday").in("id", ids).not("birthday", "is", null);
      if (!cancelled) setFriends((people ?? []).filter((p) => isBirthdayToday(p.birthday)));
    })();
    return () => { cancelled = true; };
  }, [currentUserId, hidden]);

  if (hidden || friends.length === 0) return null;

  const first = friends[0];
  const firstName = first.full_name?.split(" ")[0] || "your friend";
  const wish = (f: Friend) => {
    saveDraft(currentUserId, f.id, `Happy birthday, ${f.full_name?.split(" ")[0] || ""}! 🎉`.replace(" !", "!"));
    navigate(`/messages?user=${f.id}`);
  };
  const close = () => {
    try { localStorage.setItem(HIDE_KEY, today()); } catch { /* not remembered */ }
    setHidden(true);
  };

  return (
    <section aria-label="Birthdays" className="feed-section relative flex items-center gap-3 border border-border/60 bg-card p-3 sm:rounded-2xl">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-primary text-white">
        <Cake className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-snug">
          {friends.length === 1 ? `${first.full_name || "A friend"}'s birthday is today` : `${firstName} and ${friends.length - 1} other${friends.length > 2 ? "s" : ""} have birthdays today`}
        </p>
        <div className="mt-1.5 flex -space-x-2">
          {friends.slice(0, 5).map((f) => (
            <Avatar key={f.id} className="h-6 w-6 border-2 border-card">
              <AvatarImage src={f.avatar_url || undefined} alt="" />
              <AvatarFallback className="text-[10px]">{f.full_name?.[0] ?? "?"}</AvatarFallback>
            </Avatar>
          ))}
        </div>
      </div>
      <Button size="sm" className="shrink-0 rounded-full" onClick={() => wish(first)}>
        Wish {friends.length === 1 ? firstName : "them"}
      </Button>
      <button type="button" onClick={close} aria-label="Hide birthdays for today" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
        <X className="h-3.5 w-3.5" />
      </button>
    </section>
  );
};

export default BirthdaysCard;
