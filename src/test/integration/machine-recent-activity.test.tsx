// @vitest-environment jsdom
/**
 * Integration Test: MachineRecentActivity RSC (PP-nffph.13)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Covers recent activity rendering,
 * default tag filtering (settings_edit excluded), View all & New Issue links,
 * New Note gating on composerUserId, and the empty state.
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
import type { ProseMirrorDoc } from "~/lib/tiptap/types";
import { MachineRecentActivity } from "~/components/machines/timeline/MachineRecentActivity";

vi.mock("~/server/db", async () => {
  const { getTestDb } = await import("~/test/setup/pglite");
  return { db: await getTestDb() };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/m/GZ",
  useSearchParams: () => new URLSearchParams(),
}));

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

describe("MachineRecentActivity (PGlite)", () => {
  setupTestDb();

  let machineId: string;
  let authorId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = await getTestDb();
    authorId = randomUUID();
    machineId = randomUUID();
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
  });

  it("renders empty state when a machine has no activity", async () => {
    render(
      await MachineRecentActivity({
        machineId,
        machineInitials: "GZ",
        machineName: "Godzilla",
        composerUserId: null,
      })
    );

    expect(
      screen.getByRole("region", { name: "Recent activity" })
    ).toBeInTheDocument();
    expect(screen.getByText("No activity yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New Note" })).toBeNull();
  });

  it("renders recent rows excluding settings_edit, exposes View all and New Issue links, and gates New Note", async () => {
    await createMachineComment(machineId, {
      authorId,
      tag: "maintenance",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Replaced upper flipper coil" }],
          },
        ],
      },
    });
    await createMachineTimelineEvent(machineId, {
      sourceType: "lifecycle",
      tag: "settings_edit",
      actorId: authorId,
      eventData: { kind: "settings_set_updated", setName: "Hidden edit" },
    });

    render(
      await MachineRecentActivity({
        machineId,
        machineInitials: "GZ",
        machineName: "Godzilla",
        composerUserId: authorId,
      })
    );

    expect(screen.getByText("Replaced upper flipper coil")).toBeInTheDocument();
    expect(screen.queryByText(/Hidden edit/)).toBeNull();
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute(
      "href",
      "/m/GZ/timeline"
    );
    expect(screen.getByRole("link", { name: "New Issue" })).toHaveAttribute(
      "href",
      "/report?machine=GZ"
    );
    expect(
      screen.getByRole("button", { name: "New Note" })
    ).toBeInTheDocument();
  });
});
