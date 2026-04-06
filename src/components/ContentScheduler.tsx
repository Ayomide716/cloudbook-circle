import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Clock, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ContentSchedulerProps {
  scheduledDate: Date | null;
  onScheduleChange: (date: Date | null) => void;
}

const ContentScheduler = ({ scheduledDate, onScheduleChange }: ContentSchedulerProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(scheduledDate || undefined);
  const [time, setTime] = useState(scheduledDate ? format(scheduledDate, "HH:mm") : "12:00");
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    if (!selectedDate) return;
    const [hours, minutes] = time.split(":").map(Number);
    const d = new Date(selectedDate);
    d.setHours(hours, minutes, 0, 0);
    if (d <= new Date()) return; // Must be in the future
    onScheduleChange(d);
    setOpen(false);
  };

  const handleClear = () => {
    onScheduleChange(null);
    setSelectedDate(undefined);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-1.5 text-xs", scheduledDate && "text-primary")}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {scheduledDate ? format(scheduledDate, "MMM d, h:mm a") : "Schedule"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 space-y-3" align="start">
        <p className="text-sm font-medium">Schedule post</p>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
          className="rounded-lg border"
        />
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-auto h-8 text-sm" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleClear} className="flex-1 text-xs">Clear</Button>
          <Button size="sm" onClick={handleConfirm} disabled={!selectedDate} className="flex-1 text-xs">Confirm</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ContentScheduler;
