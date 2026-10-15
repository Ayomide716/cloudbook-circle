import type { SyntheticEvent } from "react";

const reveal = (e: SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.dataset.loaded = "";
};

/**
 * Spread on an <img> so it comes into focus softly when it arrives (out of a blur, over the
 * grey box it sits in) instead of popping in line by line.
 */
export const softImage = { className: "img-soft", onLoad: reveal, onError: reveal };
