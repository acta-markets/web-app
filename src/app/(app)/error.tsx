"use client";

import { ErrorView } from "@/components/site/status-view";

/** A page of the app that broke while showing. The app's header and the wallet stay as they are. */
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} />;
}
