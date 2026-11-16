import { notFound } from "next/navigation";
import { RewardsGallery } from "./gallery";

/** Review harness: every state of the Rewards page from a sample season, no wallet or backend needed. Not served in production. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RewardsGallery />;
}
