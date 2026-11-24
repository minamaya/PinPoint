import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "~/components/ui/tooltip";
import { MachineIssuesCard } from "./machine-issues-card";

const sampleIssues = [
  {
    id: "issue-1",
    title: "Thing flips the bird",
    status: "new" as const,
    severity: "major" as const,
    priority: "high" as const,
    frequency: "frequent" as const,
    machineInitials: "TAF",
    issueNumber: 1,
    createdAt: new Date("2026-04-01T12:00:00.000Z"),
    reporterName: null,
    reportedByUser: { name: "Member User" },
    invitedReporter: null,
  },
  {
    id: "issue-2",
    title: "Bookcase not registering",
    status: "in_progress" as const,
    severity: "minor" as const,
    priority: "medium" as const,
    frequency: "intermittent" as const,
    machineInitials: "TAF",
    issueNumber: 2,
    createdAt: new Date("2026-04-02T12:00:00.000Z"),
    reporterName: null,
    reportedByUser: null,
    invitedReporter: null,
  },
];

describe("MachineIssuesCard", () => {
  it("renders issues-section, IssueCard rows, and Issue list actions menu", () => {
    render(
      <TooltipProvider>
        <MachineIssuesCard
          issues={sampleIssues}
          machineName="The Addams Family"
          machineInitials="TAF"
          view="open"
        />
      </TooltipProvider>
    );

    const section = screen.getByTestId("issues-section");
    expect(
      within(section).getByRole("heading", { name: "Open Issues (2)" })
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "Issue list actions" })
    ).toBeInTheDocument();

    const cards = within(section).getAllByTestId("issue-card");
    expect(cards).toHaveLength(2);
    expect(
      within(section).getByRole("link", { name: /Thing flips the bird/ })
    ).toHaveAttribute("href", "/m/TAF/i/1");
    expect(
      within(section).getByRole("link", { name: /Bookcase not registering/ })
    ).toHaveAttribute("href", "/m/TAF/i/2");
  });

  it("renders empty state and All Issues heading when view='all' and list is empty", () => {
    render(
      <TooltipProvider>
        <MachineIssuesCard
          issues={[]}
          machineName="The Addams Family"
          machineInitials="TAF"
          view="all"
        />
      </TooltipProvider>
    );

    const section = screen.getByTestId("issues-section");
    expect(
      within(section).getByRole("heading", { name: "All Issues (0)" })
    ).toBeInTheDocument();
    expect(within(section).queryAllByTestId("issue-card")).toHaveLength(0);
    expect(within(section).getByText("No open issues")).toBeInTheDocument();
    expect(
      within(section).getByRole("link", { name: "Report an Issue" })
    ).toHaveAttribute("href", "/report?machine=TAF");
  });
});
