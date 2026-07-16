
## Context

The calculator in `src/routes/index.tsx` already implements most of the PRD (three input modes, rate model, rate ladder, three retainer tiers, project estimator, FTE comparison, live updates, green/neutral palette, Inter + JetBrains Mono). This plan closes the remaining gaps against the PRD rather than rebuilding.

## Gaps vs. PRD

1. **Manual comp mode** collects a single total-comp number. PRD calls for **salary + bonus + equity** as separate fields.
2. **Rate model toggle** — PRD calls for an explicit **Simple / Advanced** switch. Today Utilization and Benefits Load are always visible; only Overhead and Margin are hidden behind an "Advanced Assumptions" disclosure. Advanced is also missing the **billable weeks/year** lever.
3. **Rate outputs** — Weekly is `daily × 5` and Monthly is `weekly × 4`, which quietly ignores the utilization assumption. PRD frames these as straightforward 5-day week and 4-week month rates, which is fine, but the labels should make clear they are gross billable-capacity rates, not expected revenue.
4. **Rate ranges, not a single number** — PRD don't: "never present a single magic number." Hourly/daily/weekly/monthly and project fee currently render as single values. Should render as a low–high band (e.g. ±10–15%).
5. **JD parsing** shows the inferred role/seniority only inside the baseline source string. Make the extracted signals (role guess, seniority, implied comp) explicit so the heuristic is legible.
6. **Print/Export** button uses `window.print()` with no print stylesheet, so output is messy. Either add a minimal print stylesheet or drop the button until real export exists (PRD doesn't require it).
7. **PRD.md** — leave as-is; user has approved it.

## Changes

### `src/routes/index.tsx`

- **Manual mode**: replace single `manualComp` with `salary`, `bonus`, `equity` inputs (all numeric, `$` prefix, mono font). Derived `manualComp = salary + bonus + equity`. Show the sum inline under the fields.
- **Rate model toggle**: add a `Simple | Advanced` segmented control above the levers.
  - Simple: hide all levers, use fixed defaults (utilization 0.7, benefits 0.25, overhead 0.15, margin 1.4, billable weeks 46). Show a compact read-only summary ("Utilization 70% · Overhead 15% · Margin 1.40× · 46 wks").
  - Advanced: show all five levers including a new **Billable Weeks / Year** lever (min 30, max 50, step 1).
  - Remove the existing "Advanced Assumptions" chevron disclosure; the mode toggle replaces it.
- **Rate math**: derive `annualBillableHours = billableWeeks × 40 × utilization` (replaces the fixed 2080). Compute a low/high band as `hourly × 0.9` and `hourly × 1.15`, rounded to $5. Apply the same band to daily/weekly/monthly and project fee.
- **Metric cells**: render each rate as a range ("$180 – $230"), keeping mono/tabular. Add a small "midpoint" caption.
- **Retainer cards**: keep midpoint headline price, add a smaller range line below it.
- **JD mode**: when `estimateFromJD` returns, render a small chip row above the baseline readout showing Role guess, Seniority, Implied comp — so the heuristic is visible.
- **Project estimator**: show fee as a range using the same band; keep the formula caption.
- **Methodology block**: update step 3 to reference billable weeks and the ±band; keep the same visual treatment.
- **Header**: remove the "Export Card" button (avoids broken `window.print()` output). Keep the nav links.

### Files touched
- `src/routes/index.tsx` — all changes above. Single file, no new components or routes.
- No other files change. No new dependencies. No backend.

## Out of scope
- Real JD parsing via AI (current heuristic stays).
- Persisting inputs, sharing links, PDF export.
- Additional retainer tiers or currencies beyond USD.
