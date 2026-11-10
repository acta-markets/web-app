/**
 * Shared types for the Acta data room.
 *
 * The data room is read-only: it lists a Google Drive folder tree and renders
 * Google Docs as clean, brand-styled HTML. No write scopes, no client tokens.
 */

/** What a Drive file entry is, from the data room's point of view. */
export type DataRoomKind = "folder" | "document" | "other";

/** One node in the folder/doc tree shown in the sidebar. */
export interface DataRoomNode {
  id: string;
  name: string;
  mimeType: string;
  kind: DataRoomKind;
  modifiedTime: string | null;
  size: string | null;
  webViewLink: string | null;
  children: DataRoomNode[];
}

/** A breadcrumb segment leading to a document. */
export interface DataRoomCrumb {
  id: string;
  name: string;
  /** "root" is the configured Drive folder itself; "folder" a nested folder. */
  kind: "root" | "folder";
}

/** A rendered document (or a non-renderable file with a notice). */
export interface DataRoomDoc {
  id: string;
  name: string;
  mimeType: string;
  kind: "document" | "other";
  modifiedTime: string | null;
  webViewLink: string | null;
  /** Sanitized-by-construction HTML for Google Docs; empty for "other". */
  html: string;
  breadcrumbs: DataRoomCrumb[];
  /** Human explanation when a file can't be rendered inline. */
  notice?: string;
}

/** Runtime configuration and status, resolved from env vars only. */
export interface DataRoomConfig {
  /** True when credentials + folder id are present and valid-looking. */
  configured: boolean;
  /** True when running against the built-in demo tree (no credentials). */
  demo: boolean;
  folderId: string | null;
  title: string;
  /** Present when configured but the Drive call failed. */
  error: string | null;
}

/* --------------------------------------------------------------------------
 * Minimal Google Docs v1 REST types. Only the fields the renderer needs.
 * ------------------------------------------------------------------------ */

export interface GoogleDocsLink {
  url?: string;
}

export interface GoogleDocsTextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  link?: GoogleDocsLink;
}

export interface GoogleDocsTextRun {
  content?: string;
  textStyle?: GoogleDocsTextStyle;
}

export interface GoogleDocsAutoText {
  content?: string;
  textStyle?: GoogleDocsTextStyle;
}

export interface GoogleDocsInlineObjectElement {
  inlineObjectId?: string;
}

export type GoogleDocsParagraphElement = {
  textRun?: GoogleDocsTextRun;
  autoText?: GoogleDocsAutoText;
  inlineObjectElement?: GoogleDocsInlineObjectElement;
  horizontalRule?: unknown;
  pageBreak?: unknown;
};

export interface GoogleDocsBullet {
  listId?: string;
  nestingLevel?: number;
}

export interface GoogleDocsParagraph {
  elements?: GoogleDocsParagraphElement[];
  paragraphStyle?: { namedStyleType?: string };
  bullet?: GoogleDocsBullet;
}

export interface GoogleDocsTableCell {
  content?: GoogleDocsStructuralElement[];
}

export interface GoogleDocsTableRow {
  tableCells?: GoogleDocsTableCell[];
}

export interface GoogleDocsTable {
  tableRows?: GoogleDocsTableRow[];
}

export interface GoogleDocsStructuralElement {
  paragraph?: GoogleDocsParagraph;
  table?: GoogleDocsTable;
  tableOfContents?: unknown;
  sectionBreak?: unknown;
}

export interface GoogleDocsImageProperties {
  contentUri?: string;
  sourceUri?: string;
}

export interface GoogleDocsInlineObject {
  inlineObjectProperties?: {
    embeddedObject?: {
      title?: string;
      imageProperties?: GoogleDocsImageProperties;
    };
  };
}

export interface GoogleDocsDocument {
  title?: string;
  body?: { content?: GoogleDocsStructuralElement[] };
  lists?: Record<
    string,
    {
      listProperties?: {
        nestingLevels?: Array<{ glyphType?: string }>;
      };
    }
  >;
  inlineObjects?: Record<string, GoogleDocsInlineObject>;
}
