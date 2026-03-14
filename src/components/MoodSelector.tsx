import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const moods = [
  { emoji: "😊", label: "Happy", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  { emoji: "😢", label: "Sad", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  { emoji: "💪", label: "Motivated", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  { emoji: "😌", label: "Chill", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  { emoji: "😤", label: "Frustrated", color: "bg-red-500/10 text-red-600 border-red-500/20" },
  { emoji: "🤔", label: "Thoughtful", color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20" },
];

interface MoodSelectorProps {
  onMoodChange: (mood: string | null) => void;
  currentMood: string | null;
}

const MoodSelector = ({ onMoodChange, currentMood }: MoodSelectorProps) => {
  const [expanded, setExpanded] = useState(false);

  const selectedMood = moods.find(m => m.label.toLowerCase() === currentMood?.toLowerCase());

  return (
    <div className="flex items-center gap-2">
      {currentMood && selectedMood ? (
        <motion.button
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setExpanded(!expanded)}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all", selectedMood.color)}
        >
          <span>{selectedMood.emoji}</span>
          <span>Feeling {selectedMood.label}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onMoodChange(null); }}
            className="ml-1 hover:opacity-70"
          >
            <X className="h-3 w-3" />
          </button>
        </motion.button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-8"
        >
          <span>😊</span>
          How are you feeling?
        </Button>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -5 }}
            className="flex gap-1 flex-wrap"
          >
            {moods.map((mood) => (
              <motion.button
                key={mood.label}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  onMoodChange(mood.label.toLowerCase());
                  setExpanded(false);
                }}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs transition-all",
                  currentMood === mood.label.toLowerCase()
                    ? mood.color + " font-medium"
                    : "border-border hover:border-primary/30 text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{mood.emoji}</span>
                <span className="hidden sm:inline">{mood.label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MoodSelector;
