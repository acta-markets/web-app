import "server-only";

import { getAccessToken, getDataRoomConfig } from "./auth";
import { docsDocumentToHtml } from "./render";
import { DEMO_TREE, getDemoDoc } from "./mock";
import type {
  DataRoomConfig,
  DataRoomCrumb,
  DataRoomDoc,
  DataRoomNode,
  GoogleDocsDocument,
} from "./types";

/**
 * Server-only Google Drive + Docs client for the data room.
 *
 * - Lists the configured folder tree (depth- and count-capped).
 * - Renders Google Docs as clean HTML via the Docs v1 JSON.
 * - Caches tree + docs in memory for a short TTL to stay gentle on rate limits.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_DOC = "application/vnd.google-apps.document";
const GOOGLE_FOLDER = "application/vnd.google-apps.folder";

const MAX_DEPTH = 8;
const MAX_FILES = 500;
const TTL_MS = 60_000;

const treeCache = new Map<string, { at: number; value: DataRoomNode[] }>();
const docCache = new Map<string, { at: number; value: DataRoomDoc }>();

interface RawDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

async function driveList(token: string, folderId: string): Promise<RawDriveFile[]> {
  const query = `'${folderId}' in parents and trashed = false`;
  const base = new URLSearchParams({
    q: query,
    pageSize: "1000",
    orderBy: "name",
    fields: "nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink)",
  });

  const items: RawDriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const url = `${DRIVE_API}/files?${base.toString()}${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
    }`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Drive list failed (${response.status})`);
    }
    const data = (await response.json()) as {
      files?: RawDriveFile[];
      nextPageToken?: string;
    };
    items.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

function toNode(file: RawDriveFile): DataRoomNode {
  const kind =
    file.mimeType === GOOGLE_FOLDER
      ? "folder"
      : file.mimeType === GOOGLE_DOC
        ? "document"
        : "other";
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    kind,
    modifiedTime: file.modifiedTime ?? null,
    size: file.size ?? null,
    webViewLink: file.webViewLink ?? null,
    children: [],
  };
}

async function buildTree(
  token: string,
  folderId: string,
  depth: number,
  budget: { remaining: number },
): Promise<DataRoomNode[]> {
  if (depth <= 0 || budget.remaining <= 0) return [];
  const files = await driveList(token, folderId);

  const nodes: DataRoomNode[] = [];
  for (const file of files) {
    if (budget.remaining <= 0) break;
    budget.remaining -= 1;

    const node = toNode(file);
    if (node.kind === "folder") {
      node.children = await buildTree(token, file.id, depth - 1, budget);
    }
    nodes.push(node);
  }
  return nodes;
}

export interface DataRoomTree {
  nodes: DataRoomNode[];
  config: DataRoomConfig;
}

/** Return the sidebar tree. Falls back to the demo tree when unconfigured. */
export async function getTree(): Promise<DataRoomTree> {
  const config = getDataRoomConfig();

  if (!config.configured) {
    return { nodes: DEMO_TREE, config };
  }

  try {
    const token = await getAccessToken();
    if (!token) throw new Error("Could not obtain a Google access token");

    const cached = treeCache.get(config.folderId as string);
    if (cached && Date.now() - cached.at < TTL_MS) {
      return { nodes: cached.value, config };
    }

    const nodes = await buildTree(token, config.folderId as string, MAX_DEPTH, {
      remaining: MAX_FILES,
    });
    treeCache.set(config.folderId as string, { at: Date.now(), value: nodes });
    return { nodes, config };
  } catch (error) {
    return {
      nodes: [],
      config: {
        ...config,
        error: error instanceof Error ? error.message : "Google Drive request failed",
      },
    };
  }
}

interface RawDriveMeta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

async function driveGet(token: string, fileId: string): Promise<RawDriveMeta> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,modifiedTime,size,webViewLink",
  });
  const response = await fetch(`${DRIVE_API}/files/${fileId}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Drive get failed (${response.status})`);
  return (await response.json()) as RawDriveMeta;
}

async function docsGet(token: string, fileId: string): Promise<GoogleDocsDocument> {
  const response = await fetch(`https://docs.googleapis.com/v1/documents/${fileId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Docs get failed (${response.status})`);
  return (await response.json()) as GoogleDocsDocument;
}

function findBreadcrumbs(
  nodes: DataRoomNode[],
  fileId: string,
  trail: DataRoomCrumb[],
): DataRoomCrumb[] | null {
  for (const node of nodes) {
    if (node.id === fileId) return trail;
    if (node.children.length > 0) {
      const found = findBreadcrumbs(
        node.children,
        fileId,
        [...trail, { id: node.id, name: node.name, kind: "folder" }],
      );
      if (found) return found;
    }
  }
  return null;
}

const NOT_RENDERABLE_NOTICE =
  "This file type isn't rendered inline. Open it in Google Drive to view it.";

/** Render one document (or describe a non-renderable file). */
export async function getDoc(fileId: string): Promise<DataRoomDoc | null> {
  const config = getDataRoomConfig();

  if (!config.configured) {
    return getDemoDoc(fileId);
  }

  try {
    const token = await getAccessToken();
    if (!token) throw new Error("Could not obtain a Google access token");

    const cached = docCache.get(fileId);
    if (cached && Date.now() - cached.at < TTL_MS) {
      return cached.value;
    }

    const meta = await driveGet(token, fileId);
    const tree = treeCache.get(config.folderId as string)?.value;
    const breadcrumbs =
      findBreadcrumbs(
        tree ?? (await getTree()).nodes,
        fileId,
        [{ id: "root", name: config.title, kind: "root" }],
      ) ?? [{ id: "root", name: config.title, kind: "root" }];

    const base = {
      id: meta.id,
      name: meta.name,
      mimeType: meta.mimeType,
      modifiedTime: meta.modifiedTime ?? null,
      webViewLink: meta.webViewLink ?? null,
      breadcrumbs,
    };

    let doc: DataRoomDoc;
    if (meta.mimeType === GOOGLE_DOC) {
      const document = await docsGet(token, fileId);
      doc = { ...base, kind: "document", html: docsDocumentToHtml(document) };
    } else {
      doc = {
        ...base,
        kind: "other",
        html: "",
        notice: NOT_RENDERABLE_NOTICE,
      };
    }

    docCache.set(fileId, { at: Date.now(), value: doc });
    return doc;
  } catch {
    return null;
  }
}
