import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, fullScreenOnPhones } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import ImageUpload from "@/components/ImageUpload";
import PeopleYouMayKnow from "@/components/feed/PeopleYouMayKnow";
import { GroupsRow } from "@/components/feed/FeedRows";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const doneKey = (userId: string) => `ember:welcome-done:${userId}`;
/** Only for new accounts: someone who's been here a week has found their way around. */
const NEW_FOR_MS = 7 * 24 * 60 * 60 * 1000;

interface Me { id: string; full_name: string | null; avatar_url: string | null; created_at?: string | null }

/**
 * A short welcome for new accounts, once: a profile photo, people to add, groups to join.
 * Every step can be skipped; closing it at any point means it doesn't come back.
 */
const WelcomeFlow = ({ me }: { me: Me }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [avatar, setAvatar] = useState(me.avatar_url);

  useEffect(() => {
    if (import.meta.env.VITE_E2E === "true") return;
    try { if (localStorage.getItem(doneKey(me.id))) return; } catch { return; }
    const created = me.created_at ? Date.parse(me.created_at) : NaN;
    if (Number.isFinite(created) && Date.now() - created < NEW_FOR_MS) setOpen(true);
  }, [me.id, me.created_at]);

  const finish = () => {
    try { localStorage.setItem(doneKey(me.id), "1"); } catch { /* shows again next time */ }
    setOpen(false);
  };
  const first = me.full_name?.split(" ")[0];
  const steps = [
    {
      title: first ? `Welcome to Ember, ${first}` : "Welcome to Ember",
      text: "Add a profile photo so friends know it's you.",
      body: (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="relative">
            <Avatar className="h-32 w-32 ring-4 ring-background shadow-lg">
              <AvatarImage src={avatar || undefined} alt="" className="object-cover" />
              <AvatarFallback className="bg-secondary text-4xl font-bold">{me.full_name?.[0]?.toUpperCase() || "?"}</AvatarFallback>
            </Avatar>
            <div className="absolute bottom-1 right-1">
              <ImageUpload
                bucket="avatars"
                userId={me.id}
                variant="avatar"
                onUploadComplete={async (url) => {
                  setAvatar(url);
                  await supabase.from("profiles").update({ avatar_url: url }).eq("id", me.id);
                }}
              />
            </div>
          </div>
          {avatar && <p className="text-sm font-medium text-primary">Looking good.</p>}
        </div>
      ),
    },
    { title: "Find your people", text: "Add a few friends: their posts fill your feed.", body: <div className="-mx-4 sm:mx-0"><PeopleYouMayKnow currentUserId={me.id} /></div> },
    { title: "Join a group", text: "Your church, estate, old school, or something you love.", body: <div className="-mx-4 sm:mx-0"><GroupsRow currentUserId={me.id} /></div> },
  ];
  const last = step === steps.length - 1;
  const s = steps[step];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent hideHandle className={`sm:max-w-lg ${fullScreenOnPhones}`}>
        <div className="flex justify-center gap-1.5 pt-1" aria-hidden="true">
          {steps.map((_, i) => <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30")} />)}
        </div>
        <div className="text-center">
          <DialogTitle className="text-2xl font-bold">{s.title}</DialogTitle>
          <DialogDescription className="mt-1.5">{s.text}</DialogDescription>
        </div>
        <div key={step} className="animate-in fade-in-0 slide-in-from-right-4 duration-200">{s.body}</div>
        <DialogFooter>
          <Button className="w-full rounded-xl" onClick={() => (last ? finish() : setStep(step + 1))}>{last ? "Start exploring" : "Next"}</Button>
          <Button variant="ghost" className="w-full rounded-xl" onClick={() => (last ? finish() : setStep(step + 1))}>Skip</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomeFlow;
