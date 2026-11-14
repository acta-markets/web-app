import { describe, expect, it } from "vitest";
import { formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import { numberFormat } from "@/lib/number-format";
import { formatAmount, formatDate, formatExpiryDay, formatExpiryUtc, formatPrice, formatShortDate, formatUsdAmount } from "@/lib/trade/format";

const NUMBERS = [0, 0.00001234, 0.0017, 0.012345, 0.5, 0.99, 1, 1.005, 9.995, 12.3456, 99.5, 100, 103, 999.99, 1000, 1234.5678, 66500, 68249.345, 1234567.891, -42.5];
const usd = (n: number, o: Intl.NumberFormatOptions) => n.toLocaleString("en-US", { style: "currency", currency: "USD", ...o });

describe("cached formatters", () => {
  it("reuses one formatter per set of options", () => {
    expect(numberFormat({ maximumFractionDigits: 2 })).toBe(numberFormat({ maximumFractionDigits: 2 }));
    expect(numberFormat({ maximumFractionDigits: 2 })).not.toBe(numberFormat({ maximumFractionDigits: 3 }));
  });

  it("prints exactly what toLocaleString printed, for every number format the app uses", () => {
    for (const n of NUMBERS) {
      const abs = Math.abs(n);
      expect(formatUsdAmount(n)).toBe(n > 0 && n < 0.01 ? "<$0.01" : usd(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      expect(formatStrikePrice(n)).toBe(usd(n, { minimumFractionDigits: 0, maximumFractionDigits: 9 }));
      expect(formatPrice(n)).toBe(
        usd(n, { minimumFractionDigits: abs >= 1 && abs < 1000 ? 2 : 0, maximumFractionDigits: abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8 }),
      );
      expect(formatUsdSmart(n)).toBe(
        abs >= 1000
          ? usd(n, { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true })
          : abs >= 100
            ? usd(n, { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: false })
            : usd(n, {
                maximumFractionDigits: abs >= 1 ? 2 : abs >= 0.1 ? 4 : abs >= 0.01 ? 5 : abs >= 0.001 ? 6 : 8,
                minimumFractionDigits: abs >= 1 ? 2 : 0,
                useGrouping: false,
              }),
      );
      for (const d of [0, 2, 4, 6]) expect(formatAmount(n, d)).toBe(n.toLocaleString("en-US", { maximumFractionDigits: d }));
    }
  });

  it("prints exactly what toLocaleDateString printed", () => {
    for (const ms of [Date.UTC(2026, 10, 20, 8), Date.UTC(2026, 0, 1, 0), Date.UTC(2026, 11, 31, 23, 59), Date.UTC(2027, 1, 7, 19, 30)]) {
      const d = new Date(ms);
      expect(formatExpiryDay(ms)).toBe(d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }));
      expect(formatExpiryUtc(ms)).toBe(
        `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`,
      );
      expect(formatDate(d)).toBe(d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }));
      expect(formatShortDate(d)).toBe(d.toLocaleDateString("en-US", { month: "short", day: "2-digit" }));
    }
  });
});
