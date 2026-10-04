import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, User, ArrowRight, MessageCircle, Video, Users, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, getErrorMessage, safeRedirectPath } from "@/lib/utils";
import logo from "@/assets/logo-new.webp";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  // Page the visitor was trying to open before being asked to sign in.
  const redirectPath = safeRedirectPath(searchParams.get("redirect"));

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate(redirectPath, { replace: true });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session) navigate(redirectPath, { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate, redirectPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "Welcome back!" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast({ title: "Account created!", description: "Welcome to CloudBook!" });
      }
    } catch (error) {
      toast({ title: "Error", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="auth-gradient-bg" />

      {/* Floating orbs */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />

      {/* Grid overlay */}
      <div className="absolute inset-0 auth-grid-overlay pointer-events-none" />

      <div className="w-full max-w-6xl relative z-10 grid lg:grid-cols-2 lg:gap-16 items-center">
      {/* Wide screens: what CloudBook is, next to the form (this page is the front door). */}
      <motion.section
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="hidden lg:block"
        aria-label="About CloudBook"
      >
        <div className="flex items-center gap-3 mb-6">
          <img src={logo} alt="" className="h-12 w-12 rounded-xl" />
          <span className="text-4xl font-display font-bold tracking-tight gradient-text">CloudBook</span>
        </div>
        <h2 className="text-5xl font-display font-bold leading-[1.1] tracking-tight mb-5">
          Your people, your communities, <span className="gradient-text">one place.</span>
        </h2>
        <p className="text-lg text-muted-foreground mb-8 max-w-lg">
          Share posts and stories, chat in real time, call friends, and build communities around what you love.
        </p>
        <ul className="grid grid-cols-2 gap-3 max-w-lg">
          {[
            { icon: MessageCircle, title: "Real-time chat", text: "Messages, voice notes and reactions" },
            { icon: Video, title: "Voice & video calls", text: "One-to-one and group calls" },
            { icon: Users, title: "Communities", text: "Groups, pages, events and voice rooms" },
            { icon: Sparkles, title: "Stories & reels", text: "Plus CloudBuddy, your AI companion" },
          ].map((f) => (
            <li key={f.title} className="flex gap-3 rounded-2xl bg-card/70 border border-border/60 p-4 backdrop-blur-sm">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <f.icon className="h-[18px] w-[18px]" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{f.title}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md mx-auto relative"
      >
        {/* Logo & tagline (phones and tablets; wide screens show the panel instead) */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-center mb-8 lg:hidden"
        >
          <div className="inline-flex items-center gap-2 mb-3">
            <img src={logo} alt="CloudBook" className="h-10 w-10 rounded-xl" />
            <span className="text-4xl font-display font-bold tracking-tight gradient-text">
              CloudBook
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Connect with friends and the world around you
          </p>
        </motion.div>
        <h1 className="sr-only lg:not-sr-only lg:block text-2xl font-display font-bold mb-6 text-center">
          {isLogin ? "Welcome back" : "Create your account"}
        </h1>

        {/* Glass card */}
        <div className="auth-card rounded-2xl p-[1px]">
          <div className="auth-card-inner rounded-2xl p-6 sm:p-8">
            {/* Tab switcher */}
            <div className="flex rounded-xl bg-muted/50 p-1 mb-6 relative">
              <motion.div
                className="absolute top-1 bottom-1 rounded-lg bg-primary shadow-lg"
                style={{ width: "calc(50% - 4px)" }}
                animate={{ x: isLogin ? 0 : "calc(100% + 8px)" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className={cn(
                  "flex-1 text-sm font-semibold py-2.5 rounded-lg relative z-10 transition-colors duration-200",
                  isLogin ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className={cn(
                  "flex-1 text-sm font-semibold py-2.5 rounded-lg relative z-10 transition-colors duration-200",
                  !isLogin ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence mode="wait">
                {!isLogin && (
                  <motion.div
                    key="fullname"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1.5 pb-1">
                      <Label htmlFor="fullName" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Full Name
                      </Label>
                      <div className={cn(
                        "auth-input-wrapper rounded-xl transition-all duration-300",
                        focusedField === "fullName" && "auth-input-focused"
                      )}>
                        <div className="relative flex items-center">
                          <User className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                          <Input
                            id="fullName"
                            type="text"
                            placeholder="John Doe"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            onFocus={() => setFocusedField("fullName")}
                            onBlur={() => setFocusedField(null)}
                            required={!isLogin}
                            disabled={isLoading}
                            className="auth-input pl-10"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Email
                </Label>
                <div className={cn(
                  "auth-input-wrapper rounded-xl transition-all duration-300",
                  focusedField === "email" && "auth-input-focused"
                )}>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField("email")}
                      onBlur={() => setFocusedField(null)}
                      required
                      disabled={isLoading}
                      className="auth-input pl-10"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Password
                </Label>
                <div className={cn(
                  "auth-input-wrapper rounded-xl transition-all duration-300",
                  focusedField === "password" && "auth-input-focused"
                )}>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                      required
                      disabled={isLoading}
                      minLength={6}
                      className="auth-input pl-10"
                    />
                  </div>
                </div>
              </div>

              <motion.div whileTap={{ scale: 0.98 }}>
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl text-sm font-semibold auth-submit-btn group"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {isLogin ? "Log In" : "Create Account"}
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
              </motion.div>
            </form>

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or continue with</span>
              </div>
            </div>

            {/* Google Sign In */}
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 rounded-xl text-sm font-semibold gap-3"
                disabled={isGoogleLoading}
                onClick={async () => {
                  setIsGoogleLoading(true);
                  try {
                    const result = await lovable.auth.signInWithOAuth("google", {
                      redirect_uri: `${window.location.origin}${redirectPath}`,
                    });
                    if (result?.error) {
                      toast({ title: "Google sign in failed", description: String(result.error), variant: "destructive" });
                    }
                  } catch (error) {
                    toast({ title: "Error", description: getErrorMessage(error), variant: "destructive" });
                  } finally {
                    setIsGoogleLoading(false);
                  }
                }}
              >
                {isGoogleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </Button>
            </motion.div>

            {/* Footer */}
            <p className="text-center text-xs text-muted-foreground mt-6">
              By continuing, you agree to our{" "}
              <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">Terms of Service</Link> and{" "}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>
            </p>
          </div>
        </div>
      </motion.div>
      </div>
    </div>
  );
};

export default Auth;
