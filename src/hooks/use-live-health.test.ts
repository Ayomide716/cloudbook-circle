import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLiveHealth } from "./use-live-health";

describe("useLiveHealth", () => {
  it("marks the connection down on failure and asks to retry after a wait", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLiveHealth());
    const w = result.current.watch();
    act(() => w.onStatus("CHANNEL_ERROR"));
    expect(result.current.live).toBe(false);
    expect(result.current.attempt).toBe(0);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.attempt).toBe(1);
    const w2 = result.current.watch();
    act(() => w2.onStatus("SUBSCRIBED"));
    expect(result.current.live).toBe(true);
    vi.useRealTimers();
  });

  it("ignores the CLOSED that comes from tearing the channel down", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLiveHealth());
    const w = result.current.watch();
    w.stop();
    act(() => w.onStatus("CLOSED"));
    act(() => { vi.advanceTimersByTime(30000); });
    expect(result.current.live).toBe(true);
    expect(result.current.attempt).toBe(0);
    vi.useRealTimers();
  });
});
