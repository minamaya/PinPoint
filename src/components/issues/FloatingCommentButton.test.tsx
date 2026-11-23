import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import { FloatingCommentButton } from "./FloatingCommentButton";
import {
  clearStoredCommentDrafts,
  commentDraftKey,
  useCommentDraft,
} from "~/components/issues/comment-draft";
import {
  IssueSectionTabList,
  IssueSections,
} from "~/components/issues/IssueSectionTabs";

// Stub AddCommentForm to avoid jsdom + ProseMirror fragility. Surface
// `issueId`, `userId` (whose draft it restores), and `quick` so a dropped prop
// fails the open test.
vi.mock("~/components/issues/AddCommentForm", () => ({
  AddCommentForm: vi.fn(
    ({
      issueId,
      userId,
      quick,
    }: {
      issueId: string;
      userId: string;
      quick?: boolean;
    }) => (
      <div
        data-testid="mock-add-comment-form"
        data-issue-id={issueId}
        data-user-id={userId}
        data-quick={String(quick)}
      />
    )
  ),
}));

function renderOnIssuePage(): void {
  render(
    <IssueSections>
      <IssueSectionTabList otherIssuesCount={0} />
      <FloatingCommentButton issueId="test-issue-123" userId="user-1" />
    </IssueSections>
  );
}

describe("FloatingCommentButton (spec issue-detail §8.3)", () => {
  it("is mobile-only: hidden from md: up, where the comment box is inline", () => {
    renderOnIssuePage();
    expect(
      screen.getByTestId("floating-comment-button").parentElement
    ).toHaveClass("md:hidden");
  });

  it("shows on the Issue tab only", () => {
    renderOnIssuePage();
    expect(screen.getByRole("button", { name: "Comment" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    expect(
      screen.queryByRole("button", { name: "Comment" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Other issues/ }));
    expect(
      screen.queryByRole("button", { name: "Comment" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Issue" }));
    expect(screen.getByRole("button", { name: "Comment" })).toBeInTheDocument();
  });

  it("opens the quick composer in a sheet for this issue", async () => {
    renderOnIssuePage();
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const form = screen.getByTestId("mock-add-comment-form");
    expect(form.getAttribute("data-issue-id")).toBe("test-issue-123");
    expect(form.getAttribute("data-user-id")).toBe("user-1");
    expect(form.getAttribute("data-quick")).toBe("true");
  });

  describe("dismissal (design-bible §17)", () => {
    afterEach(() => {
      clearStoredCommentDrafts();
    });

    // Writes the draft the composer would, through the same store.
    function DraftWriter(): null {
      const draft = useCommentDraft(
        commentDraftKey("user-1", "test-issue-123"),
        "test-writer"
      );
      writeDraft = draft.setDoc;
      return null;
    }
    let writeDraft: (doc: never) => void = () => undefined;

    it("closes at once with no comment typed", async () => {
      const user = userEvent.setup();
      renderOnIssuePage();
      await user.click(screen.getByRole("button", { name: "Comment" }));
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it("asks before closing a typed comment; Discard empties the draft", async () => {
      const user = userEvent.setup();
      render(
        <IssueSections>
          <IssueSectionTabList otherIssuesCount={0} />
          <DraftWriter />
          <FloatingCommentButton issueId="test-issue-123" userId="user-1" />
        </IssueSections>
      );
      await user.click(screen.getByRole("button", { name: "Comment" }));
      await screen.findByRole("dialog");
      act(() => {
        writeDraft({
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "hi" }] },
          ],
        } as never);
      });

      await user.keyboard("{Escape}");
      expect(
        await screen.findByRole("alertdialog", { name: "Discard changes?" })
      ).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Discard" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });

      // The draft is gone: reopening and pressing Escape closes at once.
      await user.click(screen.getByRole("button", { name: "Comment" }));
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });
  });
});
