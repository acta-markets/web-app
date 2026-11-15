"use client";

import * as React from "react";

const NARROW_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True below 768px, the width under which a table gives way to stacked rows. One layout is
 * rendered, never both hidden-and-shown copies, so a screen reader and a test see each row
 * once. False on the server and until the first paint.
 */
export function useIsNarrow(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}
