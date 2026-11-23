import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { EditorToolbar } from "./EditorToolbar";

function createTestEditor(text = "Hello world"): Editor {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false }),
      Link.configure({ openOnClick: false }),
    ],
    content: `<p>${text}</p>`,
  });
  editor.commands.selectAll();
  return editor;
}

describe("EditorToolbar", () => {
  let activeEditor: Editor | null = null;

  afterEach(() => {
    activeEditor?.destroy();
    activeEditor = null;
    vi.restoreAllMocks();
  });

  it("renders nothing when editor is null", () => {
    const { container } = render(<EditorToolbar editor={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("toggles bold, italic, headings, lists, links, and @mentions on a real TipTap Editor", async () => {
    const user = userEvent.setup();
    activeEditor = createTestEditor("Sample");
    render(<EditorToolbar editor={activeEditor} mentionsEnabled />);

    await user.click(screen.getByRole("button", { name: "Toggle bold" }));
    expect(activeEditor.getHTML()).toContain("<strong>Sample</strong>");

    await user.click(screen.getByRole("button", { name: "Toggle italic" }));
    expect(activeEditor.getHTML()).toContain("<em>Sample</em>");

    await user.click(screen.getByRole("button", { name: "Toggle heading 2" }));
    expect(activeEditor.getHTML()).toContain("<h2>");

    await user.click(
      screen.getByRole("button", { name: "Toggle bullet list" })
    );
    expect(activeEditor.getHTML()).toContain("<ul>");

    const promptSpy = vi
      .spyOn(window, "prompt")
      .mockReturnValue("https://example.com");
    await user.click(screen.getByRole("button", { name: "Insert link" }));
    expect(promptSpy).toHaveBeenCalledWith("URL", undefined);
    expect(activeEditor.getHTML()).toContain('href="https://example.com"');

    // Empty prompt unsets the link.
    promptSpy.mockReturnValue("");
    await user.click(screen.getByRole("button", { name: "Insert link" }));
    expect(activeEditor.getHTML()).not.toContain('href="https://example.com"');

    await user.click(screen.getByRole("button", { name: "Mention someone" }));
    expect(activeEditor.getText()).toContain("@");
  });

  it("omits headings, link, and @mention in card format when mentionsEnabled is off", () => {
    activeEditor = createTestEditor();
    render(<EditorToolbar editor={activeEditor} formats="card" />);

    expect(
      screen.getByRole("button", { name: "Toggle bold" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Toggle italic" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Toggle bullet list" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Toggle ordered list" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Toggle heading 2" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Toggle heading 3" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Insert link" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mention someone" })
    ).not.toBeInTheDocument();
  });
});
