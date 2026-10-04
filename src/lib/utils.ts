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

/** Parses a timestamp column that may be null (treated as "now"). */
export function toDate(value: string | null | undefined): Date {
  return value ? new Date(value) : new Date();
}

/** Only allow same-site paths as post-login destinations (blocks open redirects). */
export function safeRedirectPath(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
