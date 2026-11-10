import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { DataRoomDoc } from "@/lib/data-room/types";

function formatModified(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DataRoomDocView({ doc }: { doc: DataRoomDoc }) {
  const crumbs = doc.breadcrumbs;
  const parent = crumbs[crumbs.length - 1];
  const backHref =
    parent && parent.kind === "folder" ? `/data-room?open=${parent.id}` : "/data-room";

  return (
    <div className="mx-auto w-full max-w-[920px] px-8 py-10 max-md:px-5 max-md:py-7">
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-content-tertiary"
      >
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const href = crumb.kind === "root" ? "/data-room" : `/data-room?open=${crumb.id}`;
          return (
            <span key={`${crumb.kind}-${crumb.id}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <span aria-hidden>/</span>}
              {isLast ? (
                <span className="text-content-secondary">{crumb.name}</span>
              ) : (
                <Link
                  href={href}
                  className="text-content-tertiary transition-colors hover:text-accent-secondary"
                >
                  {crumb.name}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      <Link
        href={backHref}
        className="mb-7 inline-flex items-center gap-2 font-mono text-xs text-content-secondary transition-colors hover:text-content-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to documents
      </Link>

      <header className="mb-8 border-b border-bg-border pb-6">
        <h1 className="font-space text-4xl font-semibold leading-tight tracking-tight text-content-primary max-md:text-3xl">
          {doc.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-content-tertiary">
          {formatModified(doc.modifiedTime) && (
            <span>Updated {formatModified(doc.modifiedTime)}</span>
          )}
          {doc.webViewLink && (
            <a
              href={doc.webViewLink}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-content-secondary transition-colors hover:text-accent-secondary"
            >
              Open in Drive
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      </header>

      {doc.kind === "other" ? (
        <div className="border border-bg-border bg-black/20 px-5 py-6 text-sm leading-6 text-content-secondary">
          <p>{doc.notice ?? "This file can't be previewed here."}</p>
          {doc.webViewLink && (
            <a
              href={doc.webViewLink}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-flex items-center gap-1 text-accent-secondary transition-colors hover:text-content-primary"
            >
              Open in Drive
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>
      ) : (
        <article className="dataroom-prose" dangerouslySetInnerHTML={{ __html: doc.html }} />
      )}
    </div>
  );
}
