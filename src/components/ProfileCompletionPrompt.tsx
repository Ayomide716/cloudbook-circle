import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { X, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileCompletionPromptProps {
  userId: string;
}

const ProfileCompletionPrompt = ({ userId }: ProfileCompletionPromptProps) => {
  const navigate = useNavigate();
  const [completion, setCompletion] = useState(100);
  const [nextStep, setNextStep] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkCompletion();
  }, [userId]);

  const checkCompletion = async () => {
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
  };

  if (completion >= 100 || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="relative p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 border border-border/50"
      >
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold font-display">Complete your profile</span>
          <span className="text-xs text-muted-foreground ml-auto mr-6">{completion}%</span>
        </div>

        <Progress value={completion} className="h-2 mb-3" />

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Next: {nextStep}</p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs rounded-full"
            onClick={() => navigate(`/profile/${userId}`)}
          >
            Complete now
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProfileCompletionPrompt;
