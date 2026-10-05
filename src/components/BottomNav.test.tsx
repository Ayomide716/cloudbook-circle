import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/lib/prefetch", () => ({ prefetchRoute: () => {} }));
const { default: BottomNav } = await import("./BottomNav");

const Where = () => <span data-testid="path">{useLocation().pathname}</span>;
const renderAt = (path: string, friendRequests = 0, unreadNotifications = 0) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<><BottomNav currentUserId="me" friendRequests={friendRequests} unreadNotifications={unreadNotifications} name="Alice" /><Where /></>} />
      </Routes>
    </MemoryRouter>
  );

describe("BottomNav", () => {
  it("has Facebook's six tabs in order", () => {
    renderAt("/");
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Home", "Friends", "Reels", "Groups", "Notifications", "Profile"]);
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

  it("shows friend requests and unread notifications on their tabs", () => {
    renderAt("/", 3, 12);
    expect(screen.getByRole("button", { name: "Friends, 3 new" })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "Notifications, 12 new" })).toHaveTextContent("9+");
  });

  it("opens your own profile from the Profile tab and marks it current there", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/profile/me");
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it("doesn't mark Profile on someone else's profile", () => {
    renderAt("/profile/someone-else");
    expect(screen.getByRole("button", { name: "Profile" })).not.toHaveAttribute("aria-current");
  });

  it("navigates when a tab is tapped", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("button", { name: "Groups" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/groups");
  });
});
