/** The Ember page a scanned code points to (a profile, post or group), or null. */
export function emberPathFromCode(text: string): string | null {
  try {
    const url = new URL(text.trim());
    const m = url.pathname.match(/^\/(profile|post|groups)\/[0-9a-f-]{36}$/i);
    return m ? url.pathname : null;
  } catch {
    return null;
  }
}

