/**
 * Guard for the no-pinned-bar rule (design-bible §3): on phones nothing
 * full-width is pinned above the bottom tab bar, so page actions, totals, and
 * pagers live in the page flow. A static scan of `src/` for a class that is
 * `fixed`/`sticky` with a `bottom-*` class beside it, which is how every
 * pinned bar is written. Files that legitimately do this are listed below
 * with the reason; a new one fails the test until someone decides it belongs
 * there.
 *
 * What counts: a `fixed` or `sticky` token (also behind `max-md:`-style
 * variants, which apply on phones) and a `bottom-*` token in the same string
 * or in string literals within {@link NEAR} characters of it, so
 * `cn("fixed inset-x-0", "bottom-14")` is caught. Comments are ignored. `.ts`
 * helpers are scanned too. A `md:`/`lg:` variant (`md:sticky`) is not flagged:
 * the rule is about phones.
 *
 * Limits: it reads text, not the component tree. A class built from parts
 * far apart, or from a non-literal, is not seen. `src/components/ui` is
 * scanned like everything else, so a shared primitive that pins to the bottom
 * has to be named in ALLOWED.
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
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

/** A Tailwind bottom inset (`bottom-0`, `bottom-[calc(…)]`, `bottom-full`), not a placement name like `bottom-start`. */
const BOTTOM_INSET = /^bottom-(?:\d|px$|\[|\(|auto$|full$)/;

/** How far apart, in characters, two literals can be and still be one class list. */
const NEAR = 160;

/** Comments blanked out (same length), so an apostrophe in one cannot confuse quote matching. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(
      /(^|[\s;,{(])\/\/[^\n]*/g,
      (m, lead: string) => lead + " ".repeat(m.length - lead.length)
    );
}

/** A class token without a phone-wide `max-*:` variant, which still applies on phones. */
function phoneToken(token: string): string {
  return token.replace(/^(?:max-[a-z]+:)+/, "");
}

/** The class lists in `text` that pin something to the bottom of the screen. */
function pinnedBottomStrings(text: string): string[] {
  const literals = [
    ...withoutComments(text).matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g),
  ].map((match) => ({
    index: match.index,
    tokens: (match[1] ?? match[2] ?? match[3] ?? "")
      .split(/\s+/)
      .map(phoneToken),
  }));
  return literals
    .filter((lit) => lit.tokens.some((t) => t === "fixed" || t === "sticky"))
    .filter((lit) =>
      literals.some(
        (other) =>
          Math.abs(other.index - lit.index) <= NEAR &&
          other.tokens.some((t) => BOTTOM_INSET.test(t))
      )
    )
    .map((lit) => lit.tokens.join(" "));
}

const offenders = sourceFiles(SRC)
  .map((path) => ({
    path: relative(SRC, path).split(sep).join("/"),
    text: readFileSync(path, "utf8"),
  }))
  .filter((file) => file.path !== SELF)
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
    // Classes split across cn() arguments, and a phone-only variant.
    expect(
      pinnedBottomStrings(`cn("fixed inset-x-0", "bottom-14")`)
    ).toHaveLength(1);
    expect(
      pinnedBottomStrings(`<div className="fixed max-md:bottom-0" />`)
    ).toHaveLength(1);
    // A comment apostrophe cannot hide a real match, nor can a comment match.
    expect(
      pinnedBottomStrings(
        `// don't pin\n<div className="sticky bottom-0" />\n// "fixed bottom-0"`
      )
    ).toHaveLength(1);
    // A placement name is not an inset.
    expect(
      pinnedBottomStrings(`{ placement: "bottom-start", strategy: "fixed" }`)
    ).toHaveLength(0);
    // From md: up is not the phone rule.
    expect(
      pinnedBottomStrings(`<div className="md:sticky md:bottom-0" />`)
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
