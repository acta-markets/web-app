import { describe, expect, it } from "vitest";
import { docsDocumentToHtml } from "./render";
import type { GoogleDocsDocument } from "./types";

describe("docsDocumentToHtml", () => {
  it("emits semantic headings and paragraphs", () => {
    const doc: GoogleDocsDocument = {
      body: {
        content: [
          {
            paragraph: {
              elements: [{ textRun: { content: "Section one\n" } }],
              paragraphStyle: { namedStyleType: "HEADING_1" },
            },
          },
          {
            paragraph: {
              elements: [{ textRun: { content: "Plain paragraph\n" } }],
            },
          },
        ],
      },
    };

    const html = docsDocumentToHtml(doc);
    expect(html).toContain("<h1>Section one</h1>");
    expect(html).toContain("<p>Plain paragraph</p>");
    expect(html).not.toContain("\n");
  });

  it("applies inline bold, italic, underline, strikethrough and safe links", () => {
    const doc: GoogleDocsDocument = {
      body: {
        content: [
          {
            paragraph: {
              elements: [
                { textRun: { content: "bold", textStyle: { bold: true } } },
                { textRun: { content: " and ", textStyle: {} } },
                { textRun: { content: "linked", textStyle: { link: { url: "https://acta.markets" } } } },
                { textRun: { content: "\n", textStyle: {} } },
              ],
            },
          },
        ],
      },
    };

    const html = docsDocumentToHtml(doc);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://acta.markets"');
    expect(html).toContain('target="_blank"');
  });

  it("neutralizes javascript: links", () => {
    const doc: GoogleDocsDocument = {
      body: {
        content: [
          {
            paragraph: {
              elements: [
                { textRun: { content: "evil", textStyle: { link: { url: "javascript:alert(1)" } } } },
                { textRun: { content: "\n" } },
              ],
            },
          },
        ],
      },
    };

    const html = docsDocumentToHtml(doc);
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  it("escapes raw HTML in text runs", () => {
    const doc: GoogleDocsDocument = {
      body: {
        content: [
          {
            paragraph: {
              elements: [{ textRun: { content: "<script>alert('x')</script>\n" } }],
            },
          },
        ],
      },
    };

    const html = docsDocumentToHtml(doc);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders unordered and ordered lists", () => {
    const doc: GoogleDocsDocument = {
      lists: {
        "list-bullet": {
          listProperties: {
            nestingLevels: [{ glyphType: "GLYPH_TYPE_UNSPECIFIED" }],
          },
        },
        "list-number": {
          listProperties: {
            nestingLevels: [{ glyphType: "GLYPH_TYPE_DECIMAL" }],
          },
        },
      },
      body: {
        content: [
          {
            paragraph: {
              elements: [{ textRun: { content: "First bullet\n" } }],
              bullet: { listId: "list-bullet", nestingLevel: 0 },
            },
          },
          {
            paragraph: {
              elements: [{ textRun: { content: "First number\n" } }],
              bullet: { listId: "list-number", nestingLevel: 0 },
            },
          },
        ],
      },
    };

    const html = docsDocumentToHtml(doc);
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>First bullet</li>");
    expect(html).toContain("<li>First number</li>");
  });

  it("renders tables and images", () => {
    const doc: GoogleDocsDocument = {
      inlineObjects: {
        "kix.img1": {
          inlineObjectProperties: {
            embeddedObject: {
              imageProperties: { contentUri: "https://lh3.googleusercontent.com/abc" },
            },
          },
        },
      },
      body: {
        content: [
          {
            table: {
              tableRows: [
                {
                  tableCells: [
                    {
                      content: [
                        { paragraph: { elements: [{ textRun: { content: "Cell\n" } }] } },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          {
            paragraph: {
              elements: [{ inlineObjectElement: { inlineObjectId: "kix.img1" } }],
            },
          },
        ],
      },
    };

    const html = docsDocumentToHtml(doc);
    expect(html).toContain("<table>");
    expect(html).toContain("<td><p>Cell</p></td>");
    expect(html).toContain('<img src="/api/data-room/image?src=');
  });

  it("returns an empty string for an empty body", () => {
    expect(docsDocumentToHtml({ body: { content: [] } })).toBe("");
  });
});
