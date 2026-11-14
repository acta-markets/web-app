import { notFound } from "next/navigation";
import { QuoteFlowGallery } from "./gallery";

/** Review harness: every state of the order modal side by side. Not served in production. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <QuoteFlowGallery />;
}
