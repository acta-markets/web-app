"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { parseReferralCode } from "@/lib/rfq-client";

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
    // ignore storage errors
  }
}

function writePendingRefCode(code: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignore storage errors
  }
}

export function RefCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const raw = searchParams?.get("ref");
    if (!raw) return;
    const parsed = parseReferralCode(raw);
    if (parsed.ok) writePendingRefCode(parsed.code);
  }, [searchParams]);

  return null;
}
