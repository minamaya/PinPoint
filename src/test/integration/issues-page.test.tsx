// @vitest-environment jsdom
/**
 * Integration Test: IssuesPage RSC loader & IssueView wiring (PP-nffph.11)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Renders the real IssuesPage ->
 * IssueView tree to verify out-of-range `page` parameters clamp to the real
 * last page (rows, status announcement, and URL rewrite) and configuration-free
 * URLs redirect to a viewer's non-preset Default View.
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asDbOrTx, getTestDb, setupTestDb } from "~/test/setup/pglite";
import { seedIssue, seedMachine, seedUser } from "~/test/helpers/seed";
import { signInAs, signOut } from "~/test/helpers/mock-auth";
import { mockMobileViewport } from "~/test/helpers/viewport";
import { TooltipProvider } from "~/components/ui/tooltip";
import { createSavedView } from "~/lib/list-view/saved-views";
import { ISSUE_VIEW_PRESET } from "~/lib/issues/view/config";
import { toIssueViewSavedState } from "~/lib/issues/view/state";

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

const redirectSpy = vi.fn((url: string): never => {
  throw new RedirectSignal(url);
});
const replaceSpy = vi.fn();
const refreshSpy = vi.fn();
const pushSpy = vi.fn();
const routerMock = {
  replace: replaceSpy,
  refresh: refreshSpy,
  push: pushSpy,
};
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  redirect: redirectSpy,
  useRouter: () => routerMock,
  usePathname: () => "/issues",
  useSearchParams: () => currentSearchParams,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("~/components/layout/PageContainer", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { default: IssuesPage } = await import("~/app/(app)/issues/page");

describe("IssuesPage RSC — PGlite integration", () => {
  setupTestDb();

  let restoreViewport: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
    currentSearchParams = new URLSearchParams();
    window.localStorage.clear();
    window.sessionStorage.clear();
    restoreViewport = mockMobileViewport(false);
  });

  afterEach(() => {
    restoreViewport();
  });

  it("clamps an out-of-range page to the real last page in the rendered list and URL", async () => {
    const machine = await seedMachine({ initials: "PG", name: "PageClamp" });
    for (let i = 1; i <= 27; i++) {
      await seedIssue(machine.initials, {
        issueNumber: i,
        title: `Issue ${String(i)}`,
      });
    }

    currentSearchParams = new URLSearchParams("page=999&sort=id&dir=asc");
    render(
      <TooltipProvider>
        {await IssuesPage({
          searchParams: Promise.resolve({
            page: "999",
            sort: "id",
            dir: "asc",
          }),
        })}
      </TooltipProvider>
    );

    expect(redirectSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { level: 1, name: "Issues" })
    ).toBeInTheDocument();
    expect(screen.getByText("Issue 26")).toBeInTheDocument();
    expect(screen.getByText("Issue 27")).toBeInTheDocument();
    expect(screen.queryByText("Issue 25")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(
      "Showing 26 to 27 of 27 issues"
    );
    expect(replaceSpy).toHaveBeenLastCalledWith(
      "/issues?sort=id&dir=asc&page=2",
      { scroll: false }
    );
  });

  it("redirects configuration-free /issues to the signed-in user's Default View", async () => {
    const member = await seedUser({ role: "member" });
    const db = asDbOrTx(await getTestDb());
    const saved = await createSavedView(db, {
      userId: member.id,
      host: "issues",
      name: "Major only",
      state: {
        ...toIssueViewSavedState(ISSUE_VIEW_PRESET),
        severity: ["major"],
      },
      makeDefault: true,
    });
    if (!saved.ok) throw new Error(saved.message);

    signInAs(member.id);

    await expect(
      IssuesPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(RedirectSignal);
    expect(redirectSpy).toHaveBeenCalledWith(
      `/issues?severity=major&view=${saved.value.id}`
    );
  });
});
