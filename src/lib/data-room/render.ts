/**
 * Convert a Google Docs v1 document (REST JSON) into clean, safe HTML.
 *
 * We build the HTML from scratch — every tag is whitelisted and all text is
 * escaped — so the output is safe to inject without a sanitizer and carries no
 * Google chrome (no inline styles, no <style> block, no doc-wrapper markup).
 *
 * Why not Drive export→HTML? Google's HTML export is bloated with inline
 * styles and a <style> block, and inline bold/italic live in <span> styles
 * rather than <strong>/<em>. Parsing the Docs JSON lets us emit semantic,
 * brand-correct markup directly.
 */

import type {
  GoogleDocsDocument,
  GoogleDocsInlineObject,
  GoogleDocsParagraph,
  GoogleDocsParagraphElement,
  GoogleDocsTable,
} from "./types";

const ORDERED_GLYPHS = new Set([
  "GLYPH_TYPE_DECIMAL",
  "GLYPH_TYPE_ZERO_DECIMAL",
  "GLYPH_TYPE_UPPER_ALPHA",
  "GLYPH_TYPE_ALPHA",
  "GLYPH_TYPE_LOWER_ALPHA",
  "GLYPH_TYPE_UPPER_ROMAN",
  "GLYPH_TYPE_ROMAN",
  "GLYPH_TYPE_LOWER_ROMAN",
]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text);
}

/** Allow only safe link schemes; otherwise render a harmless "#". */
function safeHref(url: string): string {
  const trimmed = url.trim();
  return /^(https?:|mailto:|#)/i.test(trimmed) ? trimmed : "#";
}

function headingTag(namedStyleType?: string): string | null {
  const match = /^HEADING_([1-6])$/.exec(namedStyleType ?? "");
  return match ? `h${match[1]}` : null;
}

/** Render the inline content of a paragraph (text runs + images + rules). */
function renderInline(
  elements: GoogleDocsParagraphElement[],
  inlineObjects: Record<string, GoogleDocsInlineObject>,
): string {
  let out = "";

  for (const element of elements) {
    const run = element.textRun ?? element.autoText;
    if (run) {
      const content = run.content ?? "";
      const text = content.replace(/\n+$/g, "");
      if (text === "") continue;

      let s = escapeHtml(text).replace(/\n/g, "<br/>");
      const style = run.textStyle ?? {};

      if (style.link?.url) {
        s = `<a href="${escapeAttr(safeHref(style.link.url))}" target="_blank" rel="noreferrer noopener">${s}</a>`;
      }
      if (style.bold) s = `<strong>${s}</strong>`;
      if (style.italic) s = `<em>${s}</em>`;
      if (style.underline) s = `<u>${s}</u>`;
      if (style.strikethrough) s = `<s>${s}</s>`;

      out += s;
      continue;
    }

    if (element.inlineObjectElement?.inlineObjectId) {
      const object = inlineObjects[element.inlineObjectElement.inlineObjectId];
      const image = object?.inlineObjectProperties?.embeddedObject?.imageProperties;
      const src = image?.contentUri ?? image?.sourceUri;
      if (src) {
        const proxied = `/api/data-room/image?src=${encodeURIComponent(src)}`;
        out += `<img src="${escapeAttr(proxied)}" alt="" loading="lazy" />`;
      }
      continue;
    }

    if (element.horizontalRule) {
      out += "<hr/>";
    }
  }

  return out;
}

function renderParagraph(
  paragraph: GoogleDocsParagraph,
  inlineObjects: Record<string, GoogleDocsInlineObject>,
): string {
  const elements = paragraph.elements ?? [];

  if (elements.length === 0) return "<p></p>";
  if (elements.some((element) => element.horizontalRule)) return "<hr/>";

  const tag = headingTag(paragraph.paragraphStyle?.namedStyleType);
  const inner = renderInline(elements, inlineObjects);
  return tag ? `<${tag}>${inner}</${tag}>` : `<p>${inner}</p>`;
}

function renderTable(
  table: GoogleDocsTable,
  inlineObjects: Record<string, GoogleDocsInlineObject>,
): string {
  const rows = table.tableRows ?? [];
  const body = rows
    .map((row) => {
      const cells = (row.tableCells ?? [])
        .map((cell) => {
          const inner = (cell.content ?? [])
            .map((element) =>
              element.paragraph
                ? renderParagraph(element.paragraph, inlineObjects)
                : "",
            )
            .join("");
          return `<td>${inner}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table>${body}</table>`;
}

interface ListPara {
  listId: string;
  level: number;
  tag: "ul" | "ol";
  html: string;
}

interface ListItem {
  tag: "ul" | "ol";
  html: string;
  children: ListItem[];
}

function renderListTree(items: ListItem[]): string {
  if (items.length === 0) return "";
  const out: string[] = [];
  let index = 0;
  while (index < items.length) {
    const tag = items[index].tag;
    const group: ListItem[] = [];
    while (index < items.length && items[index].tag === tag) {
      group.push(items[index]);
      index += 1;
    }
    const inner = group
      .map((item) => `<li>${item.html}${renderListTree(item.children)}</li>`)
      .join("");
    out.push(`<${tag}>${inner}</${tag}>`);
  }
  return out.join("");
}

function renderList(listParas: ListPara[]): string {
  const roots: ListItem[] = [];
  const stack: Array<{ level: number; item: ListItem }> = [];
  let previousListId: string | null = null;

  for (const para of listParas) {
    if (previousListId !== para.listId) {
      stack.length = 0;
    }
    previousListId = para.listId;

    const item: ListItem = { tag: para.tag, html: para.html, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= para.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(item);
    } else {
      stack[stack.length - 1].item.children.push(item);
    }
    stack.push({ level: para.level, item });
  }

  return renderListTree(roots);
}

export function docsDocumentToHtml(doc: GoogleDocsDocument): string {
  const lists = doc.lists ?? {};
  const inlineObjects = doc.inlineObjects ?? {};
  const content = doc.body?.content ?? [];

  const out: string[] = [];
  const listBuffer: ListPara[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    out.push(renderList(listBuffer));
    listBuffer.length = 0;
  };

  for (const element of content) {
    if (element.paragraph) {
      const paragraph = element.paragraph;
      if (paragraph.bullet) {
        const level = paragraph.bullet.nestingLevel ?? 0;
        const glyph = lists[paragraph.bullet.listId ?? ""]?.listProperties
          ?.nestingLevels?.[level]?.glyphType;
        const tag: "ul" | "ol" = glyph && ORDERED_GLYPHS.has(glyph) ? "ol" : "ul";
        listBuffer.push({
          listId: paragraph.bullet.listId ?? "",
          level,
          tag,
          html: renderInline(paragraph.elements ?? [], inlineObjects),
        });
      } else {
        flushList();
        out.push(renderParagraph(paragraph, inlineObjects));
      }
    } else if (element.table) {
      flushList();
      out.push(renderTable(element.table, inlineObjects));
    }
    // sectionBreak and tableOfContents are deliberately skipped.
  }

  flushList();
  return out.join("");
}
