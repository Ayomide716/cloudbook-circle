import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/lib/prefetch", () => ({ prefetchRoute: () => {} }));
const { default: BottomNav } = await import("./BottomNav");

const Where = () => <span data-testid="path">{useLocation().pathname}</span>;
const renderAt = (path: string, friendRequests = 0) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<><BottomNav currentUserId="me" friendRequests={friendRequests} name="Alice" /><Where /></>} />
      </Routes>
    </MemoryRouter>
  );

describe("BottomNav", () => {
  it("has Home, Friends, Create, Reels and Menu in order", () => {
    renderAt("/");
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Home", "Friends", "Create", "Reels", "Menu"]);
  });

  it("marks only the current tab", () => {
    renderAt("/reels");
    expect(screen.getByRole("button", { name: "Reels" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("shows friend requests on the Friends tab", () => {
    renderAt("/", 12);
    expect(screen.getByRole("button", { name: "Friends, 12 new" })).toHaveTextContent("9+");
  });

  it("opens the menu from the Menu tab and marks it current there", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/menu");
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-current", "page");
  });

  it("marks Menu on your own profile but not someone else's", () => {
    renderAt("/profile/me");
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-current", "page");
  });

  it("doesn't mark Menu on someone else's profile", () => {
    renderAt("/profile/someone-else");
    expect(screen.getByRole("button", { name: "Menu" })).not.toHaveAttribute("aria-current");
  });

  it("navigates when a tab is tapped", async () => {
    renderAt("/");
    await userEvent.click(screen.getByRole("button", { name: "Reels" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/reels");
  });
});
