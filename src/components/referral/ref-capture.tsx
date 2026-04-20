"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const raw = searchParams?.get("ref");
    if (!raw) return;

    const parsed = parseReferralCode(raw);
    if (parsed.ok) {
      writePendingRefCode(parsed.code);
    }

    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("ref");
    const query = next.toString();
    const url = query.length > 0 ? `${pathname}?${query}` : pathname ?? "/";
    router.replace(url, { scroll: false });
  }, [searchParams, pathname, router]);

  return null;
}
