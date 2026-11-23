/**
 * Share that hands out a link (design-bible §26.1; collections-and-tags
 * 4.15): on phones it opens the device's share sheet, and on desktop it
 * copies the link, confirming "Link copied".
 *
 * Phone or desktop is decided at the moment of the tap, by capability and
 * pointer: the browser offers `navigator.share` and the primary pointer is
 * coarse (a finger). That is not viewport detection (CORE-RESP-002): the
 * width never enters into it, nothing listens for changes, and nothing
 * renders differently, so the server and client trees always agree. A
 * touch laptop with a mouse as its primary pointer copies; a phone held
 * sideways still shares.
 */
import { toast } from "sonner";

export type ShareLinkOutcome =
  /** The share sheet took the link. */
  | "shared"
  /** The person closed the share sheet without sharing. */
  | "cancelled"
  /** The link is on the clipboard. */
  | "copied"
  /** Neither the share sheet nor the clipboard took it. */
  | "failed";

export interface ShareLinkInput {
  /** The link, absolute or relative to the current page's origin. */
  url: string;
  /** What the share sheet names the link, such as the tag's name. */
  title?: string | undefined;
}

/** Whether a tap on Share should open the device's share sheet. */
export function prefersShareSheet(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }
  if (typeof navigator.share !== "function") return false;
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function isCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function copy(url: string): Promise<ShareLinkOutcome> {
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

/**
 * Shares a link: the share sheet on phones, falling back to the clipboard
 * when the sheet is unavailable or refuses the link for any reason other
 * than the person cancelling; the clipboard on desktop.
 */
export async function shareLink({
  url,
  title,
}: ShareLinkInput): Promise<ShareLinkOutcome> {
  const absolute = new URL(url, window.location.origin).toString();
  if (prefersShareSheet()) {
    const data: ShareData = title
      ? { title, url: absolute }
      : { url: absolute };
    if (typeof navigator.canShare !== "function" || navigator.canShare(data)) {
      try {
        await navigator.share(data);
        return "shared";
      } catch (error) {
        if (isCancel(error)) return "cancelled";
      }
    }
  }
  return copy(absolute);
}

/**
 * Share's click handler: shares the link and confirms a copy with "Link
 * copied". The share sheet is its own confirmation, and a cancel says
 * nothing.
 */
export async function shareLinkWithFeedback(
  input: ShareLinkInput
): Promise<ShareLinkOutcome> {
  const outcome = await shareLink(input);
  if (outcome === "copied") toast.success("Link copied");
  else if (outcome === "failed") toast.error("Could not copy the link.");
  return outcome;
}
