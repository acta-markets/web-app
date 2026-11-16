"use client";

import { useEffect } from "react";
import { BRAND_ACCENT, BRAND_BG, BRAND_FG } from "@/lib/brand";

/**
 * The last resort: the root layout itself broke, so nothing of the site's own (its styles,
 * its typefaces, its components) can be counted on. This page brings its own document and
 * plain inline styles, and says the same thing the app's error page says.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const text = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: "-0.02em" } as const;
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_BG, color: BRAND_FG, ...text }}>
        <main style={{ maxWidth: 540, padding: 24, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1.2, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ margin: "12px 0 0", fontSize: 16, lineHeight: 1.45, color: "#8A8A8A" }}>
            The site could not be shown. If you had just signed a trade, check Portfolio before trying again.
          </p>
          {error.digest ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#8A8A8A" }}>Reference {error.digest}</p> : null}
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 24, height: 40, padding: "0 20px", border: 0, background: BRAND_ACCENT, color: BRAND_BG, fontSize: 16, fontWeight: 500, cursor: "pointer", ...text }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
