/**
 * Ember's sticker pack: big 3D stickers (Microsoft's Fluent Emoji, MIT) bundled in
 * public/stickers. A sticker message is stored as "[sticker]:<id>" and shown on its own,
 * large and without a bubble, as on WhatsApp.
 */
export const STICKER_PREFIX = "[sticker]:";

export interface StickerPack {
  id: string;
  label: string;
  /** Sticker ids (file names in public/stickers) with their spoken names. */
  stickers: [id: string, name: string][];
}

export const STICKER_PACKS: StickerPack[] = [
  {
    id: "faces",
    label: "Faces",
    stickers: [
      ["1f602", "Tears of joy"], ["1f923", "Rolling on the floor laughing"], ["1f60d", "Heart eyes"], ["1f970", "Smiling with hearts"],
      ["1f618", "Blowing a kiss"], ["1f60e", "Cool"], ["1f914", "Thinking"], ["1f62d", "Crying"],
      ["1f97a", "Pleading"], ["1f621", "Angry"], ["1f631", "Screaming"], ["1f973", "Party face"],
      ["1f634", "Sleeping"], ["1f92f", "Mind blown"], ["1f644", "Eye roll"], ["1f60f", "Smirk"],
      ["1f917", "Hug"], ["1f92d", "Oops"], ["1fae0", "Melting"], ["1f976", "Freezing"],
      ["1f92b", "Shh"], ["1f480", "Dead"], ["1f47b", "Ghost"], ["1f608", "Mischief"],
    ],
  },
  {
    id: "hands",
    label: "Hands",
    stickers: [
      ["1f44d", "Thumbs up"], ["1f44f", "Clapping"], ["1f64c", "Raised hands"], ["1f64f", "Thank you"],
      ["1f44b", "Wave"], ["270c-fe0f", "Peace"], ["1f91d", "Handshake"], ["1f4aa", "Strong"],
      ["1faf6", "Heart hands"], ["1f44c", "OK"],
    ],
  },
  {
    id: "love",
    label: "Love & party",
    stickers: [
      ["2764-fe0f", "Red heart"], ["1f496", "Sparkling heart"], ["1f494", "Broken heart"], ["1f389", "Party popper"],
      ["1f382", "Birthday cake"], ["1f381", "Gift"], ["1f525", "Fire"], ["1f4af", "Hundred"],
      ["2728", "Sparkles"], ["1f3c6", "Trophy"], ["1f942", "Cheers"], ["1f680", "Rocket"],
    ],
  },
  {
    id: "animals",
    label: "Animals & food",
    stickers: [
      ["1f436", "Dog"], ["1f431", "Cat"], ["1f981", "Lion"], ["1f43c", "Panda"],
      ["1f98a", "Fox"], ["1f984", "Unicorn"], ["1f438", "Frog"], ["1f648", "See no evil"],
      ["1f437", "Pig"], ["1f355", "Pizza"], ["1f354", "Burger"], ["2615", "Coffee"],
      ["1f37f", "Popcorn"], ["1f308", "Rainbow"], ["2600-fe0f", "Sun"], ["1f319", "Moon"],
    ],
  },
];

const NAMES = new Map(STICKER_PACKS.flatMap((p) => p.stickers));

export const stickerMessage = (id: string) => `${STICKER_PREFIX}${id}`;

/** An animated GIPHY sticker: this text, with the sticker's GIPHY address as the message's image. */
export const GIPHY_STICKER = `${STICKER_PREFIX}giphy`;

/** The sticker id in a message, or null if it isn't a (known) sticker. */
export const stickerId = (content: string | null | undefined): string | null => {
  if (!content?.startsWith(STICKER_PREFIX)) return null;
  const id = content.slice(STICKER_PREFIX.length).trim();
  return NAMES.has(id) ? id : null;
};

export const stickerUrl = (id: string) => `/stickers/${id}.webp`;
export const stickerName = (id: string) => NAMES.get(id) ?? "Sticker";

/** What a sticker message reads as in chat lists and replies. */
export const previewText = (content: string) => (content?.startsWith(STICKER_PREFIX) ? "Sticker" : content);
