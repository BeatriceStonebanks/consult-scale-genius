import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  component: Calculator,
});

// ---------- Reference data ----------

type LocationTier = "sf" | "nyc" | "tier2" | "remote";

const LOCATION_LABELS: Record<LocationTier, string> = {
  sf: "San Francisco (Tier 1)",
  nyc: "New York (Tier 1)",
  tier2: "Austin / Chicago (Tier 2)",
  remote: "Remote (Tier 3)",
};

const LOCATION_MULT: Record<LocationTier, number> = {
  sf: 1.15,
  nyc: 1.12,
  tier2: 0.95,
  remote: 0.85,
};

// Approximate base FTE total comp for common fractional roles (SF baseline, USD).
// These are ballpark medians used to seed the calculator, not authoritative benchmarks.
const ROLE_BASELINE: { title: string; baseComp: number; keywords: string[] }[] = [
  { title: "VP Marketing", baseComp: 260000, keywords: ["vp marketing", "vice president marketing", "head of marketing", "cmo"] },
  { title: "VP Product", baseComp: 280000, keywords: ["vp product", "head of product", "cpo"] },
  { title: "VP Engineering", baseComp: 310000, keywords: ["vp engineering", "vp eng", "head of engineering", "cto"] },
  { title: "VP Sales", baseComp: 270000, keywords: ["vp sales", "head of sales", "cro"] },
  { title: "VP Finance / CFO", baseComp: 260000, keywords: ["cfo", "vp finance", "head of finance"] },
  { title: "VP People / CHRO", baseComp: 230000, keywords: ["chro", "vp people", "head of people", "head of hr"] },
  { title: "Director of Marketing", baseComp: 190000, keywords: ["director of marketing", "marketing director"] },
  { title: "Director of Product", baseComp: 210000, keywords: ["director of product", "product director"] },
  { title: "Director of Engineering", baseComp: 240000, keywords: ["director of engineering", "engineering director"] },
  { title: "Director of Operations", baseComp: 180000, keywords: ["director of operations", "head of ops", "coo"] },
  { title: "Senior Designer", baseComp: 170000, keywords: ["senior designer", "staff designer", "principal designer"] },
  { title: "Staff Engineer", baseComp: 240000, keywords: ["staff engineer", "principal engineer"] },
  { title: "Senior Manager", baseComp: 160000, keywords: ["senior manager", "sr manager"] },
];

const SENIORITY_MULT: { keywords: string[]; mult: number; label: string }[] = [
  { keywords: ["chief", "cxo", "cmo", "cpo", "cto", "cro", "cfo", "coo", "chro"], mult: 1.15, label: "C-suite" },
  { keywords: ["vp", "vice president", "head of"], mult: 1.0, label: "VP / Head of" },
  { keywords: ["director"], mult: 0.78, label: "Director" },
  { keywords: ["principal", "staff", "lead", "senior manager"], mult: 0.72, label: "Principal / Staff" },
  { keywords: ["senior", "sr."], mult: 0.6, label: "Senior IC" },
  { keywords: ["manager"], mult: 0.58, label: "Manager" },
];

function estimateFromJD(text: string): { comp: number; roleGuess: string; seniority: string } | null {
  const t = text.toLowerCase();
  if (t.trim().length < 40) return null;

  // Find best role match
  let best: { title: string; baseComp: number; hits: number } | null = null;
  for (const r of ROLE_BASELINE) {
    const hits = r.keywords.reduce((n, k) => (t.includes(k) ? n + 1 : n), 0);
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { title: r.title, baseComp: r.baseComp, hits };
    }
  }

  // Seniority multiplier (first match wins in priority order)
  let seniority = { mult: 0.75, label: "Manager" };
  for (const s of SENIORITY_MULT) {
    if (s.keywords.some((k) => t.includes(k))) {
      seniority = { mult: s.mult, label: s.label };
      break;
    }
  }

  const baseComp = best?.baseComp ?? 180000;
  const comp = Math.round((baseComp * seniority.mult) / 1000) * 1000;

  return {
    comp,
    roleGuess: best?.title ?? "Generalist Leader",
    seniority: seniority.label,
  };
}

// ---------- Formatting ----------

const fmtUSD = (n: number, digits = 0) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

// ---------- Component ----------

type InputMode = "title" | "jd" | "manual";

function Calculator() {
  const [mode, setMode] = useState<InputMode>("title");

  // Title-lookup inputs
  const [role, setRole] = useState<string>("VP Marketing");
  const [location, setLocation] = useState<LocationTier>("sf");

  // Manual comp
  const [manualComp, setManualComp] = useState<number>(220000);

  // JD paste
  const [jdText, setJdText] = useState<string>("");

  // Advanced levers
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [utilization, setUtilization] = useState(0.7); // % of year billable
  const [benefitsLoad, setBenefitsLoad] = useState(0.25); // FTE benefits & taxes
  const [overhead, setOverhead] = useState(0.15); // consultant biz overhead
  const [margin, setMargin] = useState(1.4); // profit / risk multiplier

  // Project estimator
  const [projectHours, setProjectHours] = useState<number>(40);
  const [riskBuffer, setRiskBuffer] = useState<number>(0.15);

  // ---------- Derived FTE baseline ----------
  const baseline = useMemo(() => {
    if (mode === "title") {
      const match = ROLE_BASELINE.find(
        (r) => r.title.toLowerCase() === role.trim().toLowerCase(),
      );
      const base = match?.baseComp ?? 180000;
      const comp = Math.round((base * LOCATION_MULT[location]) / 1000) * 1000;
      return { comp, source: `${match?.title ?? role} · ${LOCATION_LABELS[location]}` };
    }
    if (mode === "manual") {
      return { comp: manualComp || 0, source: "Manual total comp" };
    }
    // jd
    const est = estimateFromJD(jdText);
    if (!est) return { comp: 0, source: "Paste a job description to estimate" };
    return {
      comp: Math.round((est.comp * LOCATION_MULT[location]) / 1000) * 1000,
      source: `${est.roleGuess} · ${est.seniority} · ${LOCATION_LABELS[location]}`,
    };
  }, [mode, role, location, manualComp, jdText]);

  // ---------- Rate math ----------
  const rates = useMemo(() => {
    const comp = baseline.comp;
    // Effective annual "cost" the consultant needs to cover (FTE loaded)
    const loadedAnnual = comp * (1 + benefitsLoad);
    // Billable capacity
    const annualBillableHours = 2080 * utilization;
    // Consultant target revenue = loaded FTE * margin * (1 + overhead)
    const targetRevenue = loadedAnnual * margin * (1 + overhead);
    const hourly = annualBillableHours > 0 ? targetRevenue / annualBillableHours : 0;
    // Round hourly to nearest $5 for a clean rate card
    const hourlyRounded = Math.round(hourly / 5) * 5;
    const daily = hourlyRounded * 8;
    const weekly = daily * 5;
    const monthly = weekly * 4;

    // Fractional package pricing (small volume discount)
    const oneDay = Math.round((daily * 4 * 0.95) / 100) * 100; // 4 days/mo, -5%
    const twoDay = Math.round((daily * 8 * 0.9) / 100) * 100; // 8 days/mo, -10%
    const halfFte = Math.round((daily * 10 * 0.85) / 100) * 100; // 10 days/mo, -15%

    // FTE loaded cost for client (salary + benefits + overhead)
    const fteLoadedAnnual = comp * (1 + benefitsLoad + 0.08); // +8% office/IT
    const fteLoadedMonthly = fteLoadedAnnual / 12;

    return {
      hourly: hourlyRounded,
      daily,
      weekly,
      monthly,
      oneDay,
      twoDay,
      halfFte,
      loadedAnnual,
      fteLoadedAnnual,
      fteLoadedMonthly,
    };
  }, [baseline.comp, benefitsLoad, utilization, margin, overhead]);

  // Project estimate
  const projectFee = useMemo(() => {
    const raw = rates.hourly * projectHours * (1 + riskBuffer);
    return Math.round(raw / 50) * 50;
  }, [rates.hourly, projectHours, riskBuffer]);

  // FTE savings for a 2-day/week partner engagement
  const partnerAnnual = rates.twoDay * 12;
  const savingsPct = rates.fteLoadedAnnual
    ? Math.round((1 - partnerAnnual / rates.fteLoadedAnnual) * 100)
    : 0;

  const hasBaseline = baseline.comp > 0;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 selection:bg-brand/10">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-950/5 bg-zinc-50/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-sm bg-brand">
              <div className="size-2 rounded-full bg-zinc-50" />
            </div>
            <span className="text-sm font-medium tracking-tight">Equator</span>
          </div>
          <div className="flex items-center gap-6">
            <nav className="hidden items-center gap-4 md:flex">
              <a href="#calculator" className="text-sm text-zinc-500 transition-colors hover:text-zinc-900">
                Calculator
              </a>
              <a href="#methodology" className="text-sm text-zinc-500 transition-colors hover:text-zinc-900">
                Methodology
              </a>
            </nav>
            <button
              onClick={() => window.print()}
              className="flex items-center rounded-md bg-brand py-2 pl-2 pr-3 text-sm font-medium text-zinc-50 ring-1 ring-brand transition hover:opacity-90"
            >
              <svg className="mr-1.5 size-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export Card
            </button>
          </div>
        </div>
      </header>

      <main id="calculator" className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-12 items-start gap-10">
          {/* ---------- Left: Inputs ---------- */}
          <aside className="col-span-12 space-y-8 lg:col-span-4">
            <section>
              <h1 className="mb-2 text-balance text-xl font-semibold tracking-tight">
                Rate Calibration
              </h1>
              <p className="max-w-[48ch] text-pretty text-sm text-zinc-500">
                Input your professional baseline to generate defensible fractional pricing models.
              </p>
            </section>

            <div className="space-y-6">
              {/* Input Tabs */}
              <div
                role="tablist"
                aria-label="Baseline input mode"
                className="flex rounded-xl bg-zinc-100/50 p-1 ring-1 ring-black/5"
              >
                {(
                  [
                    { id: "title", label: "Job Title" },
                    { id: "jd", label: "Paste JD" },
                    { id: "manual", label: "Manual Comp" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={mode === t.id}
                    onClick={() => setMode(t.id)}
                    className={
                      "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors " +
                      (mode === t.id
                        ? "bg-zinc-50 text-zinc-900 shadow-sm ring-1 ring-black/5"
                        : "text-zinc-500 hover:text-zinc-900")
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Fields per mode */}
              {mode === "title" && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                      Target Role
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full rounded-lg bg-zinc-50 px-3 py-2 text-sm outline-hidden ring-1 ring-black/10 focus:ring-2 focus:ring-brand"
                    >
                      {ROLE_BASELINE.map((r) => (
                        <option key={r.title} value={r.title}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                      Location Tier
                    </label>
                    <select
                      value={location}
                      onChange={(e) => setLocation(e.target.value as LocationTier)}
                      className="w-full rounded-lg bg-zinc-50 px-3 py-2 text-sm outline-hidden ring-1 ring-black/10 focus:ring-2 focus:ring-brand"
                    >
                      {(Object.keys(LOCATION_LABELS) as LocationTier[]).map((k) => (
                        <option key={k} value={k}>
                          {LOCATION_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {mode === "jd" && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                      Paste the full job description
                    </label>
                    <textarea
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                      rows={8}
                      placeholder="Paste a job description here. We'll infer seniority and role to estimate an FTE baseline."
                      className="w-full rounded-lg bg-zinc-50 px-3 py-2 text-sm leading-relaxed outline-hidden ring-1 ring-black/10 focus:ring-2 focus:ring-brand"
                    />
                    <p className="mt-1.5 text-[11px] text-zinc-400">
                      Heuristic estimate from title, seniority keywords, and location.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                      Location Tier
                    </label>
                    <select
                      value={location}
                      onChange={(e) => setLocation(e.target.value as LocationTier)}
                      className="w-full rounded-lg bg-zinc-50 px-3 py-2 text-sm outline-hidden ring-1 ring-black/10 focus:ring-2 focus:ring-brand"
                    >
                      {(Object.keys(LOCATION_LABELS) as LocationTier[]).map((k) => (
                        <option key={k} value={k}>
                          {LOCATION_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {mode === "manual" && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                      Total FTE Comp (Base + Bonus + Equity)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                        $
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={manualComp}
                        onChange={(e) => setManualComp(Number(e.target.value) || 0)}
                        className="w-full rounded-lg bg-zinc-50 py-2 pl-7 pr-3 font-mono text-sm outline-hidden ring-1 ring-black/10 focus:ring-2 focus:ring-brand"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-400">
                      Enter the annualized total comp for the equivalent FTE role.
                    </p>
                  </div>
                </div>
              )}

              {/* Baseline readout */}
              <div className="rounded-lg bg-brand-light/60 p-3 ring-1 ring-brand/10">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-brand">
                  FTE Baseline
                </div>
                <div className="mt-1 font-mono text-lg font-medium tabular-nums">
                  {hasBaseline ? fmtUSD(baseline.comp) : "—"}
                </div>
                <div className="text-[11px] text-zinc-500">{baseline.source}</div>
              </div>

              {/* Advanced */}
              <div className="border-t border-zinc-950/5 pt-4">
                <button
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="mb-4 flex w-full items-center justify-between text-left"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Advanced Assumptions
                  </span>
                  <svg
                    className={
                      "size-4 text-zinc-400 transition-transform " +
                      (advancedOpen ? "rotate-180" : "")
                    }
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                <div className="space-y-4">
                  <Lever
                    label="Utilization Rate"
                    value={utilization}
                    onChange={setUtilization}
                    min={0.3}
                    max={0.9}
                    step={0.05}
                    format={(v) => `${Math.round(v * 100)}%`}
                    active
                  />
                  <Lever
                    label="Benefits & Taxes Load"
                    value={benefitsLoad}
                    onChange={setBenefitsLoad}
                    min={0.1}
                    max={0.5}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                    active
                  />
                  {advancedOpen && (
                    <>
                      <Lever
                        label="Business Overhead"
                        value={overhead}
                        onChange={setOverhead}
                        min={0}
                        max={0.4}
                        step={0.01}
                        format={(v) => `${Math.round(v * 100)}%`}
                        active
                      />
                      <Lever
                        label="Margin Multiplier"
                        value={margin}
                        onChange={setMargin}
                        min={1.0}
                        max={2.5}
                        step={0.05}
                        format={(v) => `${v.toFixed(2)}×`}
                        active
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          </aside>

          {/* ---------- Right: Dashboard ---------- */}
          <div className="col-span-12 space-y-8 lg:col-span-8">
            {/* Hero Metrics */}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-zinc-950/5 ring-1 ring-zinc-950/5 lg:grid-cols-4">
              <MetricCell label="Hourly Rate" value={hasBaseline ? fmtUSD(rates.hourly) : "—"} />
              <MetricCell label="Day Rate" value={hasBaseline ? fmtUSD(rates.daily) : "—"} />
              <MetricCell label="Weekly" value={hasBaseline ? fmtUSD(rates.weekly) : "—"} />
              <MetricCell label="Monthly" value={hasBaseline ? fmtUSD(rates.monthly) : "—"} />
            </div>

            {/* Fractional Packages */}
            <div>
              <h2 className="mb-4 text-sm font-semibold text-zinc-900">Fractional Retainers</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <PackageCard
                  tier="Advisory"
                  cadence="1 Day/Wk"
                  price={hasBaseline ? fmtUSD(rates.oneDay) : "—"}
                  copy="Strategy sessions, unblocking teams, and periodic reviews."
                />
                <PackageCard
                  tier="Partner"
                  cadence="2 Days/Wk"
                  price={hasBaseline ? fmtUSD(rates.twoDay) : "—"}
                  copy="Embedded leadership, hands-on execution, and direct reports."
                  featured
                />
                <PackageCard
                  tier="Interim"
                  cadence="0.5 FTE"
                  price={hasBaseline ? fmtUSD(rates.halfFte) : "—"}
                  copy="Full ownership of the function during a leadership gap."
                />
              </div>
            </div>

            {/* Comparison + Project Estimator */}
            <div className="grid grid-cols-1 gap-8 border-t border-zinc-950/5 pt-8 md:grid-cols-2">
              <section>
                <h3 className="mb-4 text-sm font-semibold text-zinc-900">FTE Comparison</h3>
                <div className="space-y-3">
                  <div className="flex items-end justify-between border-b border-zinc-950/5 pb-3">
                    <span className="text-sm text-zinc-500">Annual Loaded Cost</span>
                    <div className="text-right">
                      <span className="block text-xs text-zinc-400 line-through">
                        {hasBaseline ? fmtUSD(baseline.comp) : "—"}
                      </span>
                      <span className="font-mono text-sm font-medium tabular-nums">
                        {hasBaseline ? fmtUSD(rates.fteLoadedAnnual) : "—"}
                      </span>
                    </div>
                  </div>
                  <Row label="Monthly Loaded (FTE)" value={hasBaseline ? fmtUSD(rates.fteLoadedMonthly) : "—"} />
                  <Row
                    label="Your 2-Day Partner (annualized)"
                    value={hasBaseline ? fmtUSD(partnerAnnual) : "—"}
                  />
                  <div className="-mx-2 flex justify-between rounded bg-brand-light/60 px-2 py-1">
                    <span className="text-sm font-medium text-brand">Client Savings vs FTE</span>
                    <span className="font-mono text-sm font-medium text-brand tabular-nums">
                      {hasBaseline ? `${savingsPct}%` : "—"}
                    </span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-4 text-sm font-semibold text-zinc-900">Project Estimator</h3>
                <div className="rounded-xl bg-zinc-100/50 p-4">
                  <div className="mb-4 flex gap-4">
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">
                        Est. Hours
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={projectHours}
                        onChange={(e) => setProjectHours(Number(e.target.value) || 0)}
                        className="w-full rounded-lg bg-zinc-50 px-3 py-1.5 font-mono text-sm outline-hidden ring-1 ring-black/10 focus:ring-2 focus:ring-brand"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">
                        Risk Buffer
                      </label>
                      <select
                        value={riskBuffer}
                        onChange={(e) => setRiskBuffer(Number(e.target.value))}
                        className="w-full rounded-lg bg-zinc-50 px-3 py-1.5 text-sm outline-hidden ring-1 ring-black/10 focus:ring-2 focus:ring-brand"
                      >
                        <option value={0}>0%</option>
                        <option value={0.1}>10%</option>
                        <option value={0.15}>15%</option>
                        <option value={0.2}>20%</option>
                        <option value={0.3}>30%</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Project Fee</span>
                    <span className="font-mono text-xl font-semibold tracking-tight tabular-nums">
                      {hasBaseline ? fmtUSD(projectFee) : "—"}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    {projectHours} hrs × {fmtUSD(rates.hourly)} × {Math.round((1 + riskBuffer) * 100)}%
                  </p>
                </div>
              </section>
            </div>

            {/* Methodology */}
            <section
              id="methodology"
              className="rounded-2xl bg-zinc-100/60 p-6 ring-1 ring-black/5"
            >
              <h3 className="mb-3 text-sm font-semibold text-zinc-900">How this is calculated</h3>
              <ol className="grid grid-cols-1 gap-3 text-xs text-zinc-600 md:grid-cols-2">
                <li>
                  <span className="font-mono text-brand">01.</span> FTE baseline × ({Math.round(benefitsLoad * 100)}% benefits & taxes) = loaded annual cost.
                </li>
                <li>
                  <span className="font-mono text-brand">02.</span> Loaded cost × {margin.toFixed(2)}× margin × (1 + {Math.round(overhead * 100)}% overhead) = annual target revenue.
                </li>
                <li>
                  <span className="font-mono text-brand">03.</span> Target revenue ÷ ({Math.round(utilization * 100)}% × 2,080 hrs) = hourly rate, rounded to $5.
                </li>
                <li>
                  <span className="font-mono text-brand">04.</span> Retainers apply volume discounts (5–15%) to reward committed cadence.
                </li>
              </ol>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mx-auto max-w-7xl border-t border-zinc-950/5 px-6 py-12">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-1">
            <p className="text-xs text-zinc-500">
              Directional guidance for new fractional consultants. Ballpark benchmarks, not authoritative market data.
            </p>
            <p className="text-xs text-zinc-400">
              Figures include self-employment tax adjustments and overhead multipliers.
            </p>
          </div>
          <div className="flex gap-8">
            <div>
              <span className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">
                Baseline
              </span>
              <span className="font-mono text-sm font-medium tabular-nums">
                {hasBaseline ? fmtUSD(baseline.comp) : "—"}
              </span>
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-bold uppercase text-zinc-400">
                Blended Rate
              </span>
              <span className="font-mono text-sm font-medium tabular-nums">
                {hasBaseline ? `${fmtUSD(rates.hourly)}/hr` : "—"}
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------- Small building blocks ----------

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 p-6">
      <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>
      <span className="font-mono text-3xl font-medium tracking-tight tabular-nums">
        {value}
      </span>
    </div>
  );
}

function PackageCard({
  tier,
  cadence,
  price,
  copy,
  featured,
}: {
  tier: string;
  cadence: string;
  price: string;
  copy: string;
  featured?: boolean;
}) {
  return (
    <div
      className={
        "flex h-48 flex-col justify-between rounded-xl p-5 " +
        (featured
          ? "bg-brand text-zinc-50 shadow-lg ring-1 ring-brand"
          : "bg-zinc-50 ring-1 ring-black/5")
      }
    >
      <div>
        <div className="flex items-start justify-between">
          <span
            className={
              "text-xs font-bold uppercase tracking-widest " +
              (featured ? "text-brand-light" : "text-brand")
            }
          >
            {tier}
          </span>
          <span
            className={
              "text-xs " + (featured ? "text-brand-light/70" : "text-zinc-400")
            }
          >
            {cadence}
          </span>
        </div>
        <div className="mt-4">
          <span className="font-mono text-2xl font-medium tabular-nums">{price}</span>
          <span
            className={
              "text-xs " + (featured ? "text-brand-light/70" : "text-zinc-500")
            }
          >
            {" "}
            /month
          </span>
        </div>
      </div>
      <p
        className={
          "text-pretty text-xs leading-relaxed " +
          (featured ? "text-brand-light/80" : "text-zinc-500")
        }
      >
        {copy}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

function Lever({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  active,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  active?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <label className="text-xs text-zinc-500">{label}</label>
        <span className="font-mono text-xs font-medium tabular-nums">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="peer sr-only"
      />
      <div className="h-1 rounded-full bg-zinc-200">
        <div
          className={"h-full rounded-full " + (active ? "bg-brand" : "bg-zinc-400")}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 block w-full accent-[color:var(--color-brand)]"
      />
    </div>
  );
}
