import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhotoViewer from "./PhotoViewer";

const images = ["https://img.test/1.jpg", "https://img.test/2.jpg", "https://img.test/3.jpg"];

const Harness = ({ start = 0 }: { start?: number | null }) => {
  const [index, setIndex] = useState<number | null>(start);
  return (
    <>
      <span data-testid="index">{String(index)}</span>
      <PhotoViewer images={images} index={index} onIndexChange={setIndex} caption="Meetup photos" />
    </>
  );
};

describe("PhotoViewer", () => {
  it("stays closed without an index", () => {
    render(<Harness start={null} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows where you are and the caption", () => {
    render(<Harness start={1} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Meetup photos")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Photo 2 of 3" })).toHaveAttribute("src", images[1]);
  });

  it("moves with the arrow buttons and hides them at the ends", async () => {
    render(<Harness start={0} />);
    expect(screen.queryByRole("button", { name: "Previous photo" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next photo" }));
    await userEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next photo" })).not.toBeInTheDocument();
  });

  it("moves with the keyboard and closes with Escape", async () => {
    render(<Harness start={0} />);
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("index")).toHaveTextContent("null");
  });

  it("jumps straight to a photo from its dot", async () => {
    render(<Harness start={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Show photo 3" }));
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
  });
});
