import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { isRepeatSend, useSingleFlight } from "./use-single-flight";

describe("useSingleFlight", () => {
  it("ignores taps while the first one is still saving, then allows the next", async () => {
    const { result } = renderHook(() => useSingleFlight());
    let finish: () => void = () => {};
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((r) => { finish = r; }))
      .mockResolvedValue(undefined);
    const handle = result.current(save);
    const first = handle();
    void handle();
    void handle();
    expect(save).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await handle();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("still stops an ignored form submit from reloading the page", async () => {
    const { result } = renderHook(() => useSingleFlight());
    const handle = result.current((_e: { preventDefault: () => void }) => new Promise<void>(() => {}));
    const e1 = { preventDefault: vi.fn() };
    const e2 = { preventDefault: vi.fn() };
    void handle(e1);
    await handle(e2);
    expect(e2.preventDefault).toHaveBeenCalled();
  });

  it("lets the next tap through after a failed save", async () => {
    const { result } = renderHook(() => useSingleFlight());
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const handle = result.current(save);
    await expect(handle()).rejects.toThrow("offline");
    await handle();
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("isRepeatSend", () => {
  it("only catches the same text again within a moment", () => {
    expect(isRepeatSend({ text: "hi", at: 1000 }, "hi", 1800)).toBe(true);
    expect(isRepeatSend({ text: "hi", at: 1000 }, "hi", 3000)).toBe(false);
    expect(isRepeatSend({ text: "hi", at: 1000 }, "hey", 1100)).toBe(false);
    expect(isRepeatSend(null, "hi")).toBe(false);
  });
});
