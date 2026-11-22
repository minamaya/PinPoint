import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CORE-UI-008: every Dialog, Sheet and Drawer either opts into the shared
 * dismissal standard (`dirty`, see `modal-dismissal.tsx`) or is listed below
 * with the reason it holds no input. A modal that holds a form field and skips
 * both would let a stray backdrop click throw away typed work.
 *
 * A static scan of the source, not a render: the failure being guarded is a prop
 * that was never written. Radix and vaul AlertDialogs are not scanned; they
 * are confirms with nothing to type into.
 */

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");

/**
 * Files whose Dialog / Sheet / Drawer roots deliberately omit `dirty`, with the
 * reason. Each holds no text, choice or draft that dismissal could lose. Add a
 * file only for a modal that truly has nothing to type into; anything that
 * holds a field passes `dirty` instead.
 */
const READ_ONLY_MODALS: Record<string, string> = {
  "app/(app)/m/[initials]/(tabs)/edit/machine-owner-transfer.tsx":
    "Confirm for promoting a user to member; two buttons, nothing to type.",
  "app/(app)/m/new/create-machine-form.tsx":
    "Confirm for promoting a user to member; two buttons, nothing to type.",
  "components/images/ImageGallery.tsx":
    "Lightbox viewer; no field of any kind.",
  "components/issues/AssigneePicker.tsx":
    "Picker; choosing a person saves at once, the search box is a filter with no draft.",
  "components/issues/fields/MetadataDrawer.tsx":
    "Option picker; choosing an option saves at once.",
  "components/layout/BottomTabBar.tsx": "Navigation menu of links; no field.",
  "components/layout/QuickSearch.tsx":
    "Search palette; the query is a filter with no draft, and an outside click closing it is the expected behavior.",
  "components/list-view/PhoneListHeader.tsx":
    "Sort, filter and saved-view pickers; each choice applies at once, no draft.",
  "components/machines/settings/SettingsSheetsBuilder.tsx":
    "Read-only preview of a settings sheet.",
};

function sourceFiles(): string[] {
  return globSync("**/*.tsx", { cwd: SRC })
    .filter(
      (file) =>
        !file.includes(".test.") &&
        // The primitives themselves define the standard.
        !file.startsWith(`components${path.sep}ui${path.sep}`)
    )
    .sort();
}

interface ModalRoot {
  tag: string;
  line: number;
  hasDirty: boolean;
}

/**
 * The text of the JSX opening tag that starts at `start` (a `<`): it ends at
 * the first `>` outside braces and quotes that is not the `>` of an `=>`.
 */
function openingTag(text: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote && text[i - 1] !== "\\") quote = null;
    } else if (char === '"' || char === "'" || (char === "`" && depth > 0)) {
      quote = char;
    } else if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (char === ">" && depth === 0 && text[i - 1] !== "=") {
      return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

function hasAttribute(tag: string, name: string): boolean {
  return new RegExp(`\\s${name}(?=[\\s=/>])`).test(tag);
}

function modalRoots(file: string): { roots: ModalRoot[]; outside: number[] } {
  const text = readFileSync(path.join(SRC, file), "utf8");
  const lineOf = (index: number): number =>
    text.slice(0, index).split("\n").length;
  const roots: ModalRoot[] = [];
  const outside: number[] = [];

  for (const match of text.matchAll(/<(Dialog|Sheet|Drawer)(?=[\s>/])/g)) {
    const tag = openingTag(text, match.index);
    roots.push({
      tag: match[1] ?? "",
      line: lineOf(match.index),
      hasDirty: hasAttribute(tag, "dirty"),
    });
  }
  for (const match of text.matchAll(
    /<(?:Dialog|Sheet|Drawer)Content(?=[\s>/])/g
  )) {
    const tag = openingTag(text, match.index);
    if (
      hasAttribute(tag, "onInteractOutside") ||
      hasAttribute(tag, "onPointerDownOutside")
    ) {
      outside.push(lineOf(match.index));
    }
  }
  return { roots, outside };
}

const scanned = sourceFiles().map((file) => ({ file, ...modalRoots(file) }));
const withModals = scanned.filter(({ roots }) => roots.length > 0);

describe("modal dismissal standard is applied everywhere (CORE-UI-008)", () => {
  it("finds the modals it is meant to guard", () => {
    const names = withModals.map(({ file }) => path.basename(file));
    expect(names).toEqual(
      expect.arrayContaining([
        "CreateCollectionDialog.tsx",
        "InviteUserDialog.tsx",
        "FloatingCommentButton.tsx",
      ])
    );
  });

  it("every Dialog, Sheet and Drawer passes `dirty` or is a listed read-only modal", () => {
    const unguarded = withModals.flatMap(({ file, roots }) =>
      file in READ_ONLY_MODALS
        ? []
        : roots
            .filter((root) => !root.hasDirty)
            .map((root) => `${file}:${root.line} <${root.tag}>`)
    );
    expect(
      unguarded,
      "Pass `dirty` (and `onDiscard` if the draft outlives the modal) on these, or list the file in READ_ONLY_MODALS with a reason. See design-bible §17."
    ).toEqual([]);
  });

  it("no modal Content blocks outside clicks by hand", () => {
    const bespoke = scanned.flatMap(({ file, outside }) =>
      outside.map((line) => `${file}:${line}`)
    );
    expect(
      bespoke,
      "Outside clicks are ignored by the shared Content when the modal passes `dirty`; delete the hand-written handler."
    ).toEqual([]);
  });

  it("keeps the read-only list honest", () => {
    for (const [file, reason] of Object.entries(READ_ONLY_MODALS)) {
      expect(reason.trim(), `${file} needs a reason`).not.toBe("");
      const entry = withModals.find((scan) => scan.file === file);
      expect(
        entry,
        `${file} is listed but has no Dialog/Sheet/Drawer`
      ).toBeDefined();
      expect(
        entry?.roots.some((root) => !root.hasDirty),
        `${file} is listed but every modal in it passes \`dirty\``
      ).toBe(true);
    }
  });
});
