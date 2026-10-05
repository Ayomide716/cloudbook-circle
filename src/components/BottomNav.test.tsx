import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

// The Menu tab opens a sheet that reads the signed-in profile; it isn't under test here.
vi.mock("./MobileProfileMenu", () => ({ default: () => <button type="button">Menu</button> }));
vi.mock("@/lib/prefetch", () => ({ prefetchRoute: () => {} }));
const { default: BottomNav } = await import("./BottomNav");

const Where = () => <span data-testid="path">{useLocation().pathname}</span>;
const renderAt = (path: string, friendRequests = 0) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<><BottomNav currentUserId="me" friendRequests={friendRequests} /><Where /></>} />
      </Routes>
    </MemoryRouter>
  );

describe("BottomNav", () => {
  it("has the mockup's tabs in order", () => {
    renderAt("/");
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Home", "Friends", "Reels", "Groups", "Menu"]);
  });

  it("marks only the current tab", () => {
    renderAt("/reels");
    expect(screen.getByRole("button", { name: "Reels" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("keeps Groups active on a group's own page", () => {
    renderAt("/groups/123");
    expect(screen.getByRole("button", { name: "Groups" })).toHaveAttribute("aria-current", "page");
  });

  it("shows friend requests on the Friends tab", () => {
    renderAt("/", 3);
    expect(screen.getByRole("button", { name: "Friends, 3 new" })).toHaveTextContent("3");
  });

  it("navigates when a tab is tapped", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("button", { name: "Groups" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/groups");
  });
});
