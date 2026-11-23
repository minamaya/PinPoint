import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ApronBatchPrint,
  type BatchPrintCard,
} from "~/components/machines/apron/ApronBatchPrint";
import { setApronCardsQueuedAction } from "~/app/(app)/m/apron-cards/actions";

vi.mock("~/components/machines/apron/fonts", () => ({
  barlow: { variable: "--apron-font-body", style: { fontFamily: "Barlow" } },
  barlowCondensed: {
    variable: "--apron-font-display",
    style: { fontFamily: "Barlow Condensed" },
  },
}));

vi.mock("~/app/(app)/m/apron-cards/actions", () => ({
  setApronCardsQueuedAction: vi.fn(),
}));

function makeCard(overrides: Partial<BatchPrintCard> = {}): BatchPrintCard {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    machineName: "Godzilla",
    machineInitials: "GZ",
    cardName: "Standard",
    size: "stern",
    template: "standard",
    scanUrl: "http://localhost:3000/m/GZ/hub",
    content: {
      name: "Godzilla",
      edition: null,
      manufacturer: "Stern",
      year: 2021,
      ownerName: "Tim",
      description: [{ kind: "paragraph", runs: [{ text: "Normal card" }] }],
      tip: [],
      tipEnabled: false,
      credits: { design: ["Keith Elwin"], art: [], code: [] },
      designEnabled: true,
      artEnabled: true,
      codeEnabled: false,
      hasPinTips: false,
    },
    ...overrides,
  };
}

const FITS_CARD = makeCard();

const OVERFLOW_CARD = makeCard({
  id: "22222222-2222-4222-8222-222222222222",
  machineName: "Medieval Madness",
  machineInitials: "MM",
  cardName: "Wordy card",
  size: "wpc",
  content: {
    ...FITS_CARD.content,
    name: "Medieval Madness",
    description: [
      { kind: "paragraph", runs: [{ text: "OVERFLOW_CARD long body" }] },
    ],
  },
});

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

describe("ApronBatchPrint", () => {
  beforeEach(() => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        load: vi.fn(() => Promise.resolve([])),
      },
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function (this: HTMLElement): number {
        return this.classList.contains("apron-card__text") &&
          (this.textContent?.includes("OVERFLOW_CARD") ?? false)
          ? 200
          : 0;
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFonts) {
      Object.defineProperty(document, "fonts", originalFonts);
    }
  });

  it("gates overflowing cards behind the override checkbox, counts sheets, and filters by machine", async () => {
    const user = userEvent.setup();
    render(
      <ApronBatchPrint cards={[FITS_CARD, OVERFLOW_CARD]} queuedIds={[]} />
    );

    expect(await screen.findByText("Doesn't fit")).toBeInTheDocument();

    const wpcCheckbox = screen.getByRole("checkbox", {
      name: /Medieval Madness/i,
    });
    const sternCheckbox = screen.getByRole("checkbox", {
      name: /Godzilla/i,
    });
    await waitFor(() => {
      expect(sternCheckbox).toBeEnabled();
    });
    expect(wpcCheckbox).toBeDisabled();

    await user.click(sternCheckbox);
    expect(screen.getByText(/1 card · 6 per sheet/)).toBeInTheDocument();
    expect(screen.getByText(/5 spare copies/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: /include cards that don't fit/i })
    );
    expect(wpcCheckbox).toBeEnabled();

    await user.type(
      screen.getByRole("searchbox", { name: "Search machines" }),
      "Medieval"
    );
    const savedCards = screen.getByRole("region", { name: "Saved cards" });
    expect(
      within(savedCards).getByText(/Medieval Madness/)
    ).toBeInTheDocument();
    expect(within(savedCards).queryByText(/Godzilla/)).toBeNull();
  });

  it("pre-selects queued eligible cards and removes them via Mark as printed", async () => {
    const mockedQueue = vi.mocked(setApronCardsQueuedAction);
    mockedQueue.mockResolvedValue({ ok: true, value: { queuedCount: 0 } });
    const user = userEvent.setup();

    render(
      <ApronBatchPrint
        cards={[FITS_CARD, OVERFLOW_CARD]}
        queuedIds={[FITS_CARD.id, OVERFLOW_CARD.id]}
      />
    );

    const sternCheckbox = screen.getByRole("checkbox", {
      name: /Godzilla/i,
    });
    const wpcCheckbox = screen.getByRole("checkbox", {
      name: /Medieval Madness/i,
    });

    await waitFor(() => {
      expect(sternCheckbox).toBeChecked();
    });
    expect(wpcCheckbox).not.toBeChecked();
    expect(screen.getByText(/1 selected · 1 doesn't fit/)).toBeInTheDocument();

    const markButton = screen.getByRole("button", { name: "Mark as printed" });
    await user.click(markButton);

    await waitFor(() => {
      expect(mockedQueue).toHaveBeenCalledWith({
        cardIds: [FITS_CARD.id],
        queued: false,
      });
    });

    const listGroup = screen.getByRole("group", {
      name: /Stern \/ Data East \/ Sega/,
    });
    expect(within(listGroup).queryByText("Queued")).toBeNull();
  });
});
