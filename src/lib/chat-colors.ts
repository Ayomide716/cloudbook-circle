/** The bubble colours for each chat theme: yours and theirs. */
export const themeColors: Record<string, { sent: string; received: string }> = {
  // Dark mode: a deep ember for your messages and a raised warm grey for theirs.
  default: { sent: "bg-chat-sent text-primary-foreground dark:text-white", received: "bg-chat-surface text-foreground" },
  ocean: { sent: "bg-blue-600 text-white", received: "bg-blue-100 dark:bg-blue-900/40 text-foreground" },
  sunset: { sent: "bg-orange-700 text-white", received: "bg-orange-100 dark:bg-orange-900/40 text-foreground" },
  forest: { sent: "bg-green-700 text-white", received: "bg-green-100 dark:bg-green-900/40 text-foreground" },
  lavender: { sent: "bg-purple-600 text-white", received: "bg-purple-100 dark:bg-purple-900/40 text-foreground" },
  crimson: { sent: "bg-red-600 text-white", received: "bg-red-100 dark:bg-red-900/40 text-foreground" },
  midnight: { sent: "bg-indigo-600 text-white", received: "bg-indigo-100 dark:bg-indigo-900/40 text-foreground" },
};
