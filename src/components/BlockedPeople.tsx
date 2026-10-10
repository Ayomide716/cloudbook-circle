import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { myBlockedPeople, unblockUser } from "@/lib/blocking";
import { getErrorMessage } from "@/lib/utils";

type Person = Awaited<ReturnType<typeof myBlockedPeople>>[number];

/** Settings → Blocked people: everyone you've blocked, each with Unblock. */
const BlockedPeople = ({ userId }: { userId: string }) => {
  const { toast } = useToast();
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    myBlockedPeople(userId).then(setPeople).catch(() => setPeople([]));
  }, [userId]);

  const unblock = async (person: Person) => {
    try {
      await unblockUser(userId, person.id);
      setPeople((prev) => prev?.filter((p) => p.id !== person.id) ?? null);
      toast({ title: `You unblocked ${person.full_name || "them"}` });
    } catch (error) {
      toast({ title: "Couldn't unblock", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <Card className="p-4" aria-label="Blocked people">
      <p className="text-sm text-muted-foreground mb-3">
        People you block can't see your posts, comment on them, message you or add you as a friend.
      </p>
      {people === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : people.length === 0 ? (
        <p className="text-sm">You haven't blocked anyone.</p>
      ) : (
        <ul className="divide-y divide-border">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3 py-2.5">
              <Avatar className="h-10 w-10">
                <AvatarImage src={person.avatar_url || undefined} alt="" />
                <AvatarFallback>{person.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              <Link to={`/profile/${person.id}`} className="flex-1 min-w-0 truncate font-medium hover:underline">
                {person.full_name || "Ember user"}
              </Link>
              <Button variant="secondary" size="sm" onClick={() => unblock(person)}>
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default BlockedPeople;
