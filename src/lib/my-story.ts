import { useSyncExternalStore } from "react";

/**
 * Your own story, shared between the stories row (which loads stories and owns the viewer and
 * the "Create story" sheet) and your photo by "What's on your mind?" (which shows a glowing
 * ring while your story is up, and opens it or adds one).
 */
type MyStory = { has: boolean; closeFriends: boolean };
let state: MyStory = { has: false, closeFriends: false };
const listeners = new Set<() => void>();

export function setMyStory(next: MyStory) {
  if (next.has === state.has && next.closeFriends === state.closeFriends) return;
  state = next;
  listeners.forEach((l) => l());
}

export function useMyStory(): MyStory {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => state,
  );
}

export const MY_STORY_EVENT = "ember:my-story";
/** Ask the stories row to play your story ("view") or open "Create story" ("create"). */
export function requestMyStory(action: "view" | "create") {
  window.dispatchEvent(new CustomEvent(MY_STORY_EVENT, { detail: action }));
}
