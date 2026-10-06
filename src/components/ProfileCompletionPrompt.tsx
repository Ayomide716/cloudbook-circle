import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { X, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface ProfileCompletionPromptProps {
  userId: string;
}

const ProfileCompletionPrompt = ({ userId }: ProfileCompletionPromptProps) => {
  const navigate = useNavigate();
  const [completion, setCompletion] = useState(100);
  const [nextStep, setNextStep] = useState("");
  const [dismissed, setDismissed] = useState(false);

  const checkCompletion = useEffectEvent(async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, cover_url, bio, location, work, education, website")
      .eq("id", userId)
      .single();

    if (!profile) return;

    const fields: { key: keyof typeof profile; label: string }[] = [
      { key: "full_name", label: "Add your name" },
      { key: "avatar_url", label: "Upload a profile photo" },
      { key: "cover_url", label: "Add a cover photo" },
      { key: "bio", label: "Write a bio" },
      { key: "location", label: "Add your location" },
      { key: "work", label: "Add your workplace" },
      { key: "education", label: "Add your education" },
    ];

    const filled = fields.filter((f) => !!profile[f.key]).length;
    const pct = Math.round((filled / fields.length) * 100);
    setCompletion(pct);

    const missing = fields.find((f) => !profile[f.key]);
    if (missing) setNextStep(missing.label);
  });

  useEffect(() => {
    checkCompletion();
  }, [userId, checkCompletion]);

  if (completion >= 100 || dismissed) return null;

  // One slim row: it's a nudge, not the first thing on the feed.
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="feed-section flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card px-3 py-2 sm:px-4"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            Your profile is {completion}% done
          </p>
          <Progress value={completion} className="mt-1.5 h-1" aria-label={`Profile ${completion}% complete. Next: ${nextStep}`} />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 rounded-full px-3 text-[12px]"
          onClick={() => navigate(`/profile/${userId}`)}
          title={`Next: ${nextStep}`}
        >
          Finish
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="-mr-1 shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProfileCompletionPrompt;
