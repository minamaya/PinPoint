// @vitest-environment jsdom
/**
 * Integration Test: the Apron card print route RSC boundary (PP-nffph.13)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Verifies auth/role gating, card-id
 * and machine-ownership guards, and member rendering of QR + card heading.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getTestDb, setupTestDb } from "~/test/setup/pglite";
import { machineApronCards, machines, userProfiles } from "~/server/db/schema";
import { createTestMachine, createTestUser } from "~/test/helpers/factories";
import ApronCardPrintPage from "~/app/(print)/m/[initials]/apron/print/page";

const mockGetUser = vi.fn();
vi.mock("~/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { getUser: mockGetUser } }),
}));

class NotFoundError extends Error {}
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new NotFoundError("notFound");
  }),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
}));

vi.mock("~/server/db", async () => {
  const { getTestDb } = await import("~/test/setup/pglite");
  return { db: await getTestDb() };
});

vi.mock("~/components/machines/apron/fonts", () => ({
  barlow: { variable: "--apron-font-body", style: { fontFamily: "Barlow" } },
  barlowCondensed: {
    variable: "--apron-font-display",
    style: { fontFamily: "Barlow Condensed" },
  },
}));

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

describe("ApronCardPrintPage (PGlite)", () => {
  setupTestDb();

  let cardId: string;
  let otherCardId: string;

  async function makeUser(
    role: "guest" | "member" | "technician" | "admin"
  ): Promise<string> {
    const id = randomUUID();
    const db = await getTestDb();
    await db.insert(userProfiles).values(createTestUser({ id, role }));
    return id;
  }

  afterEach(() => {
    if (originalFonts) {
      Object.defineProperty(document, "fonts", originalFonts);
    } else {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        load: vi.fn(() => Promise.resolve([])),
      },
    });
    const db = await getTestDb();
    const machineId = randomUUID();
    const otherMachineId = randomUUID();
    cardId = randomUUID();
    otherCardId = randomUUID();

    await db.insert(machines).values([
      createTestMachine({
        id: machineId,
        initials: "GZ",
        name: "Godzilla",
      }),
      createTestMachine({
        id: otherMachineId,
        initials: "TAF",
        name: "The Addams Family",
      }),
    ]);
    await db.insert(machineApronCards).values([
      {
        id: cardId,
        machineId,
        name: "Standard",
        size: "stern",
      },
      {
        id: otherCardId,
        machineId: otherMachineId,
        name: "Other card",
        size: "wpc",
      },
    ]);
  });

  it("calls notFound for signed-out, guest, invalid UUID, and wrong-machine card ids", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(
      ApronCardPrintPage({
        params: Promise.resolve({ initials: "GZ" }),
        searchParams: Promise.resolve({ card: cardId }),
      })
    ).rejects.toThrow(NotFoundError);

    const guestId = await makeUser("guest");
    mockGetUser.mockResolvedValue({ data: { user: { id: guestId } } });
    await expect(
      ApronCardPrintPage({
        params: Promise.resolve({ initials: "GZ" }),
        searchParams: Promise.resolve({ card: cardId }),
      })
    ).rejects.toThrow(NotFoundError);

    const memberId = await makeUser("member");
    mockGetUser.mockResolvedValue({ data: { user: { id: memberId } } });
    await expect(
      ApronCardPrintPage({
        params: Promise.resolve({ initials: "GZ" }),
        searchParams: Promise.resolve({ card: "not-a-uuid" }),
      })
    ).rejects.toThrow(NotFoundError);

    await expect(
      ApronCardPrintPage({
        params: Promise.resolve({ initials: "GZ" }),
        searchParams: Promise.resolve({ card: otherCardId }),
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("renders the print sheet with heading and machine hub QR code for a signed-in member", async () => {
    const memberId = await makeUser("member");
    mockGetUser.mockResolvedValue({ data: { user: { id: memberId } } });

    render(
      await ApronCardPrintPage({
        params: Promise.resolve({ initials: "GZ" }),
        searchParams: Promise.resolve({ card: cardId }),
      })
    );

    expect(
      screen.getByRole("heading", { name: "Apron card · Godzilla" })
    ).toBeInTheDocument();
    expect(screen.getByText("Scan this machine")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /QR code for https?:\/\/.+\/m\/GZ\/hub\?source=apron/i,
      })
    ).toBeInTheDocument();
  });
});
