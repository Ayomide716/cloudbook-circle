import { useDarkStatusBar } from "@/lib/status-bar";

/** Black status bar with light icons while this is on screen (see lib/status-bar). */
const DarkStatusBar = () => {
  useDarkStatusBar();
  return null;
};

export default DarkStatusBar;
