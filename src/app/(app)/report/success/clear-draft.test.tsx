import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { randomUUID } from "node:crypto";
import { ClearReportDraft } from "./clear-draft";
import {
  DRAFT_VERSION,
  LEGACY_DRAFT_KEY,
  REPORT_DRAFT_KEY,
  defaultEntry,
  emptySingle,
  parseDraft,
  serializeDraft,
} from "~/app/(app)/report/report-draft-schema";

describe("ClearReportDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("removes report_draft and legacy draft when at most one entry exists", () => {
    window.localStorage.setItem(
      REPORT_DRAFT_KEY,
      serializeDraft({
        version: DRAFT_VERSION,
        entries: [
          {
            ...defaultEntry(randomUUID()),
            machineId: randomUUID(),
            title: "Submitted issue",
          },
        ],
        single: {
          ...emptySingle(),
          firstName: "Ada",
          email: "ada@example.com",
        },
      })
    );
    window.localStorage.setItem(
      LEGACY_DRAFT_KEY,
      JSON.stringify({ title: "Legacy" })
    );

    render(<ClearReportDraft />);

    expect(window.localStorage.getItem(REPORT_DRAFT_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_DRAFT_KEY)).toBeNull();
  });

  it("drops entry #1 and resets single while preserving extra batch rows", () => {
    const firstKey = randomUUID();
    const secondKey = randomUUID();
    const secondMachineId = randomUUID();

    window.localStorage.setItem(
      REPORT_DRAFT_KEY,
      serializeDraft({
        version: DRAFT_VERSION,
        entries: [
          { ...defaultEntry(firstKey), title: "Submitted single" },
          {
            ...defaultEntry(secondKey),
            machineId: secondMachineId,
            title: "Remaining grid row",
          },
        ],
        single: {
          ...emptySingle(),
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
        },
      })
    );
    window.localStorage.setItem(LEGACY_DRAFT_KEY, "{}");

    render(<ClearReportDraft />);

    expect(window.localStorage.getItem(LEGACY_DRAFT_KEY)).toBeNull();
    const remaining = parseDraft(window.localStorage.getItem(REPORT_DRAFT_KEY));
    expect(remaining).not.toBeNull();
    expect(remaining?.entries).toHaveLength(1);
    expect(remaining?.entries[0]).toMatchObject({
      idempotencyKey: secondKey,
      machineId: secondMachineId,
      title: "Remaining grid row",
    });
    expect(remaining?.single).toEqual(emptySingle());
  });

  it("clears corrupt draft payloads without throwing", () => {
    window.localStorage.setItem(REPORT_DRAFT_KEY, "{not-valid-json");
    window.localStorage.setItem(LEGACY_DRAFT_KEY, "{also-invalid");

    expect(() => render(<ClearReportDraft />)).not.toThrow();
    expect(window.localStorage.getItem(REPORT_DRAFT_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_DRAFT_KEY)).toBeNull();
  });
});
