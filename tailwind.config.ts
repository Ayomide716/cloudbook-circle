import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  // Hover colours only where there's a real mouse: on a phone they stuck after a tap, like a
  // grey flash that stayed (touch screens get a ripple instead: src/lib/ripple.ts).
  future: { hoverOnlyWhenSupported: true },
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Motion curves: a strong ease-out for things that appear or leave, the iOS drawer curve
      // for sheets. (Built-in ease and ease-out are too soft to feel deliberate.)
      transitionTimingFunction: {
        ui: "cubic-bezier(0.23, 1, 0.32, 1)",
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      fontFamily: {
        sans: ["Figtree Variable", "Figtree", "system-ui", "-apple-system", "sans-serif"],
        display: ["Figtree Variable", "Figtree", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        brand: "hsl(var(--brand))",
        // Count badges (unread, requests): one red, with white text that passes AA in both themes.
        badge: "hsl(0 72% 50%)",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        lime: {
          DEFAULT: "hsl(var(--lime))",
          foreground: "hsl(var(--lime-foreground))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          foreground: "hsl(var(--gold-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        chat: {
          surface: "hsl(var(--chat-surface))",
          sent: "hsl(var(--chat-sent))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        // Plain "rounded" (badges, chips, small images): 8px rather than a near-square 4px.
        DEFAULT: "0.5rem",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        // Typing dots: a soft wave (each dot brightens and lifts a little), not a bounce.
        "typing-dot": {
          "0%, 60%, 100%": { opacity: "0.35", transform: "translateY(0)" },
          "30%": { opacity: "1", transform: "translateY(-3px)" },
        },
        // A sticker landing in the chat.
        // The bell when something new arrives: a quick swing from the top, then still.
        "bell-ring": {
          "0%, 100%": { transform: "rotate(0)" },
          "15%": { transform: "rotate(14deg)" },
          "30%": { transform: "rotate(-12deg)" },
          "45%": { transform: "rotate(8deg)" },
          "60%": { transform: "rotate(-5deg)" },
          "75%": { transform: "rotate(2deg)" },
        },
        "sticker-pop": {
          "0%": { transform: "scale(0.4) rotate(-12deg)", opacity: "0" },
          "60%": { transform: "scale(1.08) rotate(3deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        // The welcome wave.
        wave: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "20%, 60%": { transform: "rotate(14deg)" },
          "40%, 80%": { transform: "rotate(-8deg)" },
        },
        // A reel's sound name drifting past in its pill: the text is there twice, so moving by
        // half its width loops without a gap or a cut-off word.
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "sound-bar": {
          "0%, 100%": { height: "30%" },
          "50%": { height: "100%" },
        },
        // Instagram's double-tap heart: bounces in with a little tilt, settles, then floats away.
        "heart-pop": {
          "0%": { transform: "scale(0) rotate(-14deg)", opacity: "0" },
          "14%": { transform: "scale(1.3) rotate(6deg)", opacity: "1" },
          "24%": { transform: "scale(0.92) rotate(-3deg)", opacity: "1" },
          "34%": { transform: "scale(1.06) rotate(0deg)", opacity: "1" },
          "44%": { transform: "scale(1)", opacity: "1" },
          "72%": { transform: "scale(1) translateY(0)", opacity: "1" },
          "100%": { transform: "scale(0.6) translateY(-90px)", opacity: "0" },
        },
        // The small hearts that fly out around it (direction set per heart with --dx / --dy).
        "heart-spark": {
          "0%": { transform: "translate(0, 0) scale(0.3)", opacity: "0" },
          "20%": { opacity: "1" },
          "100%": { transform: "translate(var(--dx), var(--dy)) scale(1)", opacity: "0" },
        },
        // "Posting…": fills most of the way quickly, then waits for the server.
        "post-progress": {
          "0%": { transform: "scaleX(0.04)" },
          "40%": { transform: "scaleX(0.6)" },
          "100%": { transform: "scaleX(0.92)" },
        },
        "accordion-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-accordion-content-height)", opacity: "1" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out": {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0", transform: "translateY(8px)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "scale-out": {
          from: { transform: "scale(1)", opacity: "1" },
          to: { transform: "scale(0.95)", opacity: "0" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-out-right": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 15px hsl(var(--primary) / 0.2)" },
          "50%": { boxShadow: "0 0 30px hsl(var(--primary) / 0.4)" },
        },
        "dock-bounce": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
      animation: {
        "typing-dot": "typing-dot 1.2s ease-in-out infinite",
        "bell-ring": "bell-ring 0.8s cubic-bezier(.36,.07,.19,.97) both",
        "sticker-pop": "sticker-pop 0.45s cubic-bezier(.2,.8,.3,1.2) both",
        marquee: "marquee 9s linear infinite",
        "sound-bar": "sound-bar 0.9s ease-in-out infinite",
        "heart-pop": "heart-pop 1.1s cubic-bezier(.2,.8,.3,1) forwards",
        "heart-spark": "heart-spark 0.75s ease-out 0.08s forwards",
        "post-progress": "post-progress 3s cubic-bezier(.1,.7,.3,1) forwards",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.25s cubic-bezier(0.23,1,0.32,1)",
        "fade-out": "fade-out 0.2s cubic-bezier(0.23,1,0.32,1)",
        "scale-in": "scale-in 0.2s cubic-bezier(0.23,1,0.32,1)",
        "scale-out": "scale-out 0.15s cubic-bezier(0.23,1,0.32,1)",
        "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.23,1,0.32,1)",
        "slide-out-right": "slide-out-right 0.25s cubic-bezier(0.23,1,0.32,1)",
        "slide-up": "slide-up 0.4s ease-out",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "dock-bounce": "dock-bounce 0.4s ease-in-out",
        enter: "fade-in 0.25s cubic-bezier(0.23,1,0.32,1), scale-in 0.2s cubic-bezier(0.23,1,0.32,1)",
        exit: "fade-out 0.2s cubic-bezier(0.23,1,0.32,1), scale-out 0.15s cubic-bezier(0.23,1,0.32,1)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;