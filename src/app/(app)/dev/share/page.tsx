import { notFound } from "next/navigation";
import { ShareGallery } from "./gallery";

/** Review harness: every share card as it is drawn, with its buttons. Not served in production. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ShareGallery />;
}
