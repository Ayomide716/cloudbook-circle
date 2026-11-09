import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, X } from "@/components/icons";
import type { ChatEvent, ChatPoll } from "@/lib/chat-extras";

/** Create a poll, as on WhatsApp: a question, 2 to 12 options, and one or several answers. */
export const PollComposer = ({ open, onOpenChange, onSend }: { open: boolean; onOpenChange: (o: boolean) => void; onSend: (poll: ChatPoll) => void }) => {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ok = question.trim() && filled.length >= 2;
  const reset = () => { setQuestion(""); setOptions(["", ""]); setMultiple(false); };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create poll</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!ok) return; onSend({ question: question.trim(), options: filled, multiple }); onOpenChange(false); reset(); }}>
          <div>
            <label htmlFor="poll-q" className="mb-1.5 block text-sm font-medium">Question</label>
            <Input id="poll-q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question" maxLength={300} autoFocus />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Options</p>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={o} onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} maxLength={100} aria-label={`Option ${i + 1}`} />
                {options.length > 2 && (
                  <button type="button" onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 12 && (
              <button type="button" onClick={() => setOptions((prev) => [...prev, ""])} className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                <Plus className="h-4 w-4" /> Add option
              </button>
            )}
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Allow more than one answer</span>
            <Switch checked={multiple} onCheckedChange={setMultiple} />
          </label>
          <Button type="submit" className="w-full rounded-full" disabled={!ok}>Send poll</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** Create an event: a name, when and where. */
export const EventComposer = ({ open, onOpenChange, onSend }: { open: boolean; onOpenChange: (o: boolean) => void; onSend: (event: ChatEvent) => void }) => {
  const tomorrow = new Date(Date.now() + 86400_000);
  tomorrow.setMinutes(0, 0, 0);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(() => format(tomorrow, "yyyy-MM-dd'T'HH:mm"));
  const [place, setPlace] = useState("");
  const ok = title.trim() && !Number.isNaN(Date.parse(when));
  const reset = () => { setTitle(""); setPlace(""); };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create event</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!ok) return; onSend({ title: title.trim(), starts_at: new Date(when).toISOString(), place: place.trim() }); onOpenChange(false); reset(); }}>
          <div>
            <label htmlFor="ev-title" className="mb-1.5 block text-sm font-medium">Event name</label>
            <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner at Yellow Chilli" maxLength={200} autoFocus />
          </div>
          <div>
            <label htmlFor="ev-when" className="mb-1.5 block text-sm font-medium">Date and time</label>
            <Input id="ev-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ev-place" className="mb-1.5 block text-sm font-medium">Location (optional)</label>
            <Input id="ev-place" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Add a place" maxLength={200} />
          </div>
          <Button type="submit" className="w-full rounded-full" disabled={!ok}>Send event</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
