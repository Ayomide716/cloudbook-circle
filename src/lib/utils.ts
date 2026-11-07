import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

/**
 * What to tell people when something fails: plain words for network trouble and the database's
 * own messages ("JSON object requested, multiple (or no) rows returned"), and the message as it
 * is when it's already written for people (an upload or sign-in error, say).
 */
export function friendlyError(error: unknown): string {
  const message = getErrorMessage(error);
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code ?? "") : "";
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed|timed? ?out|aborted/i.test(message)) {
    return "Couldn't connect. Check your connection and try again.";
  }
  if (code === "PGRST116" || /JSON object requested/i.test(message)) return "We couldn't find that. It may have been deleted.";
  if (code === "23505" || /duplicate key/i.test(message)) return "That's already done.";
  if (code === "42501" || /row-level security|permission denied/i.test(message)) return "You can't do that here.";
  if (/jwt|refresh token/i.test(message)) return "Your session ended. Please sign in again.";
  if (/^PGRST/.test(code) || /^[0-9A-Z]{5}$/.test(code) || /violates|syntax error|does not exist|invalid input syntax|schema cache/i.test(message)) {
    return "Something went wrong on our side. Please try again.";
  }
  return message;
}

/** Parses a timestamp column that may be null (treated as "now"). */
export function toDate(value: string | null | undefined): Date {
  return value ? new Date(value) : new Date();
}

/**
 * Only allow same-site paths as post-login destinations (blocks open redirects).
 * Browsers read "//host" and "/\host" alike as another site, so both are refused.
 */
export function safeRedirectPath(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}
