// @vitest-environment jsdom
/**
 * Integration Test: MachineTimelinePage RSC & ?tag= filtering (PP-nffph.13)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Verifies URL ?tag= parsing through
 * the real MachineTimelineActionsRow / MachineTimelineFilter / MultiSelect
 * control, invalid-tag fallback to DEFAULT_TIMELINE_TAGS, and DB row filtering.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import { getTestDb, setupTestDb } from "~/test/setup/pglite";
import { machines, userProfiles } from "~/server/db/schema";
import { createTestMachine, createTestUser } from "~/test/helpers/factories";
import {
  createMachineComment,
  createMachineTimelineEvent,
} from "~/lib/timeline/machine-events";
import { DEFAULT_TIMELINE_TAGS } from "~/lib/timeline/machine-tags";
import type { ProseMirrorDoc } from "~/lib/tiptap/types";
import MachineTimelinePage from "~/app/(app)/m/[initials]/(tabs)/timeline/page";

vi.mock("~/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    }),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/m/GZ/timeline",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
}));

vi.mock("~/server/db", async () => {
  const { getTestDb } = await import("~/test/setup/pglite");
  return { db: await getTestDb() };
});

vi.mock("~/components/editor/RichTextDisplay", () => ({
  RichTextDisplay: ({ content }: { content: ProseMirrorDoc | null }) => {
    const text =
      content?.content
        ?.flatMap((node) => node.content ?? [])
        .map((child) => child.text ?? "")
        .join(" ") ?? "";
    return <div>{text}</div>;
  },
}));

const PARAMS = Promise.resolve({ initials: "GZ" });

const originalResizeObserver = Object.getOwnPropertyDescriptor(
  globalThis,
  "ResizeObserver"
);
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView"
);

describe("MachineTimelinePage (PGlite)", () => {
  setupTestDb();

  beforeAll(() => {
    class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: MockResizeObserver,
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterAll(() => {
    if (originalResizeObserver) {
      Object.defineProperty(
        globalThis,
        "ResizeObserver",
        originalResizeObserver
      );
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
    if (originalScrollIntoView) {
      Object.defineProperty(
        Element.prototype,
        "scrollIntoView",
        originalScrollIntoView
      );
    } else {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = await getTestDb();
    const authorId = randomUUID();
    const machineId = randomUUID();
    await db
      .insert(userProfiles)
      .values(
        createTestUser({ id: authorId, firstName: "Tim", role: "member" })
      );
    await db
      .insert(machines)
      .values(
        createTestMachine({ id: machineId, initials: "GZ", name: "Godzilla" })
      );

    await createMachineComment(machineId, {
      authorId,
      tag: "maintenance",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Maintenance note body" }],
          },
        ],
      },
    });
    await createMachineComment(machineId, {
      authorId,
      tag: "cleaning",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Playfield waxed" }],
          },
        ],
      },
    });
    await createMachineTimelineEvent(machineId, {
      sourceType: "lifecycle",
      tag: "settings_edit",
      actorId: authorId,
      eventData: { kind: "settings_set_updated", setName: "Hidden tweak" },
    });
  });

  it("wires ?tag=maintenance into the real filter control (badge + checked option) and filters DB rows", async () => {
    const user = userEvent.setup();
    render(
      await MachineTimelinePage({
        params: PARAMS,
        searchParams: Promise.resolve({ tag: "maintenance" }),
      })
    );

    const trigger = screen.getByRole("combobox", { name: /filter by tag/i });
    expect(trigger).toHaveTextContent(/^Tags\s*1$/);
    await user.click(trigger);
    const option = await screen.findByRole("option", { name: /maintenance/i });
    expect(within(option).getByRole("checkbox")).toBeChecked();

    expect(screen.getByText("Maintenance note body")).toBeInTheDocument();
    expect(screen.queryByText("Playfield waxed")).toBeNull();
    expect(screen.queryByText(/Hidden tweak/)).toBeNull();
  });

  it("excludes settings_edit by default and falls back to DEFAULT_TIMELINE_TAGS on invalid ?tag=", async () => {
    const defaultCountPattern = new RegExp(
      `^Tags\\s*${DEFAULT_TIMELINE_TAGS.length}$`
    );
    const { unmount } = render(
      await MachineTimelinePage({
        params: PARAMS,
        searchParams: Promise.resolve({}),
      })
    );
    const defaultTrigger = screen.getByRole("combobox", {
      name: /filter by tag/i,
    });
    expect(defaultTrigger).toHaveTextContent(defaultCountPattern);
    expect(screen.getByText("Maintenance note body")).toBeInTheDocument();
    expect(screen.getByText("Playfield waxed")).toBeInTheDocument();
    expect(screen.queryByText(/Hidden tweak/)).toBeNull();
    unmount();

    render(
      await MachineTimelinePage({
        params: PARAMS,
        searchParams: Promise.resolve({ tag: "bogus" }),
      })
    );
    expect(
      screen.getByRole("combobox", { name: /filter by tag/i })
    ).toHaveTextContent(defaultCountPattern);
    expect(screen.getByText("Maintenance note body")).toBeInTheDocument();
    expect(screen.getByText("Playfield waxed")).toBeInTheDocument();
    expect(screen.queryByText(/Hidden tweak/)).toBeNull();
  });
});
