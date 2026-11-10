import type { DataRoomDoc, DataRoomNode } from "./types";

/**
 * Demo content used when the data room is not configured (no credentials or no
 * folder id). Keeps the page rendering so the shell can be inspected without a
 * Google account, and makes the empty/error states easy to exercise.
 */

const FOLDER = "application/vnd.google-apps.folder";
const DOC = "application/vnd.google-apps.document";

export const DEMO_TREE: DataRoomNode[] = [
  {
    id: "demo-corporate",
    name: "Corporate",
    mimeType: FOLDER,
    kind: "folder",
    modifiedTime: null,
    size: null,
    webViewLink: null,
    children: [
      {
        id: "demo-overview",
        name: "Company overview",
        mimeType: DOC,
        kind: "document",
        modifiedTime: "2026-11-01T10:00:00.000Z",
        size: null,
        webViewLink: null,
        children: [],
      },
      {
        id: "demo-team",
        name: "Team and structure",
        mimeType: DOC,
        kind: "document",
        modifiedTime: "2026-11-02T10:00:00.000Z",
        size: null,
        webViewLink: null,
        children: [],
      },
    ],
  },
  {
    id: "demo-legal",
    name: "Legal",
    mimeType: FOLDER,
    kind: "folder",
    modifiedTime: null,
    size: null,
    webViewLink: null,
    children: [
      {
        id: "demo-terms",
        name: "Terms of service",
        mimeType: DOC,
        kind: "document",
        modifiedTime: "2026-10-15T10:00:00.000Z",
        size: null,
        webViewLink: null,
        children: [],
      },
    ],
  },
  {
    id: "demo-financials",
    name: "Financials",
    mimeType: FOLDER,
    kind: "folder",
    modifiedTime: null,
    size: null,
    webViewLink: null,
    children: [
      {
        id: "demo-metrics",
        name: "Key metrics (Q3)",
        mimeType: DOC,
        kind: "document",
        modifiedTime: "2026-10-30T10:00:00.000Z",
        size: null,
        webViewLink: null,
        children: [],
      },
      {
        id: "demo-budget",
        name: "Budget.pdf",
        mimeType: "application/pdf",
        kind: "other",
        modifiedTime: "2026-10-28T10:00:00.000Z",
        size: "1048576",
        webViewLink: null,
        children: [],
      },
    ],
  },
];

const DEMO_HTML = `
<p>This is demo content. The data room is not connected to Google Drive yet,
so it renders a sample tree and document to show the layout and styling.</p>
<h2>What it will look like</h2>
<p>Once configured, the sidebar fills with your real Drive folders and the
reading pane renders Google Docs with Acta styling: Space Grotesk headings,
JetBrains Mono body, and the accent colours.</p>
<h3>A nested list</h3>
<ul>
<li>Drive folders appear as a tree</li>
<li>Documents render as clean HTML</li>
<li>Nothing else is touched, read-only only</li>
</ul>
<h2>A table</h2>
<table>
<tr><th>Item</th><th>State</th></tr>
<tr><td>Google Drive API</td><td>not configured</td></tr>
<tr><td>Google Docs API</td><td>not configured</td></tr>
</table>
<p>Set the environment variables in <code>.env.local</code> and this becomes
your real room.</p>`;

const DEMO_DOC_MAP: Record<string, DataRoomDoc> = {
  "demo-overview": {
    id: "demo-overview",
    name: "Company overview",
    mimeType: DOC,
    kind: "document",
    modifiedTime: "2026-11-01T10:00:00.000Z",
    webViewLink: null,
    html: `<h2>Overview</h2><p>Demo overview document body.</p>${DEMO_HTML}`,
    breadcrumbs: [
      { id: "root", name: "Data Room", kind: "root" },
      { id: "demo-corporate", name: "Corporate", kind: "folder" },
    ],
  },
  "demo-team": {
    id: "demo-team",
    name: "Team and structure",
    mimeType: DOC,
    kind: "document",
    modifiedTime: "2026-11-02T10:00:00.000Z",
    webViewLink: null,
    html: `<h2>Team</h2><p>Demo team document body.</p>${DEMO_HTML}`,
    breadcrumbs: [
      { id: "root", name: "Data Room", kind: "root" },
      { id: "demo-corporate", name: "Corporate", kind: "folder" },
    ],
  },
  "demo-terms": {
    id: "demo-terms",
    name: "Terms of service",
    mimeType: DOC,
    kind: "document",
    modifiedTime: "2026-10-15T10:00:00.000Z",
    webViewLink: null,
    html: `<h2>Terms</h2><p>Demo terms document body.</p>${DEMO_HTML}`,
    breadcrumbs: [
      { id: "root", name: "Data Room", kind: "root" },
      { id: "demo-legal", name: "Legal", kind: "folder" },
    ],
  },
  "demo-metrics": {
    id: "demo-metrics",
    name: "Key metrics (Q3)",
    mimeType: DOC,
    kind: "document",
    modifiedTime: "2026-10-30T10:00:00.000Z",
    webViewLink: null,
    html: `<h2>Metrics</h2><p>Demo metrics document body.</p>${DEMO_HTML}`,
    breadcrumbs: [
      { id: "root", name: "Data Room", kind: "root" },
      { id: "demo-financials", name: "Financials", kind: "folder" },
    ],
  },
};

export function getDemoDoc(fileId: string): DataRoomDoc | null {
  return DEMO_DOC_MAP[fileId] ?? null;
}
