import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsSheetsBuilder } from "~/components/machines/settings/SettingsSheetsBuilder";
import { loadPrintRunMachinesAction } from "~/app/(app)/m/settings-sheets/actions";
import type {
  PrintRunMachine,
  SheetTagOption,
} from "~/lib/machines/settings-sheet-run";
import {
  getMachineViewBuiltInViews,
  getMachineViewPreset,
} from "~/lib/machines/view/config";
import type { MachineViewResult, MachineViewSavedViews } from "~/lib/types";

const navigation = vi.hoisted(() => ({
  router: { replace: vi.fn(), refresh: vi.fn() },
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation.router,
  usePathname: () => "/m/settings-sheets",
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("~/app/(app)/m/saved-view-actions", () => ({
  createSavedMachineViewAction: vi.fn(),
  updateSavedMachineViewAction: vi.fn(),
  renameSavedMachineViewAction: vi.fn(),
  deleteSavedMachineViewAction: vi.fn(),
  setMachineViewDefaultAction: vi.fn(),
}));

vi.mock("~/app/(app)/m/export-action", () => ({
  exportMachinesAction: vi.fn(),
}));

vi.mock("~/app/(app)/m/settings-sheets/actions", () => ({
  loadPrintRunMachinesAction: vi.fn(),
}));

window.matchMedia = vi.fn().mockImplementation(() => ({
  matches: false,
  media: "",
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
  };
}

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: memoryStorage(),
});
Object.defineProperty(window, "sessionStorage", {
  configurable: true,
  value: memoryStorage(),
});

const HD_ID = "11111111-1111-4111-8111-111111111111";
const HOUSE_ID = "22222222-2222-4222-8222-222222222222";
const FINALS_ID = "33333333-3333-4333-8333-333333333333";
const QUALS_ID = "44444444-4444-4444-8444-444444444444";

const HD_MACHINE: PrintRunMachine = {
  id: HD_ID,
  initials: "HD",
  name: "Humpty Dumpty",
  sets: [
    {
      id: HOUSE_ID,
      name: "House rules",
      updatedAt: "2026-06-01T00:00:00.000Z",
      isPreferredHouse: true,
      isPreferredTournament: false,
      tagSlugs: ["house"],
      sections: [
        {
          id: "s-house",
          kind: "software",
          baseline: "Factory Default",
          rows: [
            { _key: "r1", id: "A.1 01", name: "Balls", value: "3" },
            { _key: "r2", id: "A.1 02", name: "Tilt", value: "2" },
            { _key: "r3", id: "A.1 03", name: "Replay", value: "On" },
          ],
        },
      ],
    },
    {
      id: FINALS_ID,
      name: "Bat City finals",
      updatedAt: "2026-06-02T00:00:00.000Z",
      isPreferredHouse: false,
      isPreferredTournament: false,
      tagSlugs: ["bat-city-2025"],
      sections: [
        {
          id: "s-finals",
          kind: "software",
          baseline: "Factory Default",
          rows: [
            { _key: "r1", id: "A.1 01", name: "Balls", value: "5" },
            { _key: "r2", id: "A.1 02", name: "Tilt", value: "1" },
            { _key: "r3", id: "A.1 03", name: "Replay", value: "Off" },
          ],
        },
      ],
    },
    {
      id: QUALS_ID,
      name: "Bat City quals",
      updatedAt: "2026-06-03T00:00:00.000Z",
      isPreferredHouse: false,
      isPreferredTournament: false,
      tagSlugs: ["bat-city-2025"],
      sections: [
        {
          id: "s-quals",
          kind: "software",
          baseline: "Factory Default",
          rows: [{ _key: "r1", id: "A.1 01", name: "Balls", value: "3" }],
        },
      ],
    },
  ],
};

const TAGS: SheetTagOption[] = [
  { slug: "house", name: "House" },
  { slug: "tournament", name: "Tournament" },
  { slug: "bat-city-2025", name: "Bat City 2025" },
];

const VIEW_RESULT: MachineViewResult = {
  rows: [
    {
      id: HD_ID,
      initials: "HD",
      title: "Humpty Dumpty",
      manufacturer: "Gottlieb",
      year: 1947,
      ownerName: "Tim",
      hasOwner: true,
      presence: "on_the_floor",
      createdAt: "2026-01-01T00:00:00.000Z",
      health: {
        openIssues: 0,
        bySeverity: { cosmetic: 0, minor: 0, major: 0, unplayable: 0 },
        worstSeverity: null,
        oldestOpenIssueAt: null,
        playability: "operational",
      },
      lastServicedAt: null,
    },
  ],
  scopeCount: 1,
  totalCount: 1,
  summary: {
    presence: {
      byPresence: {
        on_the_floor: 1,
        off_the_floor: 0,
        on_loan: 0,
        pending_arrival: 0,
      },
    },
    playability: {
      byStatus: { operational: 1, needs_service: 0, unplayable: 0 },
    },
  },
  state: getMachineViewPreset("machines").defaultState,
  ownerOptions: [{ id: "u1", name: "Tim" }],
  permittedFields: getMachineViewPreset("machines").permittedFields,
  offersMe: false,
  signedIn: false,
};

const SAVED_VIEWS: MachineViewSavedViews = {
  canSave: false,
  offersDefault: false,
  builtInViews: getMachineViewBuiltInViews("machines"),
  views: [],
  defaultViewId: null,
  activeViewId: null,
};

describe("SettingsSheetsBuilder", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(loadPrintRunMachinesAction).mockResolvedValue({
      ok: true,
      value: [HD_MACHINE],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prompts Choose a set when a tag default finds multiple sets, then resolves print href and preview once picked", async () => {
    const user = userEvent.setup();
    render(
      <SettingsSheetsBuilder
        result={VIEW_RESULT}
        savedViews={SAVED_VIEWS}
        addableIds={[HD_ID]}
        tags={TAGS}
        initialRun={null}
        initialMachines={[]}
      />
    );

    await user.selectOptions(screen.getByLabelText("to"), "tag:bat-city-2025");

    const addButtons = screen.getAllByRole("button", {
      name: "Add Humpty Dumpty",
    });
    const addButton = addButtons[0];
    if (!addButton) throw new Error("Expected Add Humpty Dumpty button");
    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getByLabelText("To set for Humpty Dumpty")).toBeVisible();
    });
    expect(screen.getAllByText("Choose a set").length).toBeGreaterThan(0);
    const panel = screen.getByRole("complementary", { name: "Print run" });
    expect(within(panel).getByText("0 machines print")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Print" })).toBeDisabled();

    await user.selectOptions(
      screen.getByLabelText("To set for Humpty Dumpty"),
      FINALS_ID
    );

    expect(await screen.findByText("3 changes")).toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", { name: /^Set up and restore/ })
    );
    const printLink = screen.getByRole("link", { name: "Print" });
    const href = printLink.getAttribute("href") ?? "";
    const parsed = new URL(href, "http://localhost");
    expect(parsed.pathname).toBe("/m/settings-sheets/print");
    expect(parsed.searchParams.get("to")).toBe("tag:bat-city-2025");
    expect(parsed.searchParams.get("direction")).toBe("both");
    expect(parsed.searchParams.getAll("set")).toContain(`HD~~${FINALS_ID}`);

    // Preview renders the live comparison inside the dialog.
    await user.click(screen.getByRole("button", { name: "Preview" }));
    const dialog = await screen.findByRole("dialog", { name: "Preview" });
    expect(within(dialog).getByText("Humpty Dumpty")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    // Removing the machine disables Print again.
    await user.click(
      screen.getByRole("button", { name: "Remove Humpty Dumpty" })
    );
    expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
  });
});
