const STUN_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/**
 * A TURN server relays the call when the two devices can't reach each other directly
 * (most mobile networks and many offices). Set your own in `.env`:
 *
 *   VITE_TURN_URLS="turn:example.com:3478,turns:example.com:5349"
 *   VITE_TURN_USERNAME="..."
 *   VITE_TURN_CREDENTIAL="..."
 *
 * Without one, calls still work on the same network or behind simple home routers.
 */
const configuredTurn = (): RTCIceServer[] => {
  const urls = import.meta.env.VITE_TURN_URLS
    ?.split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls?.length) return [];
  return [{
    urls,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  }];
};

// Public best-effort relay, used only when no TURN server is configured.
const FALLBACK_TURN: RTCIceServer[] = [
  {
    urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443?transport=tcp"],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export const getIceServers = (): RTCIceServer[] => {
  const turn = configuredTurn();
  return [...STUN_SERVERS, ...(turn.length ? turn : FALLBACK_TURN)];
};

/** Screen sharing needs getDisplayMedia, which phones don't have. */
export const canShareScreen = () =>
  typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

export const formatCallDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = sec.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
