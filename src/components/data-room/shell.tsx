"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  Info,
  Menu,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActaLogo } from "@/components/acta-logo";
import { cn } from "@/lib/cn";
import type { DataRoomConfig, DataRoomNode } from "@/lib/data-room/types";

interface DataRoomShellProps {
  tree: DataRoomNode[];
  config: DataRoomConfig;
  children: ReactNode;
}

interface SearchHit {
  id: string;
  name: string;
  kind: "document" | "folder" | "other";
  folderPath: string[];
}

function collectFolderIds(nodes: DataRoomNode[], acc: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind === "folder") {
      acc.push(node.id);
      collectFolderIds(node.children, acc);
    }
  }
  return acc;
}

function collectSearchHits(
  nodes: DataRoomNode[],
  query: string,
  trail: string[],
  acc: SearchHit[],
): SearchHit[] {
  for (const node of nodes) {
    if (node.name.toLowerCase().includes(query)) {
      acc.push({
        id: node.id,
        name: node.name,
        kind: node.kind,
        folderPath: trail,
      });
    }
    if (node.children.length > 0) {
      collectSearchHits(node.children, query, [...trail, node.name], acc);
    }
  }
  return acc;
}

function ancestorFolderIds(nodes: DataRoomNode[], targetId: string): string[] {
  for (const node of nodes) {
    if (node.id === targetId) return [node.id];
    if (node.children.length > 0) {
      const rest = ancestorFolderIds(node.children, targetId);
      if (rest.length > 0) return [node.id, ...rest];
    }
  }
  return [];
}

function docHref(id: string): string {
  return `/data-room/doc/${id}`;
}

function TreeNode({
  node,
  depth,
  expanded,
  onToggle,
  activeId,
  onNavigate,
}: {
  node: DataRoomNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  activeId: string | null;
  onNavigate: () => void;
}) {
  const isFolder = node.kind === "folder";
  const isOpen = isFolder && expanded.has(node.id);
  const isActive = node.id === activeId;

  const label = (
    <span
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 truncate text-left",
        isActive ? "text-accent-secondary" : "text-content-secondary",
      )}
    >
      {node.kind === "document" ? (
        <FileText className="h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden />
      ) : node.kind === "folder" ? (
        isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden />
        )
      ) : (
        <File className="h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden />
      )}
      <span className="truncate">{node.name}</span>
    </span>
  );

  const rowClassName = cn(
    "group flex w-full items-center gap-1 py-1.5 pr-2 text-[13px] leading-5 transition-colors",
    isActive
      ? "bg-accent-secondary/10 text-accent-secondary"
      : "hover:bg-white/[0.04] hover:text-content-primary",
  );

  if (isFolder) {
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          aria-expanded={isOpen}
          className={cn(rowClassName, "pl-3")}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 text-content-tertiary transition-transform",
              isOpen && "rotate-90",
            )}
            aria-hidden
          />
          {label}
        </button>
        {isOpen && node.children.length > 0 && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                activeId={activeId}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={docHref(node.id)}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(rowClassName, "pl-3")}
      style={{ paddingLeft: `${10 + depth * 14}px` }}
    >
      {label}
    </Link>
  );
}

export function DataRoomShell({ tree, config, children }: DataRoomShellProps) {
  const pathname = usePathname();
  const activeId = useMemo(() => {
    const prefix = "/data-room/doc/";
    if (!pathname.startsWith(prefix)) return null;
    const rest = pathname.slice(prefix.length);
    const slash = rest.indexOf("/");
    return slash === -1 ? rest : rest.slice(0, slash);
  }, [pathname]);

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(collectFolderIds(tree)),
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery.length >= 2;

  const hits = useMemo(
    () =>
      searching
        ? collectSearchHits(tree, normalizedQuery, [], []).slice(0, 50)
        : [],
    [searching, tree, normalizedQuery],
  );

  // Honor ?open=<folderId> by scrolling to the node on first load.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const open = params.get("open");
    if (open) {
      setExpanded((previous) => new Set(previous).add(open));
      requestAnimationFrame(() => {
        document.getElementById(`dr-node-${open}`)?.scrollIntoView({ block: "nearest" });
      });
    }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleFolder = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const revealFolder = (id: string) => {
    const chain = ancestorFolderIds(tree, id);
    setExpanded((previous) => {
      const next = new Set(previous);
      for (const folderId of chain) next.add(folderId);
      return next;
    });
    setQuery("");
  };

  const banner = config.demo ? (
    <div className="flex items-start gap-2 border border-bg-border bg-black/30 px-4 py-3 text-xs leading-5 text-content-secondary">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-secondary" aria-hidden />
      <span>
        Demo mode: Google Drive is not configured. Set{" "}
        <code className="text-content-primary">DATA_ROOM_FOLDER_ID</code> and credentials to load
        your documents.
      </span>
    </div>
  ) : config.error ? (
    <div className="flex items-start gap-2 border border-bg-border bg-black/30 px-4 py-3 text-xs leading-5 text-additional-red-primary">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Could not load the data room: {config.error}</span>
    </div>
  ) : null;

  const sidebarContent = searching ? (
    <div>
      <div className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-content-tertiary">
        Results
      </div>
      {hits.length > 0 ? (
        <ul>
          {hits.map((hit) => (
            <li key={hit.id}>
              {hit.kind === "folder" ? (
                <button
                  type="button"
                  onClick={() => revealFolder(hit.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-content-secondary hover:bg-white/[0.04] hover:text-content-primary"
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden />
                  <span className="truncate">{hit.name}</span>
                </button>
              ) : (
                <Link
                  href={docHref(hit.id)}
                  className="flex items-center gap-2 px-3 py-2 text-[13px] text-content-secondary hover:bg-white/[0.04] hover:text-content-primary"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{hit.name}</span>
                  {hit.folderPath.length > 0 && (
                    <span className="shrink-0 truncate text-[10px] text-content-tertiary">
                      {hit.folderPath.join(" / ")}
                    </span>
                  )}
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-5 text-center text-xs text-content-secondary">
          No matching documents.
        </p>
      )}
    </div>
  ) : tree.length > 0 ? (
    <nav aria-label="Data room documents">
      {tree.map((node) => (
        <div key={node.id} id={`dr-node-${node.id}`}>
          <TreeNode
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggleFolder}
            activeId={activeId}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      ))}
    </nav>
  ) : (
    <p className="px-3 py-5 text-center text-xs text-content-secondary">
      This folder is empty.
    </p>
  );

  return (
    <div className="min-h-screen bg-bg-primary text-content-primary">
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-bg-border bg-bg-primary/95 backdrop-blur">
        <div className="flex h-full items-center gap-4 px-5 max-md:px-3">
          <Link href="/data-room" className="flex shrink-0 items-center gap-3" aria-label="Data room home">
            <ActaLogo className="h-7" />
            <span className="border-l border-bg-border pl-3 font-mono text-xs uppercase tracking-[0.12em] text-content-secondary max-sm:hidden">
              Data Room
            </span>
          </Link>

          <div className="relative ml-auto min-w-0 w-full max-w-xs">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the room"
              aria-label="Search the data room"
              className="h-9 w-full border border-bg-border bg-black/30 pl-9 pr-3 text-sm text-content-primary outline-none transition-colors placeholder:text-content-tertiary focus:border-accent-secondary"
            />
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label="Toggle data room navigation"
            className="flex h-9 w-9 shrink-0 items-center justify-center border border-bg-border text-content-secondary lg:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="pt-16">
        <aside className="fixed bottom-0 left-0 top-16 z-30 w-72 overflow-y-auto border-r border-bg-border bg-bg-primary max-lg:hidden">
          <div className="border-b border-bg-border px-5 py-4">
            <p className="truncate font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">
              {config.title}
            </p>
          </div>
          {banner}
          <div className="px-3 py-4">{sidebarContent}</div>
        </aside>

        {mobileOpen && (
          <>
            <button
              type="button"
              aria-label="Close data room navigation"
              className="fixed inset-0 top-16 z-20 bg-black/70 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="fixed bottom-0 left-0 top-16 z-30 w-[min(86vw,320px)] overflow-y-auto border-r border-bg-border bg-bg-primary lg:hidden">
              <div className="border-b border-bg-border px-5 py-4">
                <p className="truncate font-mono text-[11px] uppercase tracking-[0.12em] text-content-tertiary">
                  {config.title}
                </p>
              </div>
              {banner}
              <div className="px-3 py-4">{sidebarContent}</div>
            </aside>
          </>
        )}

        <main className="min-w-0 flex-1 pl-72 max-lg:pl-0">
          {banner && (
            <div className="lg:hidden">{banner}</div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
