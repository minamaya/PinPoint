// @vitest-environment jsdom
/**
 * Integration Test: MachineTimelinePage RSC & ?tag= filtering (PP-nffph.13)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Verifies URL ?tag= parsing, invalid
 * tag fallback to DEFAULT_TIMELINE_TAGS, and database timeline row filtering.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getTestDb, setupTestDb } from "~/test/setup/pglite";
import { machines, userProfiles } from "~/server/db/schema";
import { createTestMachine, createTestUser } from "~/test/helpers/factories";
import {
  createMachineComment,
  createMachineTimelineEvent,
} from "~/lib/timeline/machine-events";
import {
  DEFAULT_TIMELINE_TAGS,
  type TimelineTag,
} from "~/lib/timeline/machine-tags";
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

const capturedTags = vi.fn<(tags: readonly TimelineTag[]) => void>();
vi.mock("~/components/machines/timeline/MachineTimelineActionsRow", () => ({
  MachineTimelineActionsRow: ({
    currentTags,
  }: {
    currentTags: TimelineTag[];
  }) => {
    capturedTags(currentTags);
    return <div data-testid="timeline-actions-row" />;
  },
}));

const PARAMS = Promise.resolve({ initials: "GZ" });

describe("MachineTimelinePage (PGlite)", () => {
  setupTestDb();

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

  it("applies ?tag=maintenance to both MachineTimelineActionsRow and rendered DB rows", async () => {
    render(
      await MachineTimelinePage({
        params: PARAMS,
        searchParams: Promise.resolve({ tag: "maintenance" }),
      })
    );

    expect(capturedTags).toHaveBeenCalledWith(["maintenance"]);
    expect(screen.getByText("Maintenance note body")).toBeInTheDocument();
    expect(screen.queryByText("Playfield waxed")).toBeNull();
    expect(screen.queryByText(/Hidden tweak/)).toBeNull();
  });

  it("excludes settings_edit by default and falls back to DEFAULT_TIMELINE_TAGS on invalid ?tag=", async () => {
    const { unmount } = render(
      await MachineTimelinePage({
        params: PARAMS,
        searchParams: Promise.resolve({}),
      })
    );
    expect(capturedTags).toHaveBeenLastCalledWith(DEFAULT_TIMELINE_TAGS);
    expect(screen.getByText("Maintenance note body")).toBeInTheDocument();
    expect(screen.getByText("Playfield waxed")).toBeInTheDocument();
    expect(screen.queryByText(/Hidden tweak/)).toBeNull();
    unmount();

    capturedTags.mockClear();
    render(
      await MachineTimelinePage({
        params: PARAMS,
        searchParams: Promise.resolve({ tag: "bogus" }),
      })
    );
    expect(capturedTags).toHaveBeenLastCalledWith(DEFAULT_TIMELINE_TAGS);
    expect(screen.getByText("Maintenance note body")).toBeInTheDocument();
    expect(screen.getByText("Playfield waxed")).toBeInTheDocument();
  });
});
