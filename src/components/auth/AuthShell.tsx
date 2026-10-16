import type { ReactNode } from "react";
import { motion } from "framer-motion";
import Wordmark from "@/components/Wordmark";
import ReactionEmoji from "@/components/reactions/ReactionEmoji";
import { TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";

// A few of Ember's 3D faces drifting beside the wordmark: a little life on the front door.
const FLOATERS = [
  { type: "love", className: "right-[8%] top-[22%] h-12 w-12 rotate-[10deg]", delay: 0.6 },
  { type: "haha", className: "left-[14%] bottom-[18%] h-12 w-12 rotate-[8deg]", delay: 1.1 },
  { type: "fire", className: "right-[14%] bottom-[12%] h-14 w-14 rotate-[-6deg]", delay: 0.3 },
  { type: "party", className: "left-[44%] top-[6%] h-10 w-10 rotate-[4deg]", delay: 1.5 },
];

interface AuthShellProps {
  children: ReactNode;
  /** Wide screens: show Ember's welcome panel beside the form. */
  showPanel?: boolean;
  className?: string;
}

/**
 * The look shared by sign in, forgot password and reset password: a warm glow on the page,
 * the "ember." wordmark, and (on wide screens) a welcome panel with floating 3D emoji.
 */
const AuthShell = ({ children, showPanel = true, className }: AuthShellProps) => (
  <div className="relative min-h-[100dvh] overflow-hidden bg-background">

    <div className={cn("relative mx-auto grid min-h-[100dvh] w-full max-w-6xl items-center px-5 py-10 lg:grid-cols-2 lg:gap-16", !showPanel && "lg:grid-cols-1", className)}>
      {showPanel && (
        <motion.section
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          aria-label="About Ember"
          className="relative hidden h-[520px] lg:block"
        >
          {FLOATERS.map((f) => (
            <motion.div
              key={f.type}
              aria-hidden="true"
              className={cn("absolute", f.className)}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
              transition={{ opacity: { delay: f.delay * 0.4 }, scale: { delay: f.delay * 0.4, type: "spring" }, y: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: f.delay } }}
            >
              <ReactionEmoji type={f.type} className="h-full w-full drop-shadow-xl" />
            </motion.div>
          ))}
          <div className="absolute inset-0 flex flex-col justify-center pl-4">
            <Wordmark className="text-7xl" />
            <p className="mt-5 max-w-md font-display text-3xl font-bold leading-tight tracking-tight">
              {TAGLINE}
            </p>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Posts, chats, reels and groups with the people who matter, in one warm place.
            </p>
          </div>
        </motion.section>
      )}

      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mx-auto w-full max-w-[400px]"
      >
        {children}
      </motion.main>
    </div>
  </div>
);

/** The wordmark and tagline at the top of the form (phones, and forms without the panel). */
export const AuthBrand = ({ always = false }: { always?: boolean }) => (
  <div className={cn("mb-8 flex flex-col items-center text-center", !always && "lg:hidden")}>
    <Wordmark className="text-[52px]" />
    <p className="mt-2 text-[15px] text-muted-foreground">{TAGLINE}</p>
  </div>
);

export default AuthShell;
