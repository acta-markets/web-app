"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "acta_ref_pending";

export function readPendingRefCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingRefCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
}

function writePendingRefCode(code: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
  }
}

export function RefCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const raw = searchParams?.get("ref");
    if (!raw) return;
    // The SDK is heavy and this runs on every page, including the landing.
    void import("@/lib/rfq-client").then(({ parseReferralCode }) => {
      const parsed = parseReferralCode(raw);
      if (parsed.ok) writePendingRefCode(parsed.code);
    });
  }, [searchParams]);

  return null;
}
