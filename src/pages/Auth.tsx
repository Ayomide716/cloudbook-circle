import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, User, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session) navigate("/");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "Welcome back!" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast({ title: "Account created!", description: "Welcome to AYO-CHAT" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo & tagline */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 backdrop-blur-sm border border-primary/30 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-4xl font-display font-bold tracking-tight bg-gradient-to-r from-primary via-primary-glow to-primary bg-clip-text text-transparent">
              AYO-CHAT
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Connect with friends and the world around you
          </p>
        </motion.div>

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

            {/* Footer */}
            <p className="text-center text-xs text-muted-foreground mt-6">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
