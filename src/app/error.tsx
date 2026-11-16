"use client";

import { ErrorView, StatusFrame } from "@/components/site/status-view";

/** A page outside the app's routes that broke while showing. */
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusFrame>
      <ErrorView {...props} />
    </StatusFrame>
  );
}
