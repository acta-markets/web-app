/**
 * Whether the app's own routes (Trade, Earn, Portfolio) are served. Off means landing-only:
 * app routes redirect to the landing page. Read at call time, so a test can switch it.
 */
export function isAppEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_APP_ENABLED;
  if (!value) return true;
  return !(value === "false" || value === "0");
}

/** Where the app opens: the page the site root sends a person to while the app is on, and the page an installed copy starts on. */
export const APP_HOME = "/trade";
