/**
 * Guard for the no-pinned-bar rule (design-bible §3): on phones nothing
 * full-width is pinned above the bottom tab bar, so page actions, totals, and
 * pagers live in the page flow. A static scan of `src/` for class lists that
 * are `fixed`/`sticky` with a `bottom-*` inset, which is how every pinned bar
 * is written. Files that legitimately do this are listed in ALLOWED with the
 * reason; a new one fails the test until someone decides it belongs there.
 *
 * How it reads: a small lexer blanks comments and keeps string literals.
 * Literals are grouped by the expression they belong to (a `className=`
 * value, or a `cn(`/`clsx(`/`twMerge(`/`cva(` call) and a group is flagged
 * when its tokens include a pin (`fixed`/`sticky`) and a bottom inset. Variants
 * are ignored except the min-width breakpoints, so `data-[…]:bottom-0`,
 * `!bottom-0`, `-bottom-2` and `max-md:fixed` count, while `md:sticky
 * md:bottom-0` does not (the rule is about phones). A lone literal such as a
 * `const` in a `.ts` helper counts on its own.
 *
 * Limits: it reads text, not the component tree. A class built from a
 * non-literal, or split across expressions, is not seen. `src/components/ui`
 * is scanned like everything else.
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
  // Modal panels that slide up over the page when opened and close again,
  // like dialogs. They are not a persistent bar above the tab bar.
  "components/ui/drawer.tsx": "Modal bottom drawer, open on demand.",
  "components/ui/sheet.tsx": "Modal sheet with a bottom side, open on demand.",
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

interface Literal {
  start: number;
  end: number;
  value: string;
}

/**
 * Splits TypeScript/TSX source into string literals and a masked copy of the
 * text (comments blanked, string bodies replaced by `_`, same length), so
 * brackets inside strings and comments cannot confuse the grouping below.
 * `"` and `'` literals end at a line break, so an apostrophe in JSX text
 * cannot run on.
 */
function lex(text: string): { masked: string; literals: Literal[] } {
  const literals: Literal[] = [];
  const out = text.split("");
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      blank(i, stop);
      i = stop;
    } else if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      let k = i + 1;
      while (k < text.length) {
        if (text[k] === "\\") k += 2;
        else if (text[k] === ch) break;
        else if (ch !== "`" && text[k] === "\n") break;
        else k += 1;
      }
      if (text[k] === ch) {
        literals.push({ start: i + 1, end: k, value: text.slice(i + 1, k) });
        for (let m = i + 1; m < k; m++) if (out[m] !== "\n") out[m] = "_";
        i = k + 1;
      } else {
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return { masked: out.join(""), literals };
}

/** Index just past the bracket that closes the one at `open`, in masked text. */
function closeOf(masked: string, open: number): number {
  const pair = masked[open] === "(" ? [")", "("] : ["}", "{"];
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === pair[1]) depth += 1;
    else if (masked[i] === pair[0] && --depth === 0) return i + 1;
  }
  return masked.length;
}

const BREAKPOINT_VARIANTS = new Set(["sm", "md", "lg", "xl", "2xl"]);

/**
 * The utility in a class token if it applies on phones, else null. Variants
 * other than the min-width breakpoints are transparent (`data-[…]:`,
 * `max-md:`, `hover:`); `!` and a leading `-` are stripped.
 */
function phoneUtility(token: string): string | null {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of token) {
    if (ch === "[" || ch === "(") depth += 1;
    if (ch === "]" || ch === ")") depth -= 1;
    if (ch === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (parts.some((variant) => BREAKPOINT_VARIANTS.has(variant))) return null;
  return current.replace(/^!/, "").replace(/^-/, "").replace(/!$/, "");
}

/** A Tailwind bottom inset (`bottom-0`, `bottom-[calc(…)]`, `bottom-full`), not a name like `bottom-start`. */
const BOTTOM_INSET = /^bottom-(?:\d|px$|\[|\(|auto$|full$)/;

function pinsToBottom(values: string[]): boolean {
  const utilities = values
    .flatMap((value) => value.split(/\s+/))
    .map(phoneUtility);
  return (
    utilities.some((u) => u === "fixed" || u === "sticky") &&
    utilities.some((u) => u !== null && BOTTOM_INSET.test(u))
  );
}

/** The class lists in `text` that pin something to the bottom of the screen. */
function pinnedBottomStrings(text: string): string[] {
  const { masked, literals } = lex(text);
  const found = new Set<string>();
  const inside = (from: number, to: number): Literal[] =>
    literals.filter((lit) => lit.start >= from && lit.end <= to);
  const report = (group: Literal[]): void => {
    if (pinsToBottom(group.map((lit) => lit.value)))
      found.add(group.map((lit) => lit.value).join(" | "));
  };

  // Each literal alone: a `const` class list, or a className string.
  for (const lit of literals) report([lit]);
  // Each className value and class helper call as one group.
  for (const match of masked.matchAll(
    /\b(?:cn|clsx|twMerge|cva)\(|className=\{/g
  )) {
    const open = match.index + match[0].length - 1;
    report(inside(open, closeOf(masked, open)));
  }
  return [...found];
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
    // Variants, modifiers and negative insets on the pin or the inset.
    expect(
      pinnedBottomStrings(
        `<div className="fixed data-[vaul-drawer-direction=bottom]:bottom-0" />`
      )
    ).toHaveLength(1);
    expect(
      pinnedBottomStrings(`<div className="fixed !bottom-0" />`)
    ).toHaveLength(1);
    expect(
      pinnedBottomStrings(`<div className="sticky -bottom-2" />`)
    ).toHaveLength(1);
    expect(
      pinnedBottomStrings(
        `<div className="max-[767px]:fixed max-[767px]:bottom-0" />`
      )
    ).toHaveLength(1);
    // One cva() call is one expression, however far apart its literals are.
    expect(
      pinnedBottomStrings(
        `cva("fixed z-50 flex flex-col gap-4 transition ease-in-out data-[state=open]:animate-in", { variants: { side: { bottom: "inset-x-0 bottom-0" } } })`
      )
    ).toHaveLength(1);
    // An unrelated pin and an unrelated bottom name far apart in one file.
    expect(
      pinnedBottomStrings(
        `const a = "fixed inset-0";\nconst b = { placement: "bottom-start" };\nconst c = "bottom-0 flex";`
      )
    ).toHaveLength(0);
    // Comment-like text inside a string does not blank real code after it.
    expect(
      pinnedBottomStrings(
        `const g = "src/**/*.ts"; const n = "see //x"; const c = "fixed bottom-0";`
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
