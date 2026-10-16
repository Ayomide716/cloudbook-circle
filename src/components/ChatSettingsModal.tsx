import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Palette, Timer, Check } from "@/components/icons";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface ChatSettingsModalProps {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  otherUserId: string;
  onSettingsChanged: (theme: string, disappearingMinutes: number | null) => void;
}

const themes = [
  { id: "default", label: "Default", color: "bg-primary" },
  { id: "ocean", label: "Ocean", color: "bg-blue-600" },
  { id: "sunset", label: "Sunset", color: "bg-orange-700" },
  { id: "forest", label: "Forest", color: "bg-green-700" },
  { id: "lavender", label: "Lavender", color: "bg-purple-600" },
  { id: "crimson", label: "Crimson", color: "bg-red-600" },
  { id: "midnight", label: "Midnight", color: "bg-indigo-600" },
];

const disappearingOptions = [
  { value: null, label: "Off" },
  { value: 5, label: "5 min" },
  { value: 60, label: "1 hour" },
  { value: 1440, label: "24 hours" },
  { value: 10080, label: "7 days" },
];

const ChatSettingsModal = ({ open, onClose, currentUserId, otherUserId, onSettingsChanged }: ChatSettingsModalProps) => {
  const [selectedTheme, setSelectedTheme] = useState("default");
  const [disappearing, setDisappearing] = useState<number | null>(null);

  const loadPrefs = useEffectEvent(async () => {
    const { data } = await supabase
      .from("chat_preferences")
      .select("*")
      .eq("user_id", currentUserId)
      .eq("other_user_id", otherUserId)
      .maybeSingle();

    if (data) {
      setSelectedTheme(data.theme);
      setDisappearing(data.disappearing_minutes);
    }
  });

  useEffect(() => {
    if (open) loadPrefs();
  }, [open, loadPrefs]);

  const savePrefs = async () => {
    const { data: existing } = await supabase
      .from("chat_preferences")
      .select("id")
      .eq("user_id", currentUserId)
      .eq("other_user_id", otherUserId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("chat_preferences")
        .update({ theme: selectedTheme, disappearing_minutes: disappearing, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("chat_preferences")
        .insert({ user_id: currentUserId, other_user_id: otherUserId, theme: selectedTheme, disappearing_minutes: disappearing });
    }

    onSettingsChanged(selectedTheme, disappearing);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Chat Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Theme selector */}
          <div>
            <h4 className="text-sm font-semibold mb-3">Chat Theme</h4>
            <div className="grid grid-cols-4 gap-3">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTheme(t.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all border-2",
                    selectedTheme === t.id ? "border-primary bg-accent" : "border-transparent hover:bg-accent/50"
                  )}
                >
                  <div className={cn("h-8 w-8 rounded-full relative", t.color)}>
                    {selectedTheme === t.id && (
                      <Check className="h-4 w-4 text-white absolute inset-0 m-auto" />
                    )}
                  </div>
                  <span className="text-[11px] font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Disappearing messages */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Disappearing Messages
            </h4>
            <div className="flex flex-wrap gap-2">
              {disappearingOptions.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setDisappearing(opt.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
                    disappearing === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-secondary-foreground border-border hover:bg-accent"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={savePrefs} className="w-full">Save Settings</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChatSettingsModal;
