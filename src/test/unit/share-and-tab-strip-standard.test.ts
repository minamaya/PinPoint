/**
 * Guards for two site-wide standards (PP-jb9v.21), as a static scan of
 * `src/`:
 *
 * - A Share that hands out a link goes through `shareLinkWithFeedback`
 *   (design-bible §26.1): the share sheet on phones, a copy confirmed with
 *   "Link copied" on desktop. Only the helper calls `navigator.share` or
 *   says "Link copied", so a hand-rolled Share can't copy on phones.
 * - Page tabs go through RouteTabStrip (design-bible §5, tab strip), so
 *   every tab strip is 40px tall on desktop and 44px on phones with 10px
 *   side padding. Only it draws the underlined active tab.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const SELF = "test/unit/share-and-tab-strip-standard.test.ts";

const SHARE_HELPER = "lib/share/share-link.ts";

/** The files that may draw an underlined active tab. */
const UNDERLINED_TAB_ALLOWED = new Set([
  // The shared page tab strip.
  "components/layout/RouteTabStrip.tsx",
  // Issue detail's phone section tabs: tabs within one page, not routes.
  "components/issues/IssueSectionTabs.tsx",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const files = sourceFiles(SRC)
  .map((path) => ({
    path: relative(SRC, path).split(sep).join("/"),
    text: readFileSync(path, "utf8"),
  }))
  .filter((file) => file.path !== SELF)
  .filter((file) => !/\.test\.tsx?$/.test(file.path));

describe("share and tab strip standards (PP-jb9v.21)", () => {
  it("scans the source tree", () => {
    expect(files.length).toBeGreaterThan(100);
    const paths = new Set(files.map((file) => file.path));
    expect(paths).toContain(SHARE_HELPER);
    for (const allowed of UNDERLINED_TAB_ALLOWED) {
      expect(paths, allowed).toContain(allowed);
    }
  });

  it("calls the share sheet only from the share helper", () => {
    const offenders = files
      .filter((file) => file.path !== SHARE_HELPER)
      .filter((file) => /navigator\s*\.\s*share\b/.test(file.text))
      .map((file) => file.path);
    expect(
      offenders,
      "Share a link with shareLinkWithFeedback (~/lib/share/share-link), which opens the share sheet on phones and copies on desktop (design-bible §26.1)."
    ).toEqual([]);
  });

  it("confirms a copied link only from the share helper", () => {
    const offenders = files
      .filter((file) => file.path !== SHARE_HELPER)
      .filter((file) => /["'`]Link copied["'`]/.test(file.text))
      .map((file) => file.path);
    expect(
      offenders,
      'A Share that copies a link and says "Link copied" goes through shareLinkWithFeedback, so phones get the share sheet (design-bible §26.1).'
    ).toEqual([]);
  });

  it("draws an underlined active tab only in the shared tab strips", () => {
    const offenders = files
      .filter((file) => !UNDERLINED_TAB_ALLOWED.has(file.path))
      .filter(
        (file) =>
          /\bborder-b-2\b/.test(file.text) &&
          /\bborder-primary\b/.test(file.text)
      )
      .map((file) => file.path);
    expect(
      offenders,
      "Page tabs go through RouteTabStrip, so every tab strip shares one size (design-bible §5)."
    ).toEqual([]);
  });
});
