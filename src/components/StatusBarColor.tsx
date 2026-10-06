import { useEffect } from "react";
import { useTheme } from "next-themes";

// The header's colour (--card) in each theme, so the phone's status bar and the header read
// as one piece, as in Facebook's app.
const HEADER_COLOR = { light: "#FFFFFF", dark: "#0B121E" } as const;

/** Keeps the status bar the header's colour, including when you switch light/dark in the app. */
const StatusBarColor = () => {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const color = resolvedTheme === "dark" ? HEADER_COLOR.dark : HEADER_COLOR.light;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute("content", color);
      meta.removeAttribute("media"); // the app's own theme choice wins over the system's
    });
  }, [resolvedTheme]);
  return null;
};

export default StatusBarColor;
