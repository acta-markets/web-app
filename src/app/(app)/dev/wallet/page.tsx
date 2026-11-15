import { notFound } from "next/navigation";
import { WalletGallery } from "./gallery";

/** Review harness: every state of the header wallet button and its panel, no wallet needed. Not served in production. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <WalletGallery />;
}
