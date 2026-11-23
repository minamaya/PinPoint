import type React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  PageExportProvider,
  RegisterPageExport,
  usePageExportEntry,
  type PageExport,
} from "./page-export";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function ExportHost({
  value,
}: {
  value: PageExport | null;
}): React.JSX.Element {
  return (
    <PageExportProvider>
      <RegisterPageExport value={value} />
      <ExportButton />
    </PageExportProvider>
  );
}

function ExportButton(): React.JSX.Element | null {
  const entry = usePageExportEntry();
  if (!entry || !("onSelect" in entry)) return null;
  return (
    <button
      type="button"
      data-testid={entry.testId}
      disabled={entry.busy}
      onClick={(event) => entry.onSelect(event.currentTarget)}
    >
      {entry.buttonLabel ?? entry.label}
    </button>
  );
}

describe("PageExportProvider and usePageExportEntry", () => {
  const originalCreateObjectURL = Object.getOwnPropertyDescriptor(
    URL,
    "createObjectURL"
  );
  const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(
    URL,
    "revokeObjectURL"
  );

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("downloads the generated CSV through a Blob link with the returned filename", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => "blob:pinpoint/test-export");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    let downloadedName = "";
    const origAppend = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation(
      <T extends Node>(node: T): T => {
        if (node instanceof HTMLAnchorElement) {
          downloadedName = node.download;
        }
        return origAppend(node);
      }
    );

    const exportCsv = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        csv: "\uFEFFIssue ID,Title\r\nTAF-01,Thing flips the bird\r\n",
        fileName: "pinpoint-issues-2026-11-23.csv",
      },
    });

    render(
      <ExportHost value={{ exportCsv, emptyMessage: "No issues to export." }} />
    );
    await user.click(screen.getByTestId("export-csv-button"));

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloadedName).toBe("pinpoint-issues-2026-11-23.csv");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pinpoint/test-export");
  });

  it("announces emptyMessage on EMPTY and an error toast on failure", async () => {
    const user = userEvent.setup();
    const exportCsv = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        code: "EMPTY",
        message: "No issues match the current filters.",
      })
      .mockResolvedValueOnce({
        ok: false,
        code: "SERVER",
        message: "An error occurred while exporting issues.",
      });

    render(
      <ExportHost value={{ exportCsv, emptyMessage: "No issues to export." }} />
    );
    await user.click(screen.getByTestId("export-csv-button"));
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith("No issues to export.");
    });

    await user.click(screen.getByTestId("export-csv-button"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "An error occurred while exporting issues."
      );
    });
  });

  it("offers no entry when the page sets PageExport to null", () => {
    render(<ExportHost value={null} />);
    expect(screen.queryByTestId("export-csv-button")).not.toBeInTheDocument();
  });
});
