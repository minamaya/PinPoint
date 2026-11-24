import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ApronCardExportDialog,
  type ExportableApronCard,
} from "~/components/machines/apron/ApronCardExportDialog";
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

const BASE_CARD: ExportableApronCard = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Standard",
  size: "stern",
  template: "standard",
  content: {
    name: "Godzilla",
    edition: null,
    manufacturer: "Stern",
    year: 2021,
    ownerName: "Tim",
    description: [{ kind: "paragraph", runs: [{ text: "Short rules." }] }],
    tip: [],
    tipEnabled: false,
    credits: { design: ["Keith Elwin"], art: ["Zombie Yeti"], code: [] },
    designEnabled: true,
    artEnabled: true,
    codeEnabled: false,
    hasPinTips: false,
  },
};

const OVERFLOW_CARD: ExportableApronCard = {
  ...BASE_CARD,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Long card",
  content: {
    ...BASE_CARD.content,
    description: [
      { kind: "paragraph", runs: [{ text: "OVERFLOW_CARD long body" }] },
    ],
  },
};

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

describe("ApronCardExportDialog", () => {
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
    } else {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("blocks export for an overflowing card until the override is checked and resets on reopen", async () => {
    const user = userEvent.setup();
    render(
      <ApronCardExportDialog
        machineName="Godzilla"
        machineInitials="GZ"
        scanUrl="http://localhost:3000/m/GZ/hub"
        cards={[OVERFLOW_CARD]}
        initialCardId={OVERFLOW_CARD.id}
        queued={new Set()}
        queueCount={0}
        onQueuedChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(await screen.findByText("Doesn't fit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Print…" })).toBeDisabled();

    const overrideCheckbox = screen.getByRole("checkbox", {
      name: "Export with text cut off",
    });
    await user.click(overrideCheckbox);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Download PDF" })
      ).toBeEnabled();
    });
    const printLink = screen.getByRole("link", { name: "Print…" });
    expect(printLink).toHaveAttribute(
      "href",
      `/m/GZ/apron/print?card=${OVERFLOW_CARD.id}`
    );

    // Close via Escape and reopen: the cut-off override resets to unchecked.
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByText("Doesn't fit")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Export with text cut off" })
    ).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Print…" })).toBeDisabled();
  });

  it("queues a saved card from Export and notifies parent state", async () => {
    const mockedQueue = vi.mocked(setApronCardsQueuedAction);
    mockedQueue.mockResolvedValue({ ok: true, value: { queuedCount: 1 } });
    const onQueuedChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ApronCardExportDialog
        machineName="Godzilla"
        machineInitials="GZ"
        scanUrl="http://localhost:3000/m/GZ/hub"
        cards={[BASE_CARD]}
        initialCardId={BASE_CARD.id}
        queued={new Set()}
        queueCount={0}
        onQueuedChange={onQueuedChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(
      await screen.findByRole("button", { name: "Add Standard to print queue" })
    );

    await waitFor(() => {
      expect(mockedQueue).toHaveBeenCalledWith({
        cardIds: [BASE_CARD.id],
        queued: true,
      });
    });
    expect(onQueuedChange).toHaveBeenCalledWith(BASE_CARD.id, true, 1);
  });
});
