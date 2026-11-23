// @vitest-environment jsdom
/**
 * Integration Test: IssueDetailPage OwnerRequirementsCallout visibility (PP-nffph.8)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Guards the class-E visibility contract
 * for Owner's requirements on the issue detail page: authenticated viewers see
 * the callout when populated, while unauthenticated visitors never see it.
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "~/test/setup/pglite";
import { seedIssue, seedMachine, seedUser } from "~/test/helpers/seed";
import { signInAs, signOut } from "~/test/helpers/mock-auth";
import { plainTextToDoc } from "~/lib/tiptap/types";

vi.mock("~/lib/supabase/server", () => import("~/test/helpers/mock-auth"));

class NotFoundError extends Error {}
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("~/components/issues/IssueActivity", () => ({
  IssueActivity: () => <div data-testid="issue-activity" />,
}));

vi.mock("~/components/issues/IssueDetails", () => ({
  IssueDetails: () => <div data-testid="issue-details" />,
}));

vi.mock("~/components/issues/InitialReport", () => ({
  InitialReport: () => <div data-testid="initial-report" />,
}));

vi.mock("~/components/issues/IssueSummaryLine", () => ({
  IssueSummaryLine: () => <div data-testid="issue-summary-line" />,
}));

vi.mock("~/components/issues/OtherIssues", () => ({
  OTHER_ISSUES_LIMIT: 5,
  OtherIssues: () => <div data-testid="other-issues" />,
}));

vi.mock("~/components/issues/FloatingCommentButton", () => ({
  FloatingCommentButton: () => null,
}));

vi.mock("~/components/issues/IssueSectionTabs", () => ({
  IssueSections: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  IssueSectionTabList: () => null,
  IssueSectionPanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock(
  "~/app/(app)/m/[initials]/i/[issueNumber]/editable-issue-title",
  () => ({
    EditableIssueTitle: ({ title }: { title: string }) => <h1>{title}</h1>,
  })
);

vi.mock("~/components/layout/PageContainer", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { default: IssueDetailPage } =
  await import("~/app/(app)/m/[initials]/i/[issueNumber]/page");

describe("IssueDetailPage — owner requirements callout visibility (PGlite)", () => {
  setupTestDb();

  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
  });

  it("renders OwnerRequirementsCallout for authenticated users and hides it when unauthenticated", async () => {
    const member = await seedUser({ role: "member" });
    const machine = await seedMachine({
      initials: "REQ",
      name: "Requirements Machine",
      ownerRequirements: plainTextToDoc("Soft plunge only"),
    });
    await seedIssue(machine.initials, {
      issueNumber: 1,
      title: "Flipper weak",
    });

    // Unauthenticated viewer: hidden
    const unauthView = render(
      await IssueDetailPage({
        params: Promise.resolve({ initials: "REQ", issueNumber: "1" }),
      })
    );
    expect(
      screen.queryByRole("note", { name: "Owner's requirements" })
    ).not.toBeInTheDocument();
    unauthView.unmount();

    // Authenticated viewer: visible with saved text
    signInAs(member.id);
    render(
      await IssueDetailPage({
        params: Promise.resolve({ initials: "REQ", issueNumber: "1" }),
      })
    );
    const callout = screen.getByRole("note", { name: "Owner's requirements" });
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveTextContent("Soft plunge only");
  });

  it("omits OwnerRequirementsCallout when ownerRequirements is null", async () => {
    const member = await seedUser({ role: "member" });
    const machine = await seedMachine({
      initials: "NOREQ",
      name: "No Requirements Machine",
      ownerRequirements: null,
    });
    await seedIssue(machine.initials, {
      issueNumber: 1,
      title: "Switch stuck",
    });

    signInAs(member.id);
    render(
      await IssueDetailPage({
        params: Promise.resolve({ initials: "NOREQ", issueNumber: "1" }),
      })
    );

    expect(
      screen.queryByRole("note", { name: "Owner's requirements" })
    ).not.toBeInTheDocument();
  });
});
