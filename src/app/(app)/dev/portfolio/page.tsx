import { notFound } from "next/navigation";
import { PortfolioGallery } from "./gallery";

/** Review harness: every state of the portfolio page from fixtures, no wallet needed. Not served in production. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PortfolioGallery />;
}
