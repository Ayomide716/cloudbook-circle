import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MessageCircleQuestion, Send, Loader2, Trash2, Eye, EyeOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface AnonymousQAProps {
  profileId: string;
  isOwnProfile: boolean;
  currentUserId: string | null;
}

interface Question {
  id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  is_public: boolean;
  created_at: string;
}

const AnonymousQA = ({ profileId, isOwnProfile, currentUserId }: AnonymousQAProps) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [answerText, setAnswerText] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const loadQuestions = useEffectEvent(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("anonymous_questions")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false });
    setQuestions((data as Question[]) || []);
    setLoading(false);
  });

  useEffect(() => {
    loadQuestions();
  }, [profileId, loadQuestions]);

  const askQuestion = async () => {
    if (!newQuestion.trim() || !currentUserId) return;
    setSubmitting(true);
    const { error } = await supabase.from("anonymous_questions").insert({
      profile_id: profileId,
      question: newQuestion.trim(),
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Question sent", description: "They'll see it anonymously." });
      setNewQuestion("");
      loadQuestions();
    }
    setSubmitting(false);
  };

  const answerQuestion = async (id: string) => {
    const answer = answerText[id]?.trim();
    if (!answer) return;
    const { error } = await supabase
      .from("anonymous_questions")
      .update({ answer, answered_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", variant: "destructive" });
    } else {
      toast({ title: "Answer posted!" });
      setAnswerText(prev => ({ ...prev, [id]: "" }));
      loadQuestions();
    }
  };

  const deleteQuestion = async (id: string) => {
    await supabase.from("anonymous_questions").delete().eq("id", id);
    loadQuestions();
  };

  const toggleVisibility = async (id: string, isPublic: boolean) => {
    await supabase.from("anonymous_questions").update({ is_public: !isPublic }).eq("id", id);
    loadQuestions();
  };

  // For visitors: show only answered public questions
  const visibleQuestions = isOwnProfile
    ? questions
    : questions.filter(q => q.answer && q.is_public);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircleQuestion className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-lg">Ask Me Anything</h3>
      </div>

      {/* Ask form (for non-owners) */}
      {!isOwnProfile && currentUserId && (
        <Card className="p-4 space-y-3">
          <Textarea
            placeholder="Ask an anonymous question..."
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            className="min-h-[80px]"
            maxLength={500}
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">Your identity will be hidden</p>
            <Button size="sm" onClick={askQuestion} disabled={submitting || !newQuestion.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Ask</>}
            </Button>
          </div>
        </Card>
      )}

      {/* Questions list */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading questions...</div>
      ) : visibleQuestions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {isOwnProfile ? "No questions yet. Share your profile to get asked!" : "No questions answered yet."}
        </div>
      ) : (
        <AnimatePresence>
          {visibleQuestions.map((q) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Card className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">{q.question}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {isOwnProfile && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleVisibility(q.id, q.is_public)}>
                        {q.is_public ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteQuestion(q.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {q.answer ? (
                  <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                    <p className="text-sm">{q.answer}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Answered {q.answered_at ? formatDistanceToNow(new Date(q.answered_at), { addSuffix: true }) : ""}
                    </p>
                  </div>
                ) : isOwnProfile ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Write your answer..."
                      value={answerText[q.id] || ""}
                      onChange={(e) => setAnswerText(prev => ({ ...prev, [q.id]: e.target.value }))}
                      className="min-h-[60px]"
                    />
                    <Button size="sm" onClick={() => answerQuestion(q.id)} disabled={!answerText[q.id]?.trim()}>
                      Answer
                    </Button>
                  </div>
                ) : null}
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
};

export default AnonymousQA;
