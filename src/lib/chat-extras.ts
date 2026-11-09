/**
 * What a chat message can carry besides text (messages.file / poll / event / quote, from
 * 20261109130000_messaging_like_whatsapp.sql), read safely from whatever the database holds.
 */
export interface ChatFile { url: string; name: string; size: number; type: string }
export interface ChatPoll { question: string; options: string[]; multiple: boolean }
export interface ChatEvent { title: string; starts_at: string; place: string }
export interface ChatQuote { name: string; text: string; group_id?: string; group_name?: string }

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function readFile(v: unknown): ChatFile | null {
  const o = obj(v);
  if (!o || typeof o.url !== "string" || !/^(https?:\/\/|blob:)/.test(o.url)) return null;
  return { url: o.url, name: String(o.name ?? "File").slice(0, 200), size: Number(o.size) || 0, type: String(o.type ?? "") };
}

export function readPoll(v: unknown): ChatPoll | null {
  const o = obj(v);
  if (!o || typeof o.question !== "string" || !Array.isArray(o.options) || o.options.length < 2) return null;
  return { question: o.question.slice(0, 300), options: o.options.slice(0, 12).map((x) => String(x).slice(0, 100)), multiple: !!o.multiple };
}

export function readEvent(v: unknown): ChatEvent | null {
  const o = obj(v);
  if (!o || typeof o.title !== "string" || typeof o.starts_at !== "string" || Number.isNaN(Date.parse(o.starts_at))) return null;
  return { title: o.title.slice(0, 200), starts_at: o.starts_at, place: typeof o.place === "string" ? o.place.slice(0, 200) : "" };
}

export function readQuote(v: unknown): ChatQuote | null {
  const o = obj(v);
  if (!o || typeof o.text !== "string") return null;
  return {
    name: String(o.name ?? "Someone").slice(0, 100),
    text: o.text.slice(0, 300),
    group_id: typeof o.group_id === "string" ? o.group_id : undefined,
    group_name: typeof o.group_name === "string" ? o.group_name.slice(0, 100) : undefined,
  };
}

/** "2.4 MB" */
export function fileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "PDF", "DOCX" from a file's name. */
export const fileKind = (name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 5) : "FILE");

/** Google Calendar link for an event (one hour long). */
export function calendarLink(e: ChatEvent): string {
  const start = new Date(e.starts_at);
  const end = new Date(start.getTime() + 3600_000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${f(start)}/${f(end)}`, location: e.place });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** Documents people can send: office files, PDFs, text and zips (never web pages or scripts). */
export const DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip,.epub,application/pdf";
