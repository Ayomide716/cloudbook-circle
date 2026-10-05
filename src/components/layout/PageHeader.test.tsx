import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { Chips, HeaderAction, PageHeader, PageSearch } from "./PageHeader";

describe("PageHeader", () => {
  it("shows the title as the page heading, with its actions and extras", async () => {
    const onCreate = vi.fn();
    render(
      <PageHeader title="Groups" subtitle="2 groups" actions={<HeaderAction icon={Plus} label="Create group" primary onClick={onCreate} />}>
        <p>Extra</p>
      </PageHeader>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Groups" })).toBeInTheDocument();
    expect(screen.getByText("2 groups")).toBeInTheDocument();
    expect(screen.getByText("Extra")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create group" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
});

describe("Chips", () => {
  const Harness = () => {
    const [value, setValue] = useState<"all" | "mine">("all");
    return (
      <Chips
        label="Show"
        value={value}
        onChange={setValue}
        options={[
          { value: "all", label: "All" },
          { value: "mine", label: "Mine" },
        ]}
      />
    );
  };

  it("marks exactly one chip as pressed and switches on tap", async () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Mine" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Mine" }));
    expect(screen.getByRole("button", { name: "Mine" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("PageSearch", () => {
  it("is labelled and reports what is typed", async () => {
    const onChange = vi.fn();
    render(<PageSearch value="" onChange={onChange} placeholder="Search groups" />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search groups" }), "l");
    expect(onChange).toHaveBeenCalledWith("l");
  });
});
