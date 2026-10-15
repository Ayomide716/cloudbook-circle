import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import GroupInitials from "@/components/groups/GroupInitials";
import { groupVisits } from "@/lib/recent-groups";

interface ShortcutGroup { id: string; name: string; image_url: string | null }

/** "Your shortcuts": the groups you're in, the ones you open most first, as in Facebook's menu. */
const GroupShortcuts = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ShortcutGroup[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("group_members")
      .select("groups (id, name, image_url)")
      .eq("user_id", userId)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const visits = groupVisits();
        const list = (data as unknown as { groups: ShortcutGroup | null }[])
          .map((r) => r.groups)
          .filter((g): g is ShortcutGroup => !!g)
          .sort((a, b) => (visits[b.id] ?? 0) - (visits[a.id] ?? 0) || a.name.localeCompare(b.name));
        setGroups(list.slice(0, 8));
      });
    return () => { cancelled = true; };
  }, [userId]);

  if (groups.length === 0) return null;
  return (
    <section aria-label="Your shortcuts" className="feed-section rounded-2xl border border-border bg-card py-3">
      <h2 className="px-4 text-[15px] font-semibold">Your shortcuts</h2>
      <div className="mt-2 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
        {groups.map((g) => (
          <button key={g.id} type="button" onClick={() => navigate(`/groups/${g.id}`)} className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 text-center">
            {g.image_url ? (
              <img src={g.image_url} alt="" className="h-16 w-16 rounded-2xl object-cover" loading="lazy" />
            ) : (
              <GroupInitials id={g.id} name={g.name} className="h-16 w-16 rounded-2xl text-lg" />
            )}
            <span className="line-clamp-2 text-[12px] font-medium leading-tight">{g.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default GroupShortcuts;
