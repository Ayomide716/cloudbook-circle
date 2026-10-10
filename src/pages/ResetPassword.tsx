import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logo from "@/assets/logo-mark.png";

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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <img src={logo} alt="" className="h-9 w-9 rounded-xl" />
          <span className="font-display text-xl font-bold gradient-text">Ember</span>
        </div>
        <h1 className="font-display text-2xl font-bold mb-1">Choose a new password</h1>

        {status === "checking" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground py-6" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your reset link…
          </p>
        )}

        {status === "invalid" && (
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              This reset link has expired or was already used. Ask for a new one from the sign-in page.
            </p>
            <Button asChild className="w-full rounded-xl">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={save} className="space-y-3 mt-4">
            <div>
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" autoComplete="new-password" className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" className="mt-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" className="w-full rounded-xl" disabled={saving || !password || !!error || password !== confirm}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
              Save new password
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
};

export default ResetPassword;
