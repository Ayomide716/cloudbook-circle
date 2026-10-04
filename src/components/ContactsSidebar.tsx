import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import OnlineStatusIndicator from "./OnlineStatusIndicator";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Contact {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
}

interface ContactsSidebarProps {
  currentUserId: string;
}

const ContactsSidebar = ({ currentUserId }: ContactsSidebarProps) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContacts = useEffectEvent(async () => {
    const { data: friendships } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
      .eq("status", "accepted");

    if (!friendships || friendships.length === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    const friendIds = friendships.map((f) =>
      f.user_id === currentUserId ? f.friend_id : f.user_id
    );

    const [{ data: profiles }, { data: statuses }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, avatar_url").in("id", friendIds),
      supabase.from("user_status").select("user_id, is_online, last_seen").in("user_id", friendIds),
    ]);

    const statusMap = new Map(statuses?.map((s) => [s.user_id, {
      is_online: s.is_online && new Date(s.last_seen).getTime() > Date.now() - 5 * 60 * 1000,
    }]) ?? []);

    const contactList: Contact[] = (profiles ?? []).map((p) => ({
      ...p,
      is_online: statusMap.get(p.id)?.is_online ?? false,
    }));

    contactList.sort((a, b) => {
      if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });

    setContacts(contactList);
    setLoading(false);
  });

  useEffect(() => {
    fetchContacts();

    const channel = supabase
      .channel("contacts-status-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_status" }, () => fetchContacts())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => fetchContacts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, fetchContacts]);

  const onlineCount = contacts.filter((c) => c.is_online).length;

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[17px] text-muted-foreground">
              Contacts{onlineCount > 0 && ` (${onlineCount} online)`}
            </h3>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              <p>No contacts yet.</p>
              <Link to="/friends" className="text-primary hover:underline text-xs mt-1 inline-block">
                Find friends →
              </Link>
            </div>
          ) : (
            <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
              {contacts.map((contact) => (
                <Link
                  key={contact.id}
                  to={`/messages?user=${contact.id}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary transition-colors group"
                >
                  <div className="relative">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={contact.avatar_url || undefined} alt="" className="object-cover" loading="lazy" />
                      <AvatarFallback className="text-xs">{(contact.full_name || "U")[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                    {contact.is_online && (
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
                    )}
                  </div>
                  <span className="text-sm font-medium truncate">
                    {contact.full_name || "User"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default ContactsSidebar;
