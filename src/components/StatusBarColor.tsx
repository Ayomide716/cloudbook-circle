import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { onStatusBarChange, statusBarForcedDark } from "@/lib/status-bar";

// The header's colour (--card) in each theme, so the phone's status bar and the header read
// as one piece, as in Facebook's app.
const HEADER_COLOR = { light: "#FFF8F1", dark: "#0C0C0E" } as const;

/**
 * Keeps the status bar the header's colour, including when you switch light/dark in the app,
 * and black over full-screen dark views (Reels, stories, photos, calls).
 */
const StatusBarColor = () => {
  const { resolvedTheme } = useTheme();
  const [forcedDark, setForcedDark] = useState(statusBarForcedDark());
  useEffect(() => onStatusBarChange(() => setForcedDark(statusBarForcedDark())), []);
  useEffect(() => {
    const color = forcedDark ? "#000000" : resolvedTheme === "dark" ? HEADER_COLOR.dark : HEADER_COLOR.light;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute("content", color);
      meta.removeAttribute("media"); // the app's own theme choice wins over the system's
    });
  }, [resolvedTheme, forcedDark]);
  return null;
};

export default StatusBarColor;
