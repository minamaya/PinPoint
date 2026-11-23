// @vitest-environment jsdom
/**
 * Integration Test: the machine's Settings tab RSC boundary (PP-nffph.13)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Renders MachineSettingsTab end-to-end
 * into the real SettingsTab UI across signed-out, non-owner member, owner,
 * technician, and admin roles.
 */
import React, { type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import type * as TooltipModule from "~/components/ui/tooltip";
import { getTestDb, setupTestDb } from "~/test/setup/pglite";
import {
  machineSettingsSets,
  machines,
  userProfiles,
} from "~/server/db/schema";
import { createTestMachine, createTestUser } from "~/test/helpers/factories";
import type { ProseMirrorDoc } from "~/lib/tiptap/types";
import MachineSettingsTab from "~/app/(app)/m/[initials]/(tabs)/settings/page";

const mockGetUser = vi.fn();
vi.mock("~/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { getUser: mockGetUser } }),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
}));

vi.mock("~/server/db", async () => {
  const { getTestDb } = await import("~/test/setup/pglite");
  return { db: await getTestDb() };
});

vi.mock("~/components/editor/RichTextEditorDynamic", () => ({
  RichTextEditor: ({ ariaLabel }: { ariaLabel?: string }) => (
    <textarea aria-label={ariaLabel} />
  ),
}));

vi.mock("~/components/editor/RichTextDisplay", () => ({
  RichTextDisplay: ({ content }: { content?: ProseMirrorDoc | null }) => (
    <div data-testid="mock-display">{content ? "has-content" : ""}</div>
  ),
}));

vi.mock("~/components/ui/tooltip", async (importOriginal) => {
  const actual = await importOriginal<typeof TooltipModule>();
  return {
    ...actual,
    Tooltip: ({ children }: { children: ReactNode }) => (
      <actual.TooltipProvider>
        <actual.Tooltip>{children}</actual.Tooltip>
      </actual.TooltipProvider>
    ),
  };
});

const PARAMS = Promise.resolve({ initials: "GZ" });
const EMPTY_PARAMS = Promise.resolve({ initials: "EMP" });
const originalMatchMedia = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia"
);

describe("Machine Settings tab page (PGlite)", () => {
  setupTestDb();

  let machineId: string;
  let ownerId: string;

  async function makeUser(
    role: "guest" | "member" | "technician" | "admin"
  ): Promise<string> {
    const id = randomUUID();
    const db = await getTestDb();
    await db.insert(userProfiles).values(createTestUser({ id, role }));
    return id;
  }

  async function renderAs(
    userId: string | null,
    params = PARAMS
  ): Promise<ReturnType<typeof render>> {
    mockGetUser.mockResolvedValue({
      data: { user: userId ? { id: userId } : null },
    });
    return render(await MachineSettingsTab({ params }));
  }

  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
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

  afterAll(() => {
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    ownerId = await makeUser("member");
    machineId = randomUUID();
    const emptyMachineId = randomUUID();
    const db = await getTestDb();
    await db.insert(machines).values([
      createTestMachine({
        id: machineId,
        initials: "GZ",
        name: "Godzilla",
        ownerId,
      }),
      createTestMachine({
        id: emptyMachineId,
        initials: "EMP",
        name: "Empty Machine",
        ownerId,
      }),
    ]);
    await db.insert(machineSettingsSets).values({
      machineId,
      name: "Community House",
      isCommunity: true,
      createdBy: ownerId,
      updatedBy: ownerId,
    });
  });

  it("renders read-only UI without New set for signed-out visitors and non-owner members", async () => {
    const anonView = await renderAs(null);
    expect(screen.queryByRole("button", { name: /new set/i })).toBeNull();
    expect(screen.getByText("Community House")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /set name/i })).toBeNull();
    anonView.unmount();

    const otherMemberId = await makeUser("member");
    const nonOwnerView = await renderAs(otherMemberId);
    expect(screen.queryByRole("button", { name: /new set/i })).toBeNull();
    expect(screen.getByText("Community House")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /set name/i })).toBeNull();
    nonOwnerView.unmount();

    const emptyView = await renderAs(otherMemberId, EMPTY_PARAMS);
    expect(screen.queryByRole("button", { name: /new set/i })).toBeNull();
    expect(
      screen.getByText("No settings sets recorded yet.")
    ).toBeInTheDocument();
    emptyView.unmount();
  });

  it("renders New set and editable inputs for owner, technician, and admin", async () => {
    for (const userId of [
      ownerId,
      await makeUser("technician"),
      await makeUser("admin"),
    ]) {
      const view = await renderAs(userId);
      expect(
        screen.getByRole("button", { name: /new set/i })
      ).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /set name/i })).toHaveValue(
        "Community House"
      );
      view.unmount();
    }
  });
});
