import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApronCardTab } from "~/components/machines/apron/ApronCardTab";
import { saveApronCardsAction } from "~/app/(app)/m/[initials]/(tabs)/apron/actions";
import type {
  ApronCardIdentity,
  SavedApronCard,
} from "~/lib/machines/apron-card";
import type { ProseMirrorDoc } from "~/lib/tiptap/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("~/components/machines/apron/fonts", () => ({
  barlow: { variable: "--apron-font-body", style: { fontFamily: "Barlow" } },
  barlowCondensed: {
    variable: "--apron-font-display",
    style: { fontFamily: "Barlow Condensed" },
  },
}));

vi.mock("~/components/editor/RichTextEditorDynamic", () => ({
  RichTextEditor: ({
    ariaLabel,
    onChange,
  }: {
    ariaLabel?: string;
    onChange?: (doc: ProseMirrorDoc) => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      onChange={(event) => {
        onChange?.({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: event.target.value }],
            },
          ],
        });
      }}
    />
  ),
}));

vi.mock("~/app/(app)/m/[initials]/(tabs)/apron/actions", () => ({
  saveApronCardsAction: vi.fn(),
}));

vi.mock("~/app/(app)/m/apron-cards/actions", () => ({
  setApronCardsQueuedAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const IDENTITY: ApronCardIdentity = {
  name: "Godzilla",
  edition: null,
  manufacturer: "Stern",
  year: 2021,
  ownerName: "Tim",
  credits: { design: ["Keith Elwin"], art: ["Zombie Yeti"], code: [] },
  hasPinTips: false,
};

const SAVED_CARD: SavedApronCard = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Standard",
  size: "stern",
  template: "standard",
  useCustomDescription: false,
  description: null,
  tip: null,
  tipEnabled: false,
  designEnabled: true,
  artEnabled: true,
  codeEnabled: false,
};

const EXTRA_CARD: SavedApronCard = {
  ...SAVED_CARD,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Tournament",
};

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

describe("ApronCardTab", () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.hasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = () => false;
    }
    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = () => {};
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = () => {};
    }
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        load: vi.fn(() => Promise.resolve([])),
      },
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFonts) {
      Object.defineProperty(document, "fonts", originalFonts);
    }
  });

  it("renders Preview and Export only when canEdit is false", () => {
    render(
      <ApronCardTab
        machineId="m1"
        machineInitials="GZ"
        identity={IDENTITY}
        mainDescription={null}
        savedCards={[SAVED_CARD]}
        scanUrl="http://localhost:3000/m/GZ/hub"
        canEdit={false}
        queuedCardIds={[]}
        queueCount={0}
      />
    );

    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Export" }).length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Add card" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Card actions" })).toBeNull();
    expect(screen.queryByLabelText("Apron size")).toBeNull();
  });

  it("gates Save behind Apron size, enforces unique card names, hides Credits on Header band, and deletes cards", async () => {
    const mockedSave = vi.mocked(saveApronCardsAction);
    mockedSave.mockResolvedValue({
      ok: true,
      value: {
        cards: [SAVED_CARD],
        machineDescription: null,
      },
    });
    const user = userEvent.setup();

    render(
      <ApronCardTab
        machineId="11111111-1111-4111-8111-111111111199"
        machineInitials="GZ"
        identity={IDENTITY}
        mainDescription={null}
        savedCards={[SAVED_CARD, EXTRA_CARD]}
        scanUrl="http://localhost:3000/m/GZ/hub"
        canEdit
        queuedCardIds={[]}
        queueCount={0}
      />
    );

    // Header band template removes Credits toggles (Standard-only).
    expect(screen.getByRole("group", { name: "Credits" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Template" }));
    await user.click(
      await screen.findByRole("option", { name: "Header band" })
    );
    expect(screen.queryByRole("group", { name: "Credits" })).toBeNull();

    // Rename validation catches duplicate names on the same machine.
    await user.click(screen.getByRole("button", { name: "Card actions" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Rename card…" })
    );
    const renameDialog = await screen.findByRole("dialog", {
      name: "Rename card",
    });
    const nameInput = within(renameDialog).getByRole("textbox");
    await user.clear(nameInput);
    await user.type(nameInput, "Tournament");
    expect(
      within(renameDialog).getByText("Name already used")
    ).toBeInTheDocument();
    await user.click(
      within(renameDialog).getByRole("button", { name: "Cancel" })
    );
    const discardDialog = await screen.findByRole("alertdialog", {
      name: "Discard changes?",
    });
    await user.click(
      within(discardDialog).getByRole("button", { name: "Discard" })
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    // Add card without an apron size disables Save until a size is chosen.
    await user.click(screen.getByRole("button", { name: "Add card" }));
    expect(
      await screen.findByText(/Choose an apron size for Card 3/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("combobox", { name: "Apron size" }));
    await user.click(
      await screen.findByRole("option", { name: /Stern \/ Data East \/ Sega/ })
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    // Delete card removes it from the draft list via AlertDialog.
    await user.click(screen.getByRole("button", { name: "Card actions" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete card" })
    );
    const deleteDialog = await screen.findByRole("alertdialog", {
      name: "Delete Card 3?",
    });
    await user.click(
      within(deleteDialog).getByRole("button", { name: "Delete card" })
    );
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(
      screen.getByRole("combobox", { name: "Saved card" })
    ).not.toHaveTextContent("Card 3");
    expect(screen.queryByText("Card 3")).toBeNull();

    // Switch to the second saved card ("Tournament"), delete it, and Save:
    // the persisted payload must omit Card 3 and include Tournament in deletedIds.
    await user.click(screen.getByRole("combobox", { name: "Saved card" }));
    await user.click(await screen.findByRole("option", { name: "Tournament" }));
    await user.click(screen.getByRole("button", { name: "Card actions" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete card" })
    );
    const deleteExtraDialog = await screen.findByRole("alertdialog", {
      name: "Delete Tournament?",
    });
    await user.click(
      within(deleteExtraDialog).getByRole("button", { name: "Delete card" })
    );
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(
      screen.getByRole("combobox", { name: "Saved card" })
    ).toHaveTextContent("Standard");

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledTimes(1);
    });
    const savePayload = mockedSave.mock.calls[0]?.[0];
    expect(savePayload?.deletedIds).toEqual([EXTRA_CARD.id]);
    expect(
      savePayload?.cards.map((card) => [card.name, card.template])
    ).toEqual([["Standard", "header-band"]]);
  });
});
