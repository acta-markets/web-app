import { notFound } from "next/navigation";
import { SignInGallery } from "./gallery";

/** Review harness: every state of the sign-in modal, which otherwise needs a wallet to reach. Not served in production. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SignInGallery />;
}
