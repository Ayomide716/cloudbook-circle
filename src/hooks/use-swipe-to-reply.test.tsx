import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useSwipeToReply } from "./use-swipe-to-reply";

const Row = ({ onReply }: { onReply: () => void }) => {
  const { offset, handlers } = useSwipeToReply(onReply);
  return <div data-testid="row" data-offset={offset} {...handlers}>message</div>;
};

const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });

describe("swipe to reply", () => {
  it("replies when a message is pulled right far enough and let go", () => {
    const onReply = vi.fn();
    render(<Row onReply={onReply} />);
    const row = screen.getByTestId("row");
    fireEvent.touchStart(row, touch(20, 100));
    fireEvent.touchMove(row, touch(50, 102));
    fireEvent.touchMove(row, touch(100, 104));
    expect(Number(row.dataset.offset)).toBeGreaterThan(56);
    fireEvent.touchEnd(row);
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(row.dataset.offset).toBe("0");
  });

  it("does nothing for a short pull", () => {
    const onReply = vi.fn();
    render(<Row onReply={onReply} />);
    const row = screen.getByTestId("row");
    fireEvent.touchStart(row, touch(20, 100));
    fireEvent.touchMove(row, touch(60, 100));
    fireEvent.touchEnd(row);
    expect(onReply).not.toHaveBeenCalled();
  });

  it("ignores scrolling up and down", () => {
    const onReply = vi.fn();
    render(<Row onReply={onReply} />);
    const row = screen.getByTestId("row");
    fireEvent.touchStart(row, touch(20, 100));
    fireEvent.touchMove(row, touch(30, 160));
    fireEvent.touchMove(row, touch(120, 260));
    expect(row.dataset.offset).toBe("0");
    fireEvent.touchEnd(row);
    expect(onReply).not.toHaveBeenCalled();
  });

  it("ignores swiping left", () => {
    const onReply = vi.fn();
    render(<Row onReply={onReply} />);
    const row = screen.getByTestId("row");
    fireEvent.touchStart(row, touch(200, 100));
    fireEvent.touchMove(row, touch(100, 100));
    fireEvent.touchEnd(row);
    expect(onReply).not.toHaveBeenCalled();
  });
});
