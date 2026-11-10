# Backend asks: portfolio P&L

One hard blocker, plus a couple of optional ones. The hard blocker is the only thing
standing between the portfolio screen and a real unrealised P&L column.

---

## 1. HARD BLOCKER — a mark price per open position

**What we need:** the current fair/mark value of an open option position, per unit,
in the same 1e9-scaled integer form as the existing `price` on `PositionInfo`.

**Shape:**

```
PositionInfo.mark_price_1e9 : number | null   // per-unit option mark, 1e9-scaled
PositionInfo.mark_ts        : number | null   // when the mark was computed (ms epoch)
```

Or equivalent: a `GetPositionMark` call returning `{ markPrice1e9, markTs }` per
position. Either works; the field on the position record is simpler to consume.

**Why:** unrealised P&L is `(mark - entry_premium) * quantity`, adjusted for side.
We cannot compute it from spot alone — the frontend has no volatility surface to
reprice an option, and substituting intrinsic value (spot vs strike) would ignore
all time value and misprice anything near the money. Right now that column shows
"—" rather than a fabricated number.

**Staleness matters:** options decay, so a mark without a timestamp is dangerous.
We need `mark_ts` to show or suppress a stale mark.

**Definition questions to pin down:**
- Is the mark mid, maker best, or a model value? (Any is usable; we need to know which.)
- Is it before or after any fees?
- Does it exist for cash-settled products (spreads / cash-put) as well as physical?

---

## 2. OPTIONAL — greeks per position

`PositionInfo.delta`, `.theta` (and gamma/vega if cheap).

**Why:** lets the portfolio show where the risk actually is (net delta, daily decay)
rather than just headline P&L. Nice for a DeFi-grade portfolio screen, not required
for a correct one.

---

## 3. OPTIONAL — aggregate portfolio valuation

A single endpoint returning total position value / total P&L for the account.

**Why:** so we do not have to fan out over N positions and sum client-side. Purely
a performance convenience — derivable from (1), so skip it if it is extra work.

---

## Already confirmed available (no action needed)

- `side`, `terms` (strike / lower / upper), `quantity`, `price`, `total_premium`
- `created_at`, `expiry_ts`
- settled positions: `settlement_price`, `holder_payoff`, `writer_return`, `is_otm`,
  `not_exercised`, settlement kind (physical / cash)

Realised P&L is fully computable from those today.
