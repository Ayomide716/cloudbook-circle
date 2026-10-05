import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, CalendarPlus, MapPin, Clock, Users, Plus, Loader2, Check, Star, MoreHorizontal, Trash2, ImagePlus, X,
} from "lucide-react";
import { format, isSameDay } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, HeaderAction, Chips } from "@/components/layout/PageHeader";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import EventsSkeleton from "@/components/skeletons/EventsSkeleton";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { uploadWithProgress } from "@/lib/storage-upload";

interface Event {
  id: string;
  name: string;
  description: string | null;
  cover_image: string | null;
  location: string | null;
  start_date: string;
  end_date: string | null;
  created_by: string;
  profiles?: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

type RsvpStatus = "going" | "interested";
type Filter = "upcoming" | "going" | "hosting";

/** Events without an end time count as "on" for this long after they start. */
const DEFAULT_LENGTH_MS = 3 * 60 * 60 * 1000;

const eventEnd = (e: Event) =>
  e.end_date ? new Date(e.end_date) : new Date(new Date(e.start_date).getTime() + DEFAULT_LENGTH_MS);

const isHappeningNow = (e: Event) => {
  const now = Date.now();
  return new Date(e.start_date).getTime() <= now && eventEnd(e).getTime() > now;
};

/** `datetime-local` value for a Date, in local time. */
const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

/** Downloads an .ics file so the event can be added to any calendar app. */
const downloadCalendarFile = (e: Event) => {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CloudBook//Events//EN",
    "BEGIN:VEVENT",
    `UID:${e.id}@cloudbook`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(new Date(e.start_date))}`,
    `DTEND:${stamp(eventEnd(e))}`,
    `SUMMARY:${escape(e.name)}`,
    e.location ? `LOCATION:${escape(e.location)}` : "",
    e.description ? `DESCRIPTION:${escape(e.description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${e.name.replace(/[^\w\s-]/g, "").trim() || "event"}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const emptyForm = { name: "", description: "", location: "", start_date: "", end_date: "" };

const Events = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Events", description: "Discover and create events on CloudBook." });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [rsvps, setRsvps] = useState<Record<string, RsvpStatus>>({});
  const [rsvpCounts, setRsvpCounts] = useState<Record<string, { going: number; interested: number }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEvent, setNewEvent] = useState(emptyForm);
  const [cover, setCover] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Event | null>(null);
  const [rsvpBusy, setRsvpBusy] = useState<string | null>(null);
  const coverPreview = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
    loadEvents(session.user.id);
  });

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loadEvents = async (userId: string) => {
    setIsLoading(true);
    const now = new Date();
    const recentStart = new Date(now.getTime() - DEFAULT_LENGTH_MS).toISOString();

    // Upcoming events plus ones happening right now (not only those that haven't started).
    const { data: eventsData, error } = await supabase
      .from("events")
      .select(`*, profiles:created_by (full_name, avatar_url)`)
      .or(`end_date.gte.${now.toISOString()},and(end_date.is.null,start_date.gte.${recentStart})`)
      .order("start_date", { ascending: true });

    if (error) {
      toast({ title: "Couldn't load events", description: error.message, variant: "destructive" });
      setIsLoading(false);
      return;
    }

    const list = eventsData ?? [];
    setEvents(list);
    const userRsvps: Record<string, RsvpStatus> = {};
    const counts: Record<string, { going: number; interested: number }> = {};
    if (list.length) {
      const { data: rsvpData } = await supabase
        .from("event_rsvps")
        .select("event_id, status, user_id")
        .in("event_id", list.map((e) => e.id));
      for (const r of rsvpData ?? []) {
        if (r.status !== "going" && r.status !== "interested") continue;
        if (r.user_id === userId) userRsvps[r.event_id] = r.status;
        counts[r.event_id] ??= { going: 0, interested: 0 };
        counts[r.event_id][r.status]++;
      }
    }
    setRsvps(userRsvps);
    setRsvpCounts(counts);
    setIsLoading(false);
  };

  const handleRSVP = async (eventId: string, status: RsvpStatus) => {
    if (!currentUserId || rsvpBusy) return;
    const previous = rsvps[eventId];
    const next = previous === status ? undefined : status;
    const prevRsvps = rsvps;
    const prevCounts = rsvpCounts;

    // Show it straight away, then save; undo if saving fails.
    setRsvps((p) => {
      const u = { ...p };
      if (next) u[eventId] = next; else delete u[eventId];
      return u;
    });
    setRsvpCounts((p) => {
      const c = { going: p[eventId]?.going ?? 0, interested: p[eventId]?.interested ?? 0 };
      if (previous) c[previous] = Math.max(0, c[previous] - 1);
      if (next) c[next] += 1;
      return { ...p, [eventId]: c };
    });

    setRsvpBusy(eventId);
    const { error } = !next
      ? await supabase.from("event_rsvps").delete().eq("event_id", eventId).eq("user_id", currentUserId)
      : previous
        ? await supabase.from("event_rsvps").update({ status: next }).eq("event_id", eventId).eq("user_id", currentUserId)
        : await supabase.from("event_rsvps").insert({ event_id: eventId, user_id: currentUserId, status: next });
    setRsvpBusy(null);

    if (error) {
      setRsvps(prevRsvps);
      setRsvpCounts(prevCounts);
      toast({ title: "Couldn't save your RSVP", description: "Please try again.", variant: "destructive" });
    }
  };

  const start = newEvent.start_date ? new Date(newEvent.start_date) : null;
  const end = newEvent.end_date ? new Date(newEvent.end_date) : null;
  const dateError =
    start && start.getTime() < Date.now() - 5 * 60 * 1000
      ? "The start time has already passed."
      : start && end && end <= start
        ? "The end time must be after the start."
        : null;

  const handleCreateEvent = async () => {
    if (!currentUserId || !newEvent.name.trim() || !start || dateError) return;
    setIsCreating(true);

    let coverUrl: string | null = null;
    if (cover) {
      const ext = cover.name.split(".").pop()?.toLowerCase() || "jpg";
      coverUrl = await uploadWithProgress("post-images", `${currentUserId}/events/${Date.now()}.${ext}`, cover).catch(() => null);
      if (!coverUrl) toast({ title: "The cover photo couldn't be uploaded", description: "The event was created without it." });
    }

    const { error } = await supabase.from("events").insert({
      name: newEvent.name.trim(),
      description: newEvent.description.trim() || null,
      location: newEvent.location.trim() || null,
      start_date: start.toISOString(),
      end_date: end ? end.toISOString() : null,
      cover_image: coverUrl,
      created_by: currentUserId,
    });

    setIsCreating(false);
    if (error) {
      toast({ title: "Couldn't create the event", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Event created!" });
    setShowCreateDialog(false);
    setNewEvent(emptyForm);
    setCover(null);
    loadEvents(currentUserId);
  };

  const deleteEvent = async (event: Event) => {
    setPendingDelete(null);
    const { error } = await supabase.from("events").delete().eq("id", event.id);
    if (error) {
      toast({ title: "Couldn't delete the event", variant: "destructive" });
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    toast({ title: "Event deleted" });
  };

  const visible = events.filter((e) =>
    filter === "going" ? !!rsvps[e.id] : filter === "hosting" ? e.created_by === currentUserId : true
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <EventsSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />

      <div className="page-flush max-w-4xl mx-auto px-0 sm:px-4 pb-6 sm:py-6">
          <Dialog open={showCreateDialog} onOpenChange={(open) => !isCreating && setShowCreateDialog(open)}>
            <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create event</DialogTitle>
                <DialogDescription>Everyone on CloudBook can see and RSVP to it.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Cover photo */}
                {coverPreview ? (
                  <div className="relative">
                    <img src={coverPreview} alt="" className="w-full h-36 object-cover rounded-xl" />
                    <Button size="icon" variant="secondary" className="absolute top-2 right-2 h-8 w-8 rounded-full" onClick={() => setCover(null)} aria-label="Remove cover photo">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground cursor-pointer hover:border-primary/50 transition-colors">
                    <ImagePlus className="h-5 w-5" /> Add a cover photo (optional)
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
                  </label>
                )}
                <div>
                  <Label htmlFor="event-name">Event name</Label>
                  <Input id="event-name" className="mt-1" maxLength={100} value={newEvent.name} onChange={(e) => setNewEvent((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="event-desc">Description</Label>
                  <Textarea id="event-desc" className="mt-1" placeholder="Optional" rows={3} value={newEvent.description} onChange={(e) => setNewEvent((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="event-location">Location</Label>
                  <Input id="event-location" className="mt-1" placeholder="Optional" value={newEvent.location} onChange={(e) => setNewEvent((p) => ({ ...p, location: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="event-start">Starts</Label>
                    <Input
                      id="event-start"
                      type="datetime-local"
                      className="mt-1"
                      min={toLocalInput(new Date())}
                      value={newEvent.start_date}
                      onChange={(e) => setNewEvent((p) => ({ ...p, start_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="event-end">Ends (optional)</Label>
                    <Input
                      id="event-end"
                      type="datetime-local"
                      className="mt-1"
                      min={newEvent.start_date || toLocalInput(new Date())}
                      value={newEvent.end_date}
                      onChange={(e) => setNewEvent((p) => ({ ...p, end_date: e.target.value }))}
                    />
                  </div>
                </div>
                {dateError && <p className="text-sm text-destructive" role="alert">{dateError}</p>}
                <Button
                  onClick={handleCreateEvent}
                  disabled={isCreating || !newEvent.name.trim() || !newEvent.start_date || !!dateError}
                  className="w-full"
                >
                  {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Create event
                </Button>
              </div>
            </DialogContent>
          </Dialog>

        <PageHeader
          title="Events"
          actions={<HeaderAction icon={Plus} label="Create event" primary onClick={() => setShowCreateDialog(true)} />}
          className="sm:mb-5"
        >
          <Chips
            label="Show events"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "upcoming", label: "Upcoming" },
              { value: "going", label: "Your events" },
              { value: "hosting", label: "Hosting" },
            ]}
          />
        </PageHeader>

        {visible.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Calendar className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="font-medium">
              {filter === "going" ? "You haven't RSVP'd to anything yet" : filter === "hosting" ? "You aren't hosting any events" : "No upcoming events"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === "upcoming" || filter === "hosting" ? "Create one to get people together." : "Tap “Going” or “Interested” on an event to save it here."}
            </p>
          </div>
        ) : (
          <div className="grid gap-2 sm:gap-4 md:grid-cols-2 mt-2 sm:mt-0">
            {visible.map((event) => {
              const startDate = new Date(event.start_date);
              const endDate = event.end_date ? new Date(event.end_date) : null;
              const live = isHappeningNow(event);
              const mine = event.created_by === currentUserId;
              const status = rsvps[event.id];
              return (
                <Card key={event.id} className="feed-section overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                  {event.cover_image && (
                    <img src={event.cover_image} alt="" loading="lazy" className="w-full h-40 object-cover" />
                  )}
                  <div className="p-4 flex-1 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      {/* Date tile */}
                      <div className="shrink-0 w-14 rounded-xl border bg-card text-center overflow-hidden" aria-hidden>
                        <div className="gradient-brand text-primary-foreground text-[11px] font-semibold uppercase py-0.5">
                          {format(startDate, "MMM")}
                        </div>
                        <div className="text-2xl font-bold leading-tight py-1">{format(startDate, "d")}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {live && <Badge className="bg-red-600 text-white hover:bg-red-600 gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />Happening now</Badge>}
                          {mine && <Badge variant="secondary">Hosting</Badge>}
                        </div>
                        <h2 className="text-lg font-semibold leading-snug mt-0.5 break-words">{event.name}</h2>
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                          <Clock className="h-4 w-4 shrink-0" />
                          <span>
                            {format(startDate, "EEE, MMM d · h:mm a")}
                            {endDate && ` – ${format(endDate, isSameDay(startDate, endDate) ? "h:mm a" : "MMM d, h:mm a")}`}
                          </span>
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 -mr-2 -mt-1" aria-label="More options">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => downloadCalendarFile(event)}>
                            <CalendarPlus className="h-4 w-4 mr-2" /> Add to calendar
                          </DropdownMenuItem>
                          {mine && (
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setPendingDelete(event)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete event
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {event.location && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </p>
                    )}
                    {event.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                    )}

                    <div className="flex items-center justify-between gap-2 text-sm mt-auto">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {rsvpCounts[event.id]?.going || 0} going · {rsvpCounts[event.id]?.interested || 0} interested
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/profile/${event.created_by}`)}
                        className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={event.profiles?.avatar_url || undefined} alt="" />
                          <AvatarFallback className="text-[10px]">{event.profiles?.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                        </Avatar>
                        <span className="truncate max-w-[8rem]">{mine ? "You" : event.profiles?.full_name || "Someone"}</span>
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant={status === "going" ? "default" : "outline"}
                        size="sm"
                        className="flex-1 gap-1.5"
                        aria-pressed={status === "going"}
                        disabled={rsvpBusy === event.id}
                        onClick={() => handleRSVP(event.id, "going")}
                      >
                        <Check className="h-4 w-4" />
                        Going
                      </Button>
                      <Button
                        variant={status === "interested" ? "default" : "outline"}
                        size="sm"
                        className="flex-1 gap-1.5"
                        aria-pressed={status === "interested"}
                        disabled={rsvpBusy === event.id}
                        onClick={() => handleRSVP(event.id, "interested")}
                      >
                        <Star className={cn("h-4 w-4", status === "interested" && "fill-current")} />
                        Interested
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.name}" and everyone's RSVPs will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && deleteEvent(pendingDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Events;
