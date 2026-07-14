# Equator — Fractional Consulting Rate Calculator
## Product Requirements Document

### Goal
Help new consultants turn a full-time job description or compensation number into defensible fractional consulting rates. The app bridges the gap between "what this role pays as an employee" and "what to charge as an independent advisor."

### Target User
- New or transitioning consultants (0–3 years independent)
- Former operators, executives, or specialists moving into fractional/advisory work
- Users who understand their target FTE salary but are unsure how to convert it into hourly, daily, retainer, or project pricing

### Core Features

1. **Three Input Modes**
   - **Job title + location**: Pick a baseline role and market; app suggests a median total-comp estimate.
   - **Paste a job description**: Extract role level, scope, and implied salary using heuristics.
   - **Manual comp**: Enter salary + bonus + equity directly.

2. **Rate Model Toggle**
   - **Simple**: Fixed assumptions for utilization, overhead, benefits load, and target margin.
   - **Advanced**: Editable levers for utilization %, overhead %, benefits load %, billable weeks/year, and target profit margin.

3. **Rate Outputs**
   - Hourly rate
   - Daily rate (8 hr day)
   - Weekly rate (5-day week)
   - Monthly rate (4-week month)

4. **Fractional Package Pricing**
   - Three pre-built retainer tiers (e.g., Advisory, Partner, Interim) with hours/day commitments and recommended monthly fees.

5. **Project-Based Estimate**
   - Enter estimated hours or days; app returns a project fee range with a confidence buffer.

6. **FTE Cost Comparison**
   - Side-by-side view of the equivalent FTE total comp vs. the consultant's annualized revenue at the calculated rate.

### Look & Feel
- **Professional density dashboard**: information-rich but not cluttered.
- **Color palette**: Clean, trustworthy neutrals with a single brand green for emphasis and primary actions.
- **Typography**: Inter for UI text and headings; JetBrains Mono for numbers and rate outputs.
- **Layout**: Single-page app with a clear input panel on one side and a live-updating results dashboard on the other. Results are organized into cards: rate ladder, fractional packages, project estimator, and FTE comparison.
- **Interaction model**: Every slider, input, or toggle updates the outputs in real time. No submit button required.

### Don'ts
- Don't require account creation to use the calculator.
- Don't store user data on a backend unless explicitly requested later.
- Don't use generic "AI aesthetic" gradients or purple/indigo palettes.
- Don't hide assumptions behind a wall of text — advanced levers should be discoverable but not overwhelming.
- Don't present a single "magic number"; always show a range or a set of package options.
- Don't use tables as visual dividers or rely on placeholder content.
- Don't build multi-step wizards that block the user from seeing results immediately.
