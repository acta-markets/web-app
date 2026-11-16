import type { Metadata } from "next";
import { NotFoundView, StatusFrame } from "@/components/site/status-view";

export const metadata: Metadata = { title: "Page not found" };

/** Any address the site does not have. Next marks it noindex itself. */
export default function NotFound() {
  return (
    <StatusFrame>
      <NotFoundView />
    </StatusFrame>
  );
}
