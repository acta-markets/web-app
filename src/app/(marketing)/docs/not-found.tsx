import Link from "next/link";

/**
 * A guide page that does not exist, shown inside the guide. Its way back is the guide's own
 * first page: on the docs host the app's pages are not served, so a link to Trade would lead
 * nowhere from here.
 */
export default function DocsNotFound() {
  return (
    <article className="docs-prose">
      <h1>Page not found</h1>
      <p>This page is not in the guide. It may have been renamed or removed.</p>
      <p>
        <Link href="/docs">Back to the start of the guide</Link>
      </p>
    </article>
  );
}
