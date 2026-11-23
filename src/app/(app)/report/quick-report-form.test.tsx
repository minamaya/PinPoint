import React from "react";
import { renderToString } from "react-dom/server";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitPublicIssueAction } from "./actions";
import { ReportDraftProvider, useReportDraft } from "./report-draft-store";
import {
  DRAFT_VERSION,
  REPORT_DRAFT_KEY,
  defaultEntry,
  emptySingle,
  parseDraft,
  serializeDraft,
} from "./report-draft-schema";
import { QuickReportForm } from "./quick-report-form";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("./actions", () => ({
  submitPublicIssueAction: vi.fn(),
  getRecentIssuesAction: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("~/components/issues/QuickRecentIssues", () => ({
  QuickRecentIssues: () => <div data-testid="recent-issues" />,
}));

const MACHINE = {
  id: "11111111-1111-4111-8111-111111111111",
  value: "11111111-1111-4111-8111-111111111111",
  name: "Attack from Mars",
  initials: "AFM",
};

function renderForm(canMultiple: boolean): void {
  render(
    <ReportDraftProvider machines={[MACHINE]} assignees={[]}>
      <QuickReportForm
        machinesList={[MACHINE]}
        canMultiple={canMultiple}
        initialIssues={[]}
        initialMachineInitials=""
      />
    </ReportDraftProvider>
  );
}

function DraftState(): React.JSX.Element {
  const draft = useReportDraft();
  return (
    <div>
      <button
        onClick={() => {
          draft.setEntries(() => [
            {
              ...defaultEntry("22222222-2222-4222-8222-222222222222"),
              machineId: MACHINE.id,
              title: "First issue",
            },
            {
              ...defaultEntry("33333333-3333-4333-8333-333333333333"),
              title: "Other issue",
            },
          ]);
          draft.patchSingle({ firstName: "Stale reporter" });
        }}
      >
        Seed draft
      </button>
      <output data-testid="single-name">{draft.single.firstName}</output>
      <output data-testid="second-title">{draft.entries[1]?.title}</output>
    </div>
  );
}

describe("QuickReportForm", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(submitPublicIssueAction).mockReset();
  });

  it("renders URL machine and Quick frequency on the first server paint", () => {
    const markup = renderToString(
      <ReportDraftProvider machines={[MACHINE]} assignees={[]}>
        <QuickReportForm
          machinesList={[MACHINE]}
          defaultMachineId={MACHINE.id}
          canMultiple={false}
          initialIssues={[]}
          initialMachineInitials="AFM"
        />
      </ReportDraftProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = markup;

    expect(container.querySelector("#quick-machine")).toHaveTextContent(
      "Attack from Mars"
    );
    expect(
      container.querySelector('input[name="frequency"]:checked')
    ).toHaveAttribute("value", "not_specified");
  });

  it("starts with the approved Quick fields and Not specified frequency", async () => {
    renderForm(false);

    expect(
      screen.getByRole("combobox", { name: "Machine" })
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Problem" })).toHaveAttribute(
      "maxlength",
      "60"
    );
    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "Not specified" })
      ).toBeChecked();
    });
    expect(screen.getByRole("link", { name: "Add details" })).toHaveAttribute(
      "href",
      "/report/detailed"
    );
  });

  it("submits apron source and keeps it when opening Detailed", () => {
    render(
      <ReportDraftProvider machines={[MACHINE]} assignees={[]}>
        <QuickReportForm
          machinesList={[MACHINE]}
          defaultMachineId={MACHINE.id}
          canMultiple={false}
          initialIssues={[]}
          initialMachineInitials="AFM"
          source="apron"
        />
      </ReportDraftProvider>
    );

    expect(document.querySelector('input[name="source"]')).toHaveValue("apron");
    expect(screen.getByRole("link", { name: "Add details" })).toHaveAttribute(
      "href",
      "/report/detailed?machine=AFM&source=apron"
    );
  });

  it("hides Multiple without capability and shows it when permitted", () => {
    const { unmount } = render(
      <ReportDraftProvider machines={[MACHINE]} assignees={[]}>
        <QuickReportForm
          machinesList={[MACHINE]}
          canMultiple={false}
          initialIssues={[]}
          initialMachineInitials=""
        />
      </ReportDraftProvider>
    );
    expect(
      screen.queryByRole("link", { name: "Report multiple issues" })
    ).not.toBeInTheDocument();

    unmount();
    renderForm(true);
    expect(
      screen.getByRole("link", { name: "Report multiple issues" })
    ).toHaveAttribute("href", "/report/multiple");
  });

  it("clears Detailed-only data after a Quick submit while preserving extra Multiple rows", async () => {
    vi.mocked(submitPublicIssueAction).mockResolvedValue({ success: true });
    render(
      <ReportDraftProvider machines={[MACHINE]} assignees={[]}>
        <DraftState />
        <QuickReportForm
          machinesList={[MACHINE]}
          canMultiple
          initialIssues={[]}
          initialMachineInitials=""
        />
      </ReportDraftProvider>
    );

    act(() => screen.getByRole("button", { name: "Seed draft" }).click());
    expect(screen.getByTestId("single-name")).toHaveTextContent(
      "Stale reporter"
    );
    act(() => screen.getByRole("button", { name: "Report issue" }).click());

    await waitFor(() => {
      expect(screen.getByTestId("single-name")).toBeEmptyDOMElement();
      expect(screen.getByTestId("second-title")).toHaveTextContent(
        "Other issue"
      );
    });
  });

  it("writes machine, title, and frequency into the shared draft and updates Add details href", async () => {
    const user = userEvent.setup();
    renderForm(true);

    await user.click(screen.getByRole("combobox", { name: "Machine" }));
    await user.click(screen.getByTestId(`machine-option-${MACHINE.id}`));
    await user.type(
      screen.getByRole("textbox", { name: "Problem" }),
      "Handoff test problem"
    );
    await user.click(screen.getByRole("radio", { name: "Frequent" }));

    expect(screen.getByRole("link", { name: "Add details" })).toHaveAttribute(
      "href",
      "/report/detailed?machine=AFM"
    );
    const persisted = parseDraft(window.localStorage.getItem(REPORT_DRAFT_KEY));
    expect(persisted?.entries[0]).toMatchObject({
      machineId: MACHINE.id,
      title: "Handoff test problem",
      frequency: "frequent",
    });
  });

  it("preserves an existing shared draft instead of resetting frequency on mount", async () => {
    window.localStorage.setItem(
      REPORT_DRAFT_KEY,
      serializeDraft({
        version: DRAFT_VERSION,
        entries: [
          {
            ...defaultEntry("22222222-2222-4222-8222-222222222222"),
            machineId: MACHINE.id,
            title: "Carried from Detailed",
            frequency: "constant",
          },
        ],
        single: emptySingle(),
      })
    );

    renderForm(true);

    expect(screen.getByRole("textbox", { name: "Problem" })).toHaveValue(
      "Carried from Detailed"
    );
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Constant" })).toBeChecked();
    });
  });
});
