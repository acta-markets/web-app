import { notFound } from "next/navigation";
import { StatesGallery } from "./gallery";

/**
 * Review harness: the not-found and error pages, which cannot be reached on demand.
 * `?missing=1` calls `notFound()` for real, to see the app's own not-found page in place.
 * Not served in production.
 */
export default function Page({ searchParams }: { searchParams: { missing?: string } }) {
  if (process.env.NODE_ENV === "production" || searchParams.missing) notFound();
  return <StatesGallery />;
}
