import { afterEach } from "vitest";
import { getQueryClient } from "@/lib/state/query-client";
import { forgetRestores } from "@/lib/state/restore-once";

// The data cache is one object per browser tab, which in a test file means one per file, and
// what the app remembers in the browser (choices, the last wallet, the address) outlives a
// component. All of it is emptied after each test, so nothing one test did is there for the next.
afterEach(() => {
  getQueryClient().clear();
  forgetRestores();
  if (typeof window === "undefined") return;
  window.localStorage.clear();
  window.sessionStorage.clear();
  if (window.location.search || window.location.hash) window.history.replaceState(null, "", window.location.pathname);
});
