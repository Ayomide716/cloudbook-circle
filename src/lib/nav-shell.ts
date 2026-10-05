import { createContext } from "react";

/**
 * The app keeps one header and bottom bar for all signed-in pages (as Facebook does),
 * so they don't disappear and come back on every page change. Pages still render
 * <Navigation />, which then only passes its settings to the shell.
 */
export interface NavShell {
  setHideMobileTopBar: (hide: boolean) => void;
}

export const NavShellContext = createContext<NavShell | null>(null);
