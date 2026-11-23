import { describe, expect, it } from "vitest";

import { loadLineupData } from "~/lib/pinballmap/lineup-data";
import {
  machines,
  pinballmapAbandonedListings,
  pinballmapCatalog,
  pinballmapState,
} from "~/server/db/schema";
import { createTestMachine } from "~/test/helpers/factories";
import { getTestDb, setupTestDb } from "~/test/setup/pglite";

describe("loadLineupData (PGlite)", () => {
  setupTestDb();

  it("returns not_configured before a tracked location is set", async () => {
    const data = await loadLineupData();
    expect(data.comparison.status).toBe("not_configured");
    expect(data.abandoned).toEqual([]);
  });

  it("returns waiting while configured with no stored snapshot", async () => {
    const db = await getTestDb();
    await db.insert(pinballmapState).values({
      id: "singleton",
      locationId: 26454,
      snapshotJson: null,
      lastSyncStatus: "unknown",
    });

    const data = await loadLineupData();
    expect(data.comparison.status).toBe("waiting");
    expect(data.state?.locationId).toBe(26454);
  });

  it("loads catalog titles, machines, snapshot entries, and abandoned records scoped to the tracked location", async () => {
    const db = await getTestDb();
    await db.insert(pinballmapState).values({
      id: "singleton",
      locationId: 26454,
      lastSyncStatus: "ok",
      lastSyncedAt: new Date("2026-10-01T12:00:00Z"),
      snapshotJson: {
        locationId: 26454,
        name: "Austin Pinball Collective",
        dateLastUpdated: "2026-10-01",
        lastUpdatedByUsername: null,
        machineCount: 1,
        fetchedAtIso: "2026-10-01T12:00:00Z",
        raw: {},
        lmxes: [
          {
            id: 8800,
            machineId: 701,
            icEnabled: null,
            lastUpdatedByUsername: null,
            conditions: [],
          },
        ],
      },
    });

    await db.insert(pinballmapCatalog).values([
      { pinballmapMachineId: 700, name: "Medieval Madness", icEligible: false },
      { pinballmapMachineId: 701, name: "Attack from Mars", icEligible: false },
      { pinballmapMachineId: 702, name: "Abandoned Title", icEligible: false },
    ]);

    const [linked, unlinked] = await db
      .insert(machines)
      .values([
        createTestMachine({
          initials: "MM",
          name: "Medieval Madness",
          pinballmapMachineId: 700,
          pinballmapIntent: "on",
        }),
        createTestMachine({
          initials: "UN",
          name: "Unlinked Cabinet",
          pinballmapMachineId: null,
          pinballmapIntent: "off",
        }),
      ])
      .returning({ id: machines.id });
    if (!linked || !unlinked) throw new Error("expected inserted machines");

    await db.insert(pinballmapAbandonedListings).values([
      {
        machineId: unlinked.id,
        lmxId: 8800,
        pinballmapMachineId: 701,
        locationId: 26454,
      },
      {
        machineId: unlinked.id,
        lmxId: 9900,
        pinballmapMachineId: 702,
        locationId: 99999,
      },
    ]);

    const data = await loadLineupData();
    expect(data.comparison.status).toBe("ready");
    if (data.comparison.status !== "ready") {
      throw new Error("expected ready comparison");
    }

    expect(data.comparison.sections.out_of_sync.map((r) => r.key)).toEqual([
      "to_add-700",
    ]);
    expect(data.comparison.sections.pinpoint_only.map((r) => r.key)).toEqual([
      `machine-${unlinked.id}`,
    ]);
    expect(data.comparison.sections.pinball_map_only.map((r) => r.key)).toEqual(
      ["entry-8800"]
    );
    expect(data.abandoned).toEqual([{ lmxId: 8800, machineId: unlinked.id }]);
  });
});
