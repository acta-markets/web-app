/**
 * Which saved copies this page load has already asked the device for, so each is read once.
 * On its own, with no imports, so the test setup can empty it without loading the cache.
 */
export const restoring = new Map<string, Promise<void>>();

/** For tests: every restore may run again. */
export function forgetRestores(): void {
  restoring.clear();
}
