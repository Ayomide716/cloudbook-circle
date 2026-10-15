import { describe, expect, it, vi, beforeEach } from "vitest";

const upload = vi.fn();
vi.mock("./media-upload", () => ({ uploadMedia: (...a: unknown[]) => upload(...a) }));
vi.mock("./video-compress", () => ({ shrinkVideo: async (f: File) => f }));
vi.mock("./storage-upload", () => ({ readVideoInfo: async () => ({ duration: 1, thumbnail: null }) }));
URL.createObjectURL = vi.fn(() => "blob:preview");
URL.revokeObjectURL = vi.fn();

const jobs = await import("./video-jobs");
const file = () => new File(["x"], "clip.mp4", { type: "video/mp4" });
const flush = () => new Promise((r) => setTimeout(r, 10));

describe("video jobs", () => {
  beforeEach(() => upload.mockReset());

  it("posts once the upload is done, after Post was tapped", async () => {
    let finish!: (url: string) => void;
    upload.mockReturnValue(new Promise((r) => { finish = r; }));
    const ref = jobs.startVideoJob(file(), "post-videos", "u1");
    expect(jobs.isVideoJobRef(ref)).toBe(true);
    const save = vi.fn().mockResolvedValue(undefined);
    const posted = vi.fn();
    window.addEventListener(jobs.POSTED_EVENT, posted);
    jobs.postWhenReady(ref, "reel", save);
    await flush();
    expect(save).not.toHaveBeenCalled();
    finish("https://media.example/post-videos/u1/clip.mp4");
    await flush(); await flush();
    expect(save).toHaveBeenCalledWith("https://media.example/post-videos/u1/clip.mp4", null);
    expect(posted).toHaveBeenCalledTimes(1);
    window.removeEventListener(jobs.POSTED_EVENT, posted);
  });

  it("a failed upload can be tried again", async () => {
    upload.mockRejectedValueOnce(new Error("Network error while uploading.")).mockResolvedValueOnce("https://media.example/v.mp4");
    const ref = jobs.startVideoJob(file(), "post-videos", "u1");
    const save = vi.fn().mockResolvedValue(undefined);
    jobs.postWhenReady(ref, "post", save);
    await flush(); await flush();
    const id = ref.slice("videojob:".length);
    expect(save).not.toHaveBeenCalled();
    jobs.retryPosting(id);
    await flush(); await flush(); await flush();
    expect(save).toHaveBeenCalledWith("https://media.example/v.mp4", null);
  });

  it("a cancelled video is never posted", async () => {
    upload.mockResolvedValue("https://media.example/v.mp4");
    const ref = jobs.startVideoJob(file(), "post-videos", "u1");
    jobs.cancelVideoJob(ref);
    expect(() => jobs.postWhenReady(ref, "post", vi.fn())).toThrow();
  });
});
