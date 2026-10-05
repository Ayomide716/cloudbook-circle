import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhotoCollage from "./PhotoCollage";

const photos = (n: number) => Array.from({ length: n }, (_, i) => `https://img.test/${i + 1}.jpg`);

describe("PhotoCollage", () => {
  it("renders nothing without photos", () => {
    const { container } = render(<PhotoCollage images={[]} onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a single photo whole", () => {
    render(<PhotoCollage images={photos(1)} onOpen={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Open photo" })).toBeInTheDocument();
  });

  it.each([2, 3, 4, 5])("shows every photo when there are %i", (n) => {
    render(<PhotoCollage images={photos(n)} onOpen={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(n);
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it("shows five tiles and counts the rest on the last one", () => {
    render(<PhotoCollage images={photos(8)} onOpen={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open photo 5 of 8, 3 more" })).toBeInTheDocument();
  });

  it("opens the photo that was tapped", async () => {
    const onOpen = vi.fn();
    render(<PhotoCollage images={photos(4)} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "Open photo 3 of 4" }));
    expect(onOpen).toHaveBeenCalledWith(2);
  });
});
