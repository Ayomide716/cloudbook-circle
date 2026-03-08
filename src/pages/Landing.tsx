import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  MessageCircle,
  Users,
  Video,
  Shield,
  Zap,
  Globe,
  ArrowRight,
  Sparkles,
  Heart,
  Bell,
} from "lucide-react";
import logo from "@/assets/logo.png";
import phone1 from "@/assets/landing-phone-1.png";
import phone2 from "@/assets/landing-phone-2.png";

const spring = { type: "spring" as const, stiffness: 200, damping: 25 };

const features = [
  {
    icon: MessageCircle,
    title: "Instant Messaging",
    desc: "Real-time chat with reactions, voice messages, and disappearing messages.",
  },
  {
    icon: Users,
    title: "Groups & Pages",
    desc: "Create communities, join groups, and build pages around your passions.",
  },
  {
    icon: Video,
    title: "Reels & Watch",
    desc: "Share short-form videos and discover long-form content from creators.",
  },
  {
    icon: Shield,
    title: "Privacy First",
    desc: "End-to-end encrypted chats and granular privacy controls you own.",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    desc: "Virtualized feeds and optimistic UI for zero-lag interactions.",
  },
  {
    icon: Globe,
    title: "Marketplace",
    desc: "Buy and sell locally with built-in listings and secure messaging.",
  },
];

const stats = [
  { value: "10K+", label: "Active Users" },
  { value: "500K+", label: "Messages Sent" },
  { value: "99.9%", label: "Uptime" },
  { value: "4.9★", label: "User Rating" },
];

const Landing = () => {
  const navigate = useNavigate();
  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -60]);
  const phoneScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.92]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/");
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 inset-x-0 z-50 glass">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="CloudBook" className="h-9 w-9 rounded-xl" />
            <span className="text-xl font-display font-bold gradient-text">CloudBook</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/auth">Log In</Link>
            </Button>
            <Button size="sm" className="gradient-brand text-primary-foreground rounded-xl glow-primary" asChild>
              <Link to="/auth">Get Started <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 px-6">
        {/* Orbs */}
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />

        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center relative z-10">
          <motion.div style={{ y: heroY }}>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.1 }}
            >
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-6">
                <Sparkles className="h-3.5 w-3.5" /> Now in public beta
              </span>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-display font-extrabold leading-[1.05] tracking-tight mb-6">
                Your social life,{" "}
                <span className="gradient-text">reimagined.</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-lg mb-8 leading-relaxed">
                CloudBook is the next-gen social platform where conversations feel instant,
                communities thrive, and your data stays yours.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" className="gradient-brand text-primary-foreground rounded-xl h-12 px-8 text-base glow-primary" asChild>
                  <Link to="/auth">
                    Join CloudBook <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="rounded-xl h-12 px-8 text-base" asChild>
                  <a href="#features">Explore Features</a>
                </Button>
              </div>
            </motion.div>
          </motion.div>

          {/* Phone mockups */}
          <motion.div
            className="relative flex justify-center lg:justify-end"
            style={{ scale: phoneScale }}
          >
            <motion.div
              initial={{ opacity: 0, x: 40, rotate: 6 }}
              animate={{ opacity: 1, x: 0, rotate: 3 }}
              transition={{ ...spring, delay: 0.3 }}
              className="relative z-10"
            >
              <img
                src={phone1}
                alt="CloudBook feed"
                className="w-56 sm:w-64 drop-shadow-2xl rounded-[2rem]"
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -40, rotate: -6 }}
              animate={{ opacity: 1, x: 0, rotate: -3 }}
              transition={{ ...spring, delay: 0.5 }}
              className="absolute top-8 -left-4 sm:left-0 lg:-left-8 z-0"
            >
              <img
                src={phone2}
                alt="CloudBook messaging"
                className="w-48 sm:w-56 drop-shadow-2xl rounded-[2rem] opacity-85"
              />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── Stats bar ─── */}
      <section className="border-y border-border bg-card/50">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...spring, delay: i * 0.1 }}
              className="py-8 text-center"
            >
              <div className="text-3xl font-display font-bold gradient-text">{s.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Features bento grid ─── */}
      <section id="features" className="py-20 sm:py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={spring}
            className="text-center mb-14"
          >
            <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">
              Everything you need,{" "}
              <span className="gradient-text">nothing you don't.</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              A full-featured social experience crafted with performance and privacy at its core.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...spring, delay: i * 0.08 }}
                whileHover={{ y: -4, scale: 1.02 }}
                className="bento-card p-6 group cursor-default"
              >
                <div className="w-12 h-12 rounded-xl gradient-brand-soft flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-display font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Social proof / CTA ─── */}
      <section className="py-20 sm:py-28 px-6 relative overflow-hidden">
        <div className="auth-orb auth-orb-2" style={{ top: "-80px", right: "-80px", left: "auto", bottom: "auto" }} />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={spring}
          >
            <div className="flex justify-center gap-2 mb-6">
              {[Heart, Bell, MessageCircle].map((Icon, i) => (
                <motion.div
                  key={i}
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 2, delay: i * 0.3, repeat: Infinity }}
                  className="w-12 h-12 rounded-xl gradient-brand flex items-center justify-center"
                >
                  <Icon className="h-5 w-5 text-primary-foreground" />
                </motion.div>
              ))}
            </div>
            <h2 className="text-3xl sm:text-5xl font-display font-bold mb-5">
              Ready to join the cloud?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
              Sign up in seconds. No tracking, no ads—just you and the people you care about.
            </p>
            <Button
              size="lg"
              className="gradient-brand text-primary-foreground rounded-xl h-14 px-10 text-lg glow-primary"
              asChild
            >
              <Link to="/auth">
                Create Your Account <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={logo} alt="CloudBook" className="h-7 w-7 rounded-lg" />
            <span className="font-display font-semibold gradient-text">CloudBook</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} CloudBook. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
