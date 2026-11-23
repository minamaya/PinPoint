import { afterEach, describe, expect, it, vi } from "vitest";
import { shareLink } from "./share-link";

const URL_PATH = "/c/tags/location/storage";
const ABSOLUTE = `${window.location.origin}${URL_PATH}`;

function stubPointer(coarse: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: coarse && query === "(pointer: coarse)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

function stubNavigator(extra: Partial<Navigator>): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: { writeText },
    ...extra,
  });
  return writeText;
}

/** design-bible §26.1; collections-and-tags 4.15. */
describe("shareLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the share sheet on a touch device that offers one", async () => {
    stubPointer(true);
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = stubNavigator({ share });
    await expect(shareLink({ url: URL_PATH, title: "Storage" })).resolves.toBe(
      "shared"
    );
    expect(share).toHaveBeenCalledWith({ title: "Storage", url: ABSOLUTE });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies on a device with a fine pointer, even when it offers a share sheet", async () => {
    stubPointer(false);
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = stubNavigator({ share });
    await expect(shareLink({ url: URL_PATH })).resolves.toBe("copied");
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(ABSOLUTE);
  });

  it("copies on a touch device without a share sheet", async () => {
    stubPointer(true);
    const writeText = stubNavigator({ share: undefined });
    await expect(shareLink({ url: URL_PATH })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(ABSOLUTE);
  });

  it("does nothing more when the person cancels the share sheet", async () => {
    stubPointer(true);
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("Share canceled", "AbortError"));
    const writeText = stubNavigator({ share });
    await expect(shareLink({ url: URL_PATH })).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to copying when the share sheet refuses the link", async () => {
    stubPointer(true);
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("Not allowed", "NotAllowedError"));
    const writeText = stubNavigator({ share });
    await expect(shareLink({ url: URL_PATH })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(ABSOLUTE);
  });

  it("falls back to copying when the browser says it cannot share the link", async () => {
    stubPointer(true);
    const share = vi.fn();
    const writeText = stubNavigator({ share, canShare: () => false });
    await expect(shareLink({ url: URL_PATH })).resolves.toBe("copied");
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(ABSOLUTE);
  });

  it("reports a failure when the clipboard refuses too", async () => {
    stubPointer(false);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    await expect(shareLink({ url: URL_PATH })).resolves.toBe("failed");
  });
});
