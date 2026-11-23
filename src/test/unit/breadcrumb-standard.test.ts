/**
 * Guard for the breadcrumb standard (design-bible §27): every breadcrumb is
 * drawn by the shared Breadcrumb component, so a page cannot draw its own
 * in another style. A static scan of `src/`, following
 * action-buttons-standard.test.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const SELF = "test/unit/breadcrumb-standard.test.ts";
const SHARED = "components/layout/Breadcrumb.tsx";

/** `aria-label="Breadcrumb"`, in any quotes or as a JSX expression. */
const BREADCRUMB_LABEL = /aria-label\s*=\s*\{?\s*["'`]Breadcrumb["'`]/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mdx)$/.test(entry.name) ? [path] : [];
  });
}

const files = sourceFiles(SRC)
  .map((path) => ({
    path: relative(SRC, path).split(sep).join("/"),
    text: readFileSync(path, "utf8"),
  }))
  .filter((file) => file.path !== SELF);

describe("breadcrumb standard (design-bible §27)", () => {
  it("scans the source tree, shared component included", () => {
    expect(files.length).toBeGreaterThan(100);
    const shared = files.find((file) => file.path === SHARED);
    // The shared component is the one match, so a move can't silently pass.
    expect(shared?.text).toMatch(BREADCRUMB_LABEL);
  });

  it("matches the label in every quoting a page might use", () => {
    for (const sample of [
      `<nav aria-label="Breadcrumb">`,
      `<nav aria-label='breadcrumb'>`,
      `<nav aria-label={"Breadcrumb"}>`,
      "<nav aria-label={`Breadcrumb`}>",
    ]) {
      expect(sample).toMatch(BREADCRUMB_LABEL);
    }
  });

  it("draws a breadcrumb only in the shared component", () => {
    const offenders = files
      .filter((file) => file.path !== SHARED)
      .filter((file) => BREADCRUMB_LABEL.test(file.text))
      .map((file) => file.path);
    expect(
      offenders,
      `A hand-drawn breadcrumb. Use <Breadcrumb section=…> from ~/components/layout/Breadcrumb (design-bible §27).`
    ).toEqual([]);
  });
});
