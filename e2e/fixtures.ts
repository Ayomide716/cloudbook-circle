import { deflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-123";
export const USERS = {
  alice: { email: "alice.e2e@example.com", name: "Alice Johnson" },
  bob: { email: "bob.e2e@example.com", name: "Bob Martins" },
  dave: { email: "dave.e2e@example.com", name: "Dave Okafor" },
  erin: { email: "erin.e2e@example.com", name: "Erin Adeyemi" },
} as const;
export type UserKey = keyof typeof USERS;

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Start Supabase locally and export it (see e2e/README.md).`);
  return value;
}

/** Service-role client for setting up data; never used by the app itself. */
export const admin = () =>
  createClient(env("E2E_SUPABASE_URL"), env("E2E_SUPABASE_SERVICE_KEY"), { auth: { persistSession: false } });

export async function signIn(page: Page, who: UserKey) {
  await page.goto("/auth");
  await page.fill('input[type="email"]', USERS[who].email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

/** A valid solid-colour PNG (32×32), so tests can upload photos without fixture files. */
export function pngBuffer(seed: number): Buffer {
  const palette = [[156, 201, 180], [227, 199, 154], [169, 196, 221], [201, 182, 228], [232, 179, 138]];
  const [r, g, b] = palette[seed % palette.length];
  const size = 32;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
