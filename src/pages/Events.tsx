import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
 import { useToast } from "@/hooks/use-toast";
 import Navigation from "@/components/Navigation";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Textarea } from "@/components/ui/textarea";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
 import { Calendar, MapPin, Clock, Users, Plus, Loader2, Check } from "lucide-react";
 import { format } from "date-fns";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
 } from "@/components/ui/dialog";
 import { cn } from "@/lib/utils";
 import EventsSkeleton from "@/components/skeletons/EventsSkeleton";
 import { useEffectEvent } from "@/hooks/use-effect-event";
 
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
   };
 }
 
 interface RSVP {
   event_id: string;
   status: 'going' | 'interested' | 'not_going';
 }
 
 const Events = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Events", description: "Discover and create events on CloudBook." });
   const [currentUserId, setCurrentUserId] = useState<string | null>(null);
   const [events, setEvents] = useState<Event[]>([]);
   const [rsvps, setRsvps] = useState<Record<string, string>>({});
   const [rsvpCounts, setRsvpCounts] = useState<Record<string, { going: number; interested: number }>>({});
   const [isLoading, setIsLoading] = useState(true);
   const [showCreateDialog, setShowCreateDialog] = useState(false);
   const [newEvent, setNewEvent] = useState({
     name: "",
     description: "",
     location: "",
     start_date: "",
     end_date: "",
   });
   const [isCreating, setIsCreating] = useState(false);
 
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
 
     const { data: eventsData } = await supabase
       .from("events")
       .select(`
         *,
         profiles:created_by (full_name, avatar_url)
       `)
       .gte("start_date", new Date().toISOString())
       .order("start_date", { ascending: true });
 
     if (eventsData) {
       setEvents(eventsData);
 
       // Load RSVPs
       const eventIds = eventsData.map(e => e.id);
       const { data: rsvpData } = await supabase
         .from("event_rsvps")
         .select("event_id, status, user_id")
         .in("event_id", eventIds);
 
       if (rsvpData) {
         const userRsvps: Record<string, string> = {};
         const counts: Record<string, { going: number; interested: number }> = {};
 
         rsvpData.forEach(rsvp => {
           if (rsvp.user_id === userId) {
             userRsvps[rsvp.event_id] = rsvp.status;
           }
           if (!counts[rsvp.event_id]) {
             counts[rsvp.event_id] = { going: 0, interested: 0 };
           }
           if (rsvp.status === 'going') counts[rsvp.event_id].going++;
           if (rsvp.status === 'interested') counts[rsvp.event_id].interested++;
         });
 
         setRsvps(userRsvps);
         setRsvpCounts(counts);
       }
     }
 
     setIsLoading(false);
   };
 
   const handleRSVP = async (eventId: string, status: 'going' | 'interested') => {
     if (!currentUserId) return;
 
     const currentStatus = rsvps[eventId];
 
     if (currentStatus === status) {
       // Remove RSVP
       await supabase
         .from("event_rsvps")
         .delete()
         .eq("event_id", eventId)
         .eq("user_id", currentUserId);
 
       setRsvps(prev => {
         const updated = { ...prev };
         delete updated[eventId];
         return updated;
       });
       setRsvpCounts(prev => ({
         ...prev,
         [eventId]: {
           ...prev[eventId],
           [status]: Math.max(0, (prev[eventId]?.[status] || 1) - 1)
         }
       }));
     } else if (currentStatus) {
       // Update RSVP
       await supabase
         .from("event_rsvps")
         .update({ status })
         .eq("event_id", eventId)
         .eq("user_id", currentUserId);
 
       setRsvps(prev => ({ ...prev, [eventId]: status }));
       setRsvpCounts(prev => ({
         ...prev,
         [eventId]: {
           going: (prev[eventId]?.going || 0) + (status === 'going' ? 1 : 0) - (currentStatus === 'going' ? 1 : 0),
           interested: (prev[eventId]?.interested || 0) + (status === 'interested' ? 1 : 0) - (currentStatus === 'interested' ? 1 : 0)
         }
       }));
     } else {
       // New RSVP
       await supabase
         .from("event_rsvps")
         .insert({ event_id: eventId, user_id: currentUserId, status });
 
       setRsvps(prev => ({ ...prev, [eventId]: status }));
       setRsvpCounts(prev => ({
         ...prev,
         [eventId]: {
           ...prev[eventId],
           [status]: (prev[eventId]?.[status] || 0) + 1
         }
       }));
     }
   };
 
   const handleCreateEvent = async () => {
     if (!currentUserId || !newEvent.name.trim() || !newEvent.start_date) return;
 
     setIsCreating(true);
 
     const { error } = await supabase.from("events").insert({
       name: newEvent.name.trim(),
       description: newEvent.description.trim() || null,
       location: newEvent.location.trim() || null,
       start_date: new Date(newEvent.start_date).toISOString(),
       end_date: newEvent.end_date ? new Date(newEvent.end_date).toISOString() : null,
       created_by: currentUserId,
     });
 
     setIsCreating(false);
 
     if (error) {
       toast({ title: "Error creating event", variant: "destructive" });
     } else {
       toast({ title: "Event created!" });
       setShowCreateDialog(false);
       setNewEvent({ name: "", description: "", location: "", start_date: "", end_date: "" });
       loadEvents(currentUserId);
     }
   };
 
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
 
       <div className="max-w-4xl mx-auto px-4 py-6">
         <div className="flex items-center justify-between mb-6">
           <h1 className="text-2xl font-bold">Events</h1>
           <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
             <DialogTrigger asChild>
               <Button className="gap-2">
                 <Plus className="h-4 w-4" />
                 Create Event
               </Button>
             </DialogTrigger>
             <DialogContent className="sm:max-w-lg">
               <DialogHeader>
                 <DialogTitle>Create Event</DialogTitle>
               </DialogHeader>
               <div className="space-y-4">
                 <Input
                   placeholder="Event name"
                   value={newEvent.name}
                   onChange={(e) => setNewEvent(prev => ({ ...prev, name: e.target.value }))}
                 />
                 <Textarea
                   placeholder="Description (optional)"
                   value={newEvent.description}
                   onChange={(e) => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
                   rows={3}
                 />
                 <Input
                   placeholder="Location (optional)"
                   value={newEvent.location}
                   onChange={(e) => setNewEvent(prev => ({ ...prev, location: e.target.value }))}
                 />
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-sm font-medium mb-1 block">Start Date & Time</label>
                     <Input
                       type="datetime-local"
                       value={newEvent.start_date}
                       onChange={(e) => setNewEvent(prev => ({ ...prev, start_date: e.target.value }))}
                     />
                   </div>
                   <div>
                     <label className="text-sm font-medium mb-1 block">End (optional)</label>
                     <Input
                       type="datetime-local"
                       value={newEvent.end_date}
                       onChange={(e) => setNewEvent(prev => ({ ...prev, end_date: e.target.value }))}
                     />
                   </div>
                 </div>
                 <Button
                   onClick={handleCreateEvent}
                   disabled={isCreating || !newEvent.name.trim() || !newEvent.start_date}
                   className="w-full"
                 >
                   {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                   Create Event
                 </Button>
               </div>
             </DialogContent>
           </Dialog>
         </div>
 
         {events.length === 0 ? (
           <div className="text-center py-12">
             <Calendar className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
             <p className="text-muted-foreground">No upcoming events</p>
             <p className="text-sm text-muted-foreground">Create one to get started!</p>
           </div>
         ) : (
           <div className="grid gap-4 md:grid-cols-2">
             {events.map((event) => (
               <Card key={event.id} className="overflow-hidden hover:shadow-md transition-shadow">
                 {event.cover_image && (
                   <img
                     src={event.cover_image}
                     alt={event.name}
                     className="w-full h-40 object-cover"
                   />
                 )}
                 <CardHeader className="pb-2">
                   <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                     <Clock className="h-4 w-4" />
                     {format(new Date(event.start_date), "EEE, MMM d · h:mm a")}
                   </div>
                   <CardTitle className="text-lg">{event.name}</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-3">
                   {event.location && (
                     <div className="flex items-center gap-2 text-sm text-muted-foreground">
                       <MapPin className="h-4 w-4" />
                       {event.location}
                     </div>
                   )}
                   {event.description && (
                     <p className="text-sm text-muted-foreground line-clamp-2">
                       {event.description}
                     </p>
                   )}
                   <div className="flex items-center gap-2 text-sm">
                     <Users className="h-4 w-4 text-muted-foreground" />
                     <span>{rsvpCounts[event.id]?.going || 0} going</span>
                     <span className="text-muted-foreground">·</span>
                     <span>{rsvpCounts[event.id]?.interested || 0} interested</span>
                   </div>
                   <div className="flex items-center gap-2 pt-2">
                     <Avatar className="h-6 w-6">
                       <AvatarImage src={event.profiles?.avatar_url || undefined} />
                       <AvatarFallback className="text-xs">
                         {event.profiles?.full_name?.[0]?.toUpperCase() || "U"}
                       </AvatarFallback>
                     </Avatar>
                     <span className="text-xs text-muted-foreground">
                       by {event.profiles?.full_name || "Someone"}
                     </span>
                   </div>
                   <div className="flex gap-2 pt-2">
                     <Button
                       variant={rsvps[event.id] === 'going' ? "default" : "outline"}
                       size="sm"
                       className="flex-1 gap-2"
                       onClick={() => handleRSVP(event.id, 'going')}
                     >
                       {rsvps[event.id] === 'going' && <Check className="h-4 w-4" />}
                       Going
                     </Button>
                     <Button
                       variant={rsvps[event.id] === 'interested' ? "secondary" : "outline"}
                       size="sm"
                       className="flex-1"
                       onClick={() => handleRSVP(event.id, 'interested')}
                     >
                       Interested
                     </Button>
                   </div>
                 </CardContent>
               </Card>
             ))}
           </div>
         )}
       </div>
     </div>
   );
 };
 
 export default Events;