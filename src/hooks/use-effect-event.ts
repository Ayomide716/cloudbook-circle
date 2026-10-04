import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Stand-in for React 19.2's `useEffectEvent`.
 *
 * Returns a function with a stable identity that always calls the latest `fn`,
 * so effects can call loaders/handlers without re-running whenever those
 * functions are recreated. List the values that should actually trigger the
 * effect (ids, filters, ...) in the effect's dependency array.
 */
export function useEffectEvent<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
): (...args: Args) => Result {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
