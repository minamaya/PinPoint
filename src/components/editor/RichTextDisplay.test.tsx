import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RichTextDisplay } from "./RichTextDisplay";
import { openFeedbackForm } from "~/components/feedback/FeedbackWidget";
import type { ProseMirrorDoc } from "~/lib/tiptap/types";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("~/components/feedback/FeedbackWidget", () => ({
  openFeedbackForm: vi.fn(),
}));

describe("RichTextDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when content is null", () => {
    const { container } = render(<RichTextDisplay content={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders bold, italic, and mention links with prose classes", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "Alert" },
            { type: "text", text: " for " },
            { type: "text", marks: [{ type: "italic" }], text: "rich text" },
            { type: "text", text: " " },
            {
              type: "mention",
              attrs: { id: "user-42", label: "Pat Tech" },
            },
          ],
        },
      ],
    };

    const { container } = render(
      <RichTextDisplay content={doc} className="custom-prose" />
    );

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass("prose", "custom-prose");
    expect(container.querySelector("strong")).toHaveTextContent("Alert");
    expect(container.querySelector("em")).toHaveTextContent("rich text");
    const mentionLink = screen.getByRole("link", { name: "@Pat Tech" });
    expect(mentionLink).toHaveAttribute("href", "/profile/user-42");
    expect(mentionLink).toHaveClass("mention");
  });

  it("renders RenderFailedPlaceholder and wires Report this when rendering fails", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const malformedDoc: ProseMirrorDoc = {
        type: "doc",
        get content(): never {
          throw new TypeError("corrupt doc");
        },
      };

      render(<RichTextDisplay content={malformedDoc} />);

      const alert = screen.getByRole("alert", {
        name: "Content failed to render",
      });
      expect(alert).toHaveTextContent("This content failed to render.");
      await user.click(screen.getByRole("button", { name: "Report this" }));
      expect(openFeedbackForm).toHaveBeenCalledOnce();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
