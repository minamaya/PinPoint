/**
 * Guard for the no-pinned-bar rule (design-bible §3): on phones nothing
 * full-width is pinned above the bottom tab bar, so page actions, totals, and
 * pagers live in the page flow. A static scan of `src/` for a class string
 * that is both `fixed`/`sticky` and anchored with a `bottom-*` class, which is
 * how every pinned bar is written. Files that legitimately do this are listed
 * below with the reason; a new one fails the test until someone decides it
 * belongs there.
 *
 * A variant-prefixed class (`md:sticky`) is not flagged: the rule is about
 * phones.
 *
 * Limits: it reads one string literal at a time, so classes split across
 * several `cn()` arguments are not seen, and it does not read components in
 * `src/components/ui` (dialog and sheet primitives anchor themselves by design).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const SELF = "test/unit/no-pinned-phone-bars.test.ts";

const USE_INSTEAD =
  "Put page actions and totals in the page flow (design-bible §3: nothing full-width is pinned above the bottom tab bar). If this one is a genuine exception, add it to ALLOWED with its reason.";

/** Files allowed to pin something to the bottom, each with why. */
const ALLOWED: Readonly<Record<string, string>> = {
  // The tab bar itself.
  "components/layout/BottomTabBar.tsx": "The bottom tab bar.",
  // Not full-width: one round button at the right edge.
  "components/issues/FloatingCommentButton.tsx":
    "A round floating action button, not a full-width bar.",
  // A dismissible notice card, not a bar; it clears the tab bar.
  "components/CookieConsentBanner.tsx":
    "A dismissible notice card, not a page action bar.",
  // Inside a sheet, so it is not above the tab bar.
  "components/issues/AddCommentForm.tsx":
    "Sticky inside the comment sheet, which sits over the tab bar.",
  // PP-4wtr (Option D) moves the hub's buttons into the page flow and
  // removes the thumb zone. That PR deletes this entry; until then the hub's
  // thumb zone is the one pinned bar.
  "app/(app)/m/[initials]/hub/machine-scan-hub.tsx":
    "The scan hub's thumb zone, until PP-4wtr lands (delete this entry then).",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

/** Every quoted or template string in `text` that pins itself to the bottom. */
function pinnedBottomStrings(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
    const literal = match[1] ?? match[2] ?? match[3] ?? "";
    const tokens = literal.split(/\s+/);
    const pinned = tokens.some((t) => t === "fixed" || t === "sticky");
    const bottom = tokens.some((t) => t.startsWith("bottom-"));
    if (pinned && bottom) found.push(literal);
  }
  return found;
}

const offenders = sourceFiles(SRC)
  .map((path) => ({
    path: relative(SRC, path).split(sep).join("/"),
    text: readFileSync(path, "utf8"),
  }))
  .filter(
    (file) => file.path !== SELF && !file.path.startsWith("components/ui/")
  )
  .filter((file) => pinnedBottomStrings(file.text).length > 0)
  .map((file) => file.path);

describe("no pinned phone bars (design-bible §3)", () => {
  it("recognises a pinned bottom bar and ignores an in-flow one", () => {
    expect(
      pinnedBottomStrings(
        `<div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 md:hidden" />`
      )
    ).toHaveLength(1);
    expect(
      pinnedBottomStrings(`<div className="sticky bottom-0 flex" />`)
    ).toHaveLength(1);
    expect(
      pinnedBottomStrings(
        `<div className="flex items-center justify-end gap-3 pt-4" />`
      )
    ).toHaveLength(0);
    // The app header pins to the top, which is allowed.
    expect(
      pinnedBottomStrings(`<div className="sticky top-0 z-20" />`)
    ).toHaveLength(0);
  });

  it("pins nothing to the bottom outside the allowlist", () => {
    const unexpected = offenders.filter((path) => !(path in ALLOWED));
    expect(unexpected, USE_INSTEAD).toEqual([]);
  });

  it("keeps no allowlist entry that no longer pins anything", () => {
    const stale = Object.keys(ALLOWED).filter(
      (path) => !offenders.includes(path)
    );
    expect(stale, "Remove these entries from ALLOWED.").toEqual([]);
  });
});
