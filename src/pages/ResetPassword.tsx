import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Loader2, Lock } from "@/components/icons";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import { Button } from "@/components/ui/button";
import AuthShell, { AuthBrand } from "@/components/auth/AuthShell";
import AuthField from "@/components/auth/AuthField";

/**
 * Where the "reset your password" email link lands. Supabase signs the visitor in
 * from the link (a recovery session); they choose a new password here.
 */
const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Reset password", description: "Choose a new password for Ember." });
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let settled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        settled = true;
        setStatus("ready");
      }
    });
    // The link may already have been handled before this page mounted.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        settled = true;
        setStatus("ready");
      }
    });
    // An expired or already-used link never produces a session.
    const timer = window.setTimeout(() => { if (!settled) setStatus("invalid"); }, 4000);
    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const error =
    password && password.length < 8 ? "At least 8 characters"
    : confirm && confirm !== password ? "The passwords don't match"
    : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || error || password !== confirm) return;
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      toast({ title: "Couldn't change your password", description: updateError.message, variant: "destructive" });
      return;
    }
    toast({ title: "Password changed", description: "You're signed in with your new password." });
    navigate("/", { replace: true });
  };

  return (
    <AuthShell showPanel={false}>
      <AuthBrand always />
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">Choose a new password</h1>

      {status === "checking" && (
        <p className="flex items-center gap-2 py-6 text-[15px] text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your reset link…
        </p>
      )}

      {status === "invalid" && (
        <div className="space-y-5 py-3">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            This reset link has expired or was already used. Ask for a new one from the sign-in page.
          </p>
          <Button asChild className="h-[52px] w-full rounded-full text-[15px] font-semibold">
            <Link to="/auth">Back to sign in</Link>
          </Button>
          <Button asChild variant="ghost" className="h-11 w-full rounded-full text-[14px] font-semibold">
            <Link to="/forgot-password">Send me a new link</Link>
          </Button>
        </div>
      )}

      {status === "ready" && (
        <form onSubmit={save} className="mt-6 space-y-4">
          <AuthField
            id="new-password"
            label="New password"
            icon={Lock}
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <AuthField
            id="confirm-password"
            label="Confirm new password"
            icon={Lock}
            type="password"
            autoComplete="new-password"
            placeholder="Type it again"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <p className="pl-1 text-[13px] font-medium text-destructive">{error}</p>}
          <Button type="submit" className="h-[52px] w-full rounded-full text-[15px] font-semibold" disabled={saving || !password || !!error || password !== confirm}>
            {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Save new password
          </Button>
        </form>
      )}
    </AuthShell>
  );
};

export default ResetPassword;
