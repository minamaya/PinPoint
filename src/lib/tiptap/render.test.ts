// src/lib/tiptap/render.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { renderDocToHtml, RENDER_FAILED_SENTINEL } from "./render";
import type { ProseMirrorDoc } from "./types";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

describe("renderDocToHtml", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a simple paragraph", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    };
    expect(renderDocToHtml(doc)).toBe("<p>Hello world</p>");
  });

  it("renders a mention as a profile link", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hey " },
            {
              type: "mention",
              attrs: { id: "user-1", label: "Tim" },
            },
          ],
        },
      ],
    };
    const html = renderDocToHtml(doc);
    expect(html).toContain(
      '<a class="mention" href="/profile/user-1" data-mention-id="user-1">@Tim</a>'
    );
  });

  it("strips script tags", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            {
              type: "text",
              marks: [{ type: "bold" }],
              text: "<script>alert('xss')</script>",
            },
          ],
        },
      ],
    };
    const html = renderDocToHtml(doc);
    expect(html).not.toContain("<script>");
    expect(html).toContain(
      "<p>Hello <strong>&lt;script&gt;alert('xss')&lt;/script&gt;</strong></p>"
    );
  });

  it("renders bold, italic, strike, code, links, headings, lists, and block elements", () => {
    const doc: ProseMirrorDoc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Clamped H2" }],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Subheading" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "bold" },
            { type: "text", text: " " },
            { type: "text", marks: [{ type: "italic" }], text: "italic" },
            { type: "text", text: " " },
            { type: "text", marks: [{ type: "strike" }], text: "old" },
            { type: "text", text: " " },
            { type: "text", marks: [{ type: "code" }], text: "fn()" },
            { type: "hardBreak" },
            {
              type: "text",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com/a?x=1&y=2" },
                },
              ],
              text: "Docs",
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "One" }] },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Two" }] },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Note" }] },
          ],
        },
        {
          type: "codeBlock",
          content: [{ type: "text", text: "const x = 1;" }],
        },
        { type: "horizontalRule" },
      ],
    };

    const html = renderDocToHtml(doc);

    expect(html).toContain("<h2>Clamped H2</h2>");
    expect(html).toContain("<h3>Subheading</h3>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<s>old</s>");
    expect(html).toContain("<code>fn()</code>");
    expect(html).toContain("<br />");
    expect(html).toContain(
      '<a href="https://example.com/a?x=1&amp;y=2">Docs</a>'
    );
    expect(html).toContain("<ul><li><p>One</p></li></ul>");
    expect(html).toContain("<ol><li><p>Two</p></li></ol>");
    expect(html).toContain("<blockquote><p>Note</p></blockquote>");
    expect(html).toContain("<pre><code>const x = 1;</code></pre>");
    expect(html).toContain("<hr />");
  });

  it("strips unsafe javascript: link hrefs and renders legacy plain text", () => {
    const xssLink: ProseMirrorDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
              text: "Click",
            },
          ],
        },
      ],
    };

    expect(renderDocToHtml(xssLink)).not.toContain("javascript:");
    expect(renderDocToHtml("Line one\nLine two")).toBe(
      "<p>Line one<br />Line two</p>"
    );
    expect(renderDocToHtml(null)).toBe("");
  });

  it("returns the render-failed sentinel and calls Sentry when content throws", () => {
    // A doc whose content array contains null forces renderNode to access
    // .type on null, throwing a TypeError at runtime.
    const malformedDoc: ProseMirrorDoc = {
      type: "doc",
      content: [null] as unknown as ProseMirrorDoc["content"],
    };

    const html = renderDocToHtml(malformedDoc);

    expect(html).toBe(RENDER_FAILED_SENTINEL);
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce();
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        contexts: { pinpoint: { action: "renderDocToHtml" } },
      })
    );
  });
});
