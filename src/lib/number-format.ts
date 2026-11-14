const formatters = new Map<string, Intl.NumberFormat>();

/**
 * A reusable en-US number formatter for the given options.
 *
 * `n.toLocaleString("en-US", options)` builds a new formatter on every call, and building one is
 * the slow part: a page that formats a few dozen prices per render spends more time there than
 * anywhere else. The output is identical; the formatter is just built once per set of options.
 */
export function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", options);
    formatters.set(key, formatter);
  }
  return formatter;
}
