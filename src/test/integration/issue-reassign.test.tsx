// @vitest-environment jsdom
/**
 * Integration Test: Issue Machine Reassignment — RSC permission gating & Server Action wiring
 *
 * Covers the Class-E / Class-B contracts moved out of
 * `e2e/full/issues-reassign-machine.spec.ts`:
 * - `IssueDetailPage` gates the Move action via `issues.reassign` (`true` for
 *   machine-owner member, technician, admin; absent for non-owner member,
 *   guest, and unauthenticated) and excludes `removed` destination machines.
 * - `reassignIssueMachineAction` enforces auth/permissions, validates same-machine
 *   and removed destinations, commits the DB move + timeline events, revalidates
 *   source and destination machine pages, and triggers a server-side redirect.
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb, setupTestDb } from "~/test/setup/pglite";
import { seedIssue, seedMachine, seedUser } from "~/test/helpers/seed";
import { signInAs, signOut } from "~/test/helpers/mock-auth";
import { mockMobileViewport } from "~/test/helpers/viewport";
import { TooltipProvider } from "~/components/ui/tooltip";
import { issueComments, issues, timelineEvents } from "~/server/db/schema";

vi.mock("~/lib/supabase/server", () => import("~/test/helpers/mock-auth"));

class RedirectSignal extends Error {
  readonly url: string;
  readonly digest: string;
  constructor(url: string) {
    super(`NEXT_REDIRECT:${url}`);
    this.url = url;
    this.digest = `NEXT_REDIRECT;replace;${url};307;`;
  }
}

class NotFoundSignal extends Error {}

const redirectSpy = vi.fn((url: string): never => {
  throw new RedirectSignal(url);
});

const notFoundSpy = vi.fn((): never => {
  throw new NotFoundSignal("NEXT_NOT_FOUND");
});

const revalidatePathSpy = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectSpy,
  notFound: notFoundSpy,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathSpy,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    void cb();
  },
}));

vi.mock("~/lib/notifications", () => ({
  planNotification: vi.fn().mockResolvedValue({ deliveries: [] }),
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
  getChannels: vi.fn().mockResolvedValue([]),
}));

vi.mock("~/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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
vi.mock("~/components/layout/PageContainer", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { default: IssueDetailPage } =
  await import("~/app/(app)/m/[initials]/i/[issueNumber]/page");
const { reassignIssueMachineAction } =
  await import("~/app/(app)/issues/actions");

function makeFormData(issueId: string, newMachineInitials: string): FormData {
  const formData = new FormData();
  formData.append("issueId", issueId);
  formData.append("newMachineInitials", newMachineInitials);
  return formData;
}

describe("Issue reassignment — RSC & Server Action integration", () => {
  setupTestDb();

  let restoreViewport: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
    restoreViewport = mockMobileViewport(false);
  });

  afterEach(() => {
    restoreViewport();
  });

  describe("IssueDetailPage Move action gating (issues.reassign)", () => {
    it("hides Move for non-owner members, guests, and signed-out visitors while keeping Edit title for reporters", async () => {
      const owner = await seedUser({ role: "member", email: "owner@test.com" });
      const nonOwnerMember = await seedUser({
        role: "member",
        email: "other-member@test.com",
      });
      const guestReporter = await seedUser({
        role: "guest",
        email: "guest@test.com",
      });

      const source = await seedMachine({
        initials: "SRC",
        name: "Source Game",
        ownerId: owner.id,
      });
      await seedMachine({ initials: "DST", name: "Destination Game" });
      const memberIssue = await seedIssue(source.initials, {
        issueNumber: 1,
        title: "Member reported issue",
        reportedBy: nonOwnerMember.id,
      });
      const guestIssue = await seedIssue(source.initials, {
        issueNumber: 2,
        title: "Guest reported issue",
        reportedBy: guestReporter.id,
      });

      // Unauthenticated visitor sees neither Edit title nor Move
      const unauth = render(
        <TooltipProvider>
          {await IssueDetailPage({
            params: Promise.resolve({
              initials: source.initials,
              issueNumber: String(memberIssue.issueNumber),
            }),
          })}
        </TooltipProvider>
      );
      expect(
        screen.queryByRole("button", { name: "Move to another machine" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Edit title" })
      ).not.toBeInTheDocument();
      unauth.unmount();

      // Non-owner member who reported the issue gets Edit title, NOT Move
      signInAs(nonOwnerMember.id);
      const nonOwnerView = render(
        <TooltipProvider>
          {await IssueDetailPage({
            params: Promise.resolve({
              initials: source.initials,
              issueNumber: String(memberIssue.issueNumber),
            }),
          })}
        </TooltipProvider>
      );
      expect(
        screen.getByRole("button", { name: "Edit title" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Move to another machine" })
      ).not.toBeInTheDocument();
      nonOwnerView.unmount();

      // Guest reporter gets Edit title on own issue, NOT Move
      signInAs(guestReporter.id);
      const guestView = render(
        <TooltipProvider>
          {await IssueDetailPage({
            params: Promise.resolve({
              initials: source.initials,
              issueNumber: String(guestIssue.issueNumber),
            }),
          })}
        </TooltipProvider>
      );
      expect(
        screen.getByRole("button", { name: "Edit title" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Move to another machine" })
      ).not.toBeInTheDocument();
      guestView.unmount();
    });

    it("exposes Move for machine-owner members, technicians, and admins", async () => {
      const owner = await seedUser({ role: "member", email: "own2@test.com" });
      const technician = await seedUser({
        role: "technician",
        email: "tech@test.com",
      });
      const admin = await seedUser({ role: "admin", email: "adm@test.com" });

      const source = await seedMachine({
        initials: "OWN",
        name: "Owned Game",
        ownerId: owner.id,
      });
      await seedMachine({ initials: "ACT", name: "Active Dest" });
      await seedMachine({
        initials: "REM",
        name: "Removed Dest",
        presenceStatus: "removed",
      });
      const issue = await seedIssue(source.initials, {
        issueNumber: 1,
        title: "Movable issue",
        reportedBy: owner.id,
      });

      for (const actor of [owner, technician, admin]) {
        signInAs(actor.id);
        const view = render(
          <TooltipProvider>
            {await IssueDetailPage({
              params: Promise.resolve({
                initials: source.initials,
                issueNumber: String(issue.issueNumber),
              }),
            })}
          </TooltipProvider>
        );
        const moveBtn = screen.getByRole("button", {
          name: "Move to another machine",
        });
        expect(moveBtn).toBeInTheDocument();
        if (actor === owner) {
          const user = userEvent.setup();
          await user.click(moveBtn);
          expect(screen.getByTestId("reassign-option-ACT")).toBeInTheDocument();
          expect(
            screen.queryByTestId("reassign-option-REM")
          ).not.toBeInTheDocument();
        }
        view.unmount();
      }
    });
  });

  describe("reassignIssueMachineAction", () => {
    it("rejects unauthenticated, guest, and non-owner member callers without changing the issue", async () => {
      const owner = await seedUser({ role: "member", email: "own3@test.com" });
      const nonOwner = await seedUser({
        role: "member",
        email: "nonown@test.com",
      });
      const guest = await seedUser({
        role: "guest",
        email: "guest2@test.com",
      });

      const source = await seedMachine({
        initials: "M1",
        name: "Machine 1",
        ownerId: owner.id,
      });
      const dest = await seedMachine({ initials: "M2", name: "Machine 2" });
      const issue = await seedIssue(source.initials, {
        issueNumber: 1,
        reportedBy: guest.id,
      });

      // Unauthenticated -> UNAUTHORIZED
      signOut();
      const unauth = await reassignIssueMachineAction(
        undefined,
        makeFormData(issue.id, dest.initials)
      );
      expect(unauth).toMatchObject({ ok: false, code: "UNAUTHORIZED" });

      // Guest (even as reporter) -> FORBIDDEN
      signInAs(guest.id);
      const guestRes = await reassignIssueMachineAction(
        undefined,
        makeFormData(issue.id, dest.initials)
      );
      expect(guestRes).toMatchObject({ ok: false, code: "FORBIDDEN" });

      // Non-owner member -> FORBIDDEN
      signInAs(nonOwner.id);
      const memberRes = await reassignIssueMachineAction(
        undefined,
        makeFormData(issue.id, dest.initials)
      );
      expect(memberRes).toMatchObject({ ok: false, code: "FORBIDDEN" });

      const db = await getTestDb();
      const unchanged = await db.query.issues.findFirst({
        where: eq(issues.id, issue.id),
      });
      expect(unchanged?.machineInitials).toBe(source.initials);
      expect(redirectSpy).not.toHaveBeenCalled();
    });

    it("returns VALIDATION for same machine or removed destination and NOT_FOUND for missing targets", async () => {
      const tech = await seedUser({
        role: "technician",
        email: "tech2@test.com",
      });
      const source = await seedMachine({ initials: "S1", name: "Source 1" });
      const removed = await seedMachine({
        initials: "RM",
        name: "Removed Machine",
        presenceStatus: "removed",
      });
      const issue = await seedIssue(source.initials, { issueNumber: 1 });

      signInAs(tech.id);

      const sameRes = await reassignIssueMachineAction(
        undefined,
        makeFormData(issue.id, source.initials)
      );
      expect(sameRes).toMatchObject({ ok: false, code: "VALIDATION" });

      const removedRes = await reassignIssueMachineAction(
        undefined,
        makeFormData(issue.id, removed.initials)
      );
      expect(removedRes).toMatchObject({ ok: false, code: "VALIDATION" });

      const missingMachineRes = await reassignIssueMachineAction(
        undefined,
        makeFormData(issue.id, "NOPE")
      );
      expect(missingMachineRes).toMatchObject({ ok: false, code: "NOT_FOUND" });

      const missingIssueRes = await reassignIssueMachineAction(
        undefined,
        makeFormData("00000000-0000-4000-8000-000000000999", source.initials)
      );
      expect(missingIssueRes).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });

    it("moves the issue, writes timeline events, revalidates both machines, and redirects for machine-owner and technician", async () => {
      const owner = await seedUser({ role: "member", email: "own4@test.com" });
      const tech = await seedUser({
        role: "technician",
        email: "tech3@test.com",
      });
      const source = await seedMachine({
        initials: "AA",
        name: "Alpha",
        ownerId: owner.id,
      });
      const middle = await seedMachine({
        initials: "BB",
        name: "Bravo",
        nextIssueNumber: 5,
      });
      const finalDest = await seedMachine({
        initials: "CC",
        name: "Charlie",
        nextIssueNumber: 9,
      });
      const issue = await seedIssue(source.initials, {
        issueNumber: 1,
        title: "Switch stuck",
        reportedBy: owner.id,
      });

      // Machine owner moves AA-01 -> BB-05
      signInAs(owner.id);
      await expect(
        reassignIssueMachineAction(
          undefined,
          makeFormData(issue.id, middle.initials)
        )
      ).rejects.toThrow(RedirectSignal);
      expect(redirectSpy).toHaveBeenLastCalledWith("/m/BB/i/5");
      expect(revalidatePathSpy).toHaveBeenCalledWith("/m/AA");
      expect(revalidatePathSpy).toHaveBeenCalledWith("/m/BB");

      // Technician moves BB-05 -> CC-09
      signInAs(tech.id);
      await expect(
        reassignIssueMachineAction(
          undefined,
          makeFormData(issue.id, finalDest.initials)
        )
      ).rejects.toThrow(RedirectSignal);
      expect(redirectSpy).toHaveBeenLastCalledWith("/m/CC/i/9");

      const db = await getTestDb();
      const moved = await db.query.issues.findFirst({
        where: eq(issues.id, issue.id),
      });
      expect(moved?.machineInitials).toBe("CC");
      expect(moved?.issueNumber).toBe(9);

      const comments = await db.query.issueComments.findMany({
        where: eq(issueComments.issueId, issue.id),
      });
      expect(
        comments.filter((c) => c.eventData?.type === "machine_reassigned")
      ).toHaveLength(2);

      const machineEvents = await db
        .select()
        .from(timelineEvents)
        .where(eq(timelineEvents.machineId, finalDest.id));
      expect(machineEvents).toHaveLength(1);
    });
  });
});
