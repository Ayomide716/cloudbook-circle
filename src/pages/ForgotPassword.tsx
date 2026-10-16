import { publicUrl } from "@/lib/native/platform";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, Mail } from "@/components/icons";
import { Button } from "@/components/ui/button";
import AuthShell, { AuthBrand } from "@/components/auth/AuthShell";
import AuthField from "@/components/auth/AuthField";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";

const RESEND_SECONDS = 30;

/**
 * "Forgot password?": its own page. Type your email, get a link that opens /reset-password.
 * Says the same thing whether or not the address has an account, so it can't be used to
 * find out who's on Ember.
 */
const ForgotPassword = () => {
  useSEO({ title: "Reset your password", description: "Get a link to choose a new Ember password." });
  const { toast } = useToast();
  const location = useLocation();
  const [email, setEmail] = useState(() => (location.state as { email?: string } | null)?.email ?? "");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const send = async (address: string) => {
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: publicUrl("/reset-password"),
    });
    setSending(false);
    if (error) {
      toast({
        title: "Couldn't send the email",
        description: /rate|seconds/i.test(error.message) ? "Please wait a minute before asking again." : error.message,
        variant: "destructive",
      });
      return;
    }
    setSentTo(address);
    setWait(RESEND_SECONDS);
  };

  return (
    <AuthShell showPanel={false}>
      <Link
        to="/auth"
        className="-ml-2 mb-6 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[14px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to log in
      </Link>
      <AuthBrand always />

      <AnimatePresence mode="wait" initial={false}>
        {!sentTo ? (
          <motion.div key="ask" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
            <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">Forgot your password?</h1>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
              Enter the email you signed up with and we'll send you a link to choose a new one.
            </p>
            <form
              className="mt-6 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) void send(email.trim());
              }}
            >
              <AuthField
                id="reset-email"
                label="Email"
                icon={Mail}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus={!email}
                disabled={sending}
              />
              <Button type="submit" className="h-[52px] w-full rounded-full text-[15px] font-semibold" disabled={sending || !email.trim()}>
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send reset link"}
              </Button>
            </form>
          </motion.div>
        ) : (
          <motion.div key="sent" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.2 }} className="text-center">
            <motion.div initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 380, damping: 16 }} className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[28px] bg-primary/10">
              <Mail className="h-9 w-9 text-primary" />
            </motion.div>
            <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">Check your email</h1>
            <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              If <span className="font-semibold text-foreground">{sentTo}</span> has an Ember account, a link to reset your password is on its way. It can take a minute; check your spam folder too.
            </p>
            <div className="mt-7 space-y-2.5">
              <Button asChild className="h-[52px] w-full rounded-full text-[15px] font-semibold">
                <Link to="/auth">Back to log in</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full rounded-full text-[14px] font-semibold"
                disabled={sending || wait > 0}
                onClick={() => void send(sentTo)}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : wait > 0 ? `Resend in ${wait}s` : "Resend the email"}
              </Button>
              <button type="button" onClick={() => setSentTo(null)} className="text-[13px] font-semibold text-primary hover:underline">
                Use a different email
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  );
};

export default ForgotPassword;
