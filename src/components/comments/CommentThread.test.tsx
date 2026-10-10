import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CommentThread, type ThreadComment } from "./CommentThread";

const comment = (id: string, parent: string | null, name = `Person ${id}`): ThreadComment => ({
  id,
  content: `Comment ${id}`,
  created_at: "2026-10-10T10:00:00Z",
  parent_id: parent,
  user_id: `u-${id}`,
  profiles: { full_name: name, avatar_url: null },
});

const renderThread = (comments: ThreadComment[], onReply = vi.fn()) =>
  render(
    <MemoryRouter>
      <CommentThread comments={comments} currentUserId="u-me" onReply={onReply} initialCount={3} />
    </MemoryRouter>
  );

describe("CommentThread", () => {
  it("folds replies and opens them five at a time", () => {
    const replies = Array.from({ length: 12 }, (_, i) => comment(`r${i}`, "top"));
    renderThread([comment("top", null), ...replies]);
    expect(screen.queryByText("Comment r0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /View 12 replies/ }));
    expect(screen.getByText("Comment r4")).toBeInTheDocument();
    expect(screen.queryByText("Comment r5")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /View 7 more replies/ }));
    expect(screen.getByText("Comment r9")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide replies" }));
    expect(screen.queryByText("Comment r0")).toBeNull();
  });

  it("shows the first few comments with a button for the rest", () => {
    renderThread(Array.from({ length: 5 }, (_, i) => comment(`c${i}`, null)));
    expect(screen.getByText("Comment c2")).toBeInTheDocument();
    expect(screen.queryByText("Comment c3")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /View 2 more comments/ }));
    expect(screen.getByText("Comment c4")).toBeInTheDocument();
  });

  it("answers a reply in the same thread, naming who is being answered", () => {
    const onReply = vi.fn();
    renderThread([comment("top", null), comment("r1", "top", "Ada Obi")], onReply);
    fireEvent.click(screen.getByRole("button", { name: /View 1 reply/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[1]);
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: "top" }), "Ada Obi");
  });
});
