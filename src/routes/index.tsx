import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { suggestPackages, type SuggestedPackage, type SuggestPackagesResult } from "@/lib/pricing-ai.functions";
import { requireUnlocked, lockSite } from "@/lib/gate.functions";


export const Route = createFileRoute("/")({
  loader: () => requireUnlocked(),
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

  let best: { title: string; baseComp: number; hits: number } | null = null;
  for (const r of ROLE_BASELINE) {
    const hits = r.keywords.reduce((n, k) => (t.includes(k) ? n + 1 : n), 0);
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { title: r.title, baseComp: r.baseComp, hits };
    }
  }

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

const fmtRange = (lo: number, hi: number) => `${fmtUSD(lo)} – ${fmtUSD(hi)}`;

// ---------- Component ----------

type InputMode = "title" | "jd" | "manual";
type RateModel = "simple" | "advanced";

const SIMPLE = {
  utilization: 0.7,
  benefitsLoad: 0.25,
  overhead: 0.15,
  margin: 1.4,
  billableWeeks: 46,
};

const BAND_LO = 0.9;
const BAND_HI = 1.15;

function Calculator() {
  const [mode, setMode] = useState<InputMode>("title");
  const [rateModel, setRateModel] = useState<RateModel>("simple");

  const [role, setRole] = useState<string>("VP Marketing");
  const [location, setLocation] = useState<LocationTier>("sf");

  const [salary, setSalary] = useState<number>(180000);
  const [bonus, setBonus] = useState<number>(25000);
  const [equity, setEquity] = useState<number>(15000);
  const manualComp = salary + bonus + equity;

  const [jdText, setJdText] = useState<string>("");

  const [utilization, setUtilization] = useState(SIMPLE.utilization);
  const [benefitsLoad, setBenefitsLoad] = useState(SIMPLE.benefitsLoad);
  const [overhead, setOverhead] = useState(SIMPLE.overhead);
  const [margin, setMargin] = useState(SIMPLE.margin);
  const [billableWeeks, setBillableWeeks] = useState(SIMPLE.billableWeeks);

  const eff = rateModel === "simple" ? SIMPLE : {
    utilization, benefitsLoad, overhead, margin, billableWeeks,
  };

  const [projectHours, setProjectHours] = useState<number>(40);
  const [riskBuffer, setRiskBuffer] = useState<number>(0.15);

  const [packageGoal, setPackageGoal] = useState<string>("");
  const [aiPackages, setAiPackages] = useState<SuggestPackagesResult | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const suggestPackagesFn = useServerFn(suggestPackages);


  const jdEst = useMemo(() => estimateFromJD(jdText), [jdText]);

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
    if (!jdEst) return { comp: 0, source: "Paste a job description to estimate" };
    return {
      comp: Math.round((jdEst.comp * LOCATION_MULT[location]) / 1000) * 1000,
      source: `${jdEst.roleGuess} · ${jdEst.seniority} · ${LOCATION_LABELS[location]}`,
    };
  }, [mode, role, location, manualComp, jdEst]);

  const rates = useMemo(() => {
    const comp = baseline.comp;
    const loadedAnnual = comp * (1 + eff.benefitsLoad);
    const annualBillableHours = eff.billableWeeks * 40 * eff.utilization;
    const targetRevenue = loadedAnnual * eff.margin * (1 + eff.overhead);
    const hourlyMid = annualBillableHours > 0 ? targetRevenue / annualBillableHours : 0;
    const round5 = (n: number) => Math.round(n / 5) * 5;
    const round100 = (n: number) => Math.round(n / 100) * 100;

    const hourly = round5(hourlyMid);
    const hourlyLo = round5(hourlyMid * BAND_LO);
    const hourlyHi = round5(hourlyMid * BAND_HI);

    const daily = hourly * 8;
    const dailyLo = hourlyLo * 8;
    const dailyHi = hourlyHi * 8;
    const weekly = daily * 5;
    const weeklyLo = dailyLo * 5;
    const weeklyHi = dailyHi * 5;
    const monthly = weekly * 4;
    const monthlyLo = weeklyLo * 4;
    const monthlyHi = weeklyHi * 4;

    const mkPkg = (days: number, disc: number) => {
      const mid = round100(daily * days * disc);
      const lo = round100(dailyLo * days * disc);
      const hi = round100(dailyHi * days * disc);
      return { mid, lo, hi };
    };
    const oneDay = mkPkg(4, 0.95);
    const twoDay = mkPkg(8, 0.9);
    const halfFte = mkPkg(10, 0.85);

    const fteLoadedAnnual = comp * (1 + eff.benefitsLoad + 0.08);
    const fteLoadedMonthly = fteLoadedAnnual / 12;

    return {
      hourly, hourlyLo, hourlyHi,
      daily, dailyLo, dailyHi,
      weekly, weeklyLo, weeklyHi,
      monthly, monthlyLo, monthlyHi,
      oneDay, twoDay, halfFte,
      loadedAnnual, fteLoadedAnnual, fteLoadedMonthly,
    };
  }, [baseline.comp, eff.benefitsLoad, eff.utilization, eff.margin, eff.overhead, eff.billableWeeks]);

  const projectFee = useMemo(() => {
    const calc = (h: number) => Math.round((h * projectHours * (1 + riskBuffer)) / 50) * 50;
    return { mid: calc(rates.hourly), lo: calc(rates.hourlyLo), hi: calc(rates.hourlyHi) };
  }, [rates.hourly, rates.hourlyLo, rates.hourlyHi, projectHours, riskBuffer]);

  const partnerAnnual = rates.twoDay.mid * 12;
  const savingsPct = rates.fteLoadedAnnual
    ? Math.round((1 - partnerAnnual / rates.fteLoadedAnnual) * 100)
    : 0;

  const hasBaseline = baseline.comp > 0;

  async function handleDesignPackages() {
    if (!hasBaseline || !packageGoal.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiPackages(null);
    try {
      const result = await suggestPackagesFn({
        data: {
          baselineComp: baseline.comp,
          hourlyMid: rates.hourly,
          hourlyLo: rates.hourlyLo,
          hourlyHi: rates.hourlyHi,
          dailyMid: rates.daily,
          goal: packageGoal.trim(),
        },
      });
      if (result.ok) {
        setAiPackages(result.output);
      } else {
        setAiError(result.error);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  return (

    <div className="min-h-screen bg-background font-sans text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-navy/10 bg-ivory/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand shadow-sm">
              <div className="size-3 rounded-full bg-ivory" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-heading text-base font-extrabold tracking-tight text-navy">Equator</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-rose">Fractional pricing</span>
            </div>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            <a href="#calculator" className="rounded-md px-3 py-1.5 text-sm font-medium text-navy/70 transition-colors hover:bg-mint hover:text-navy">Calculator</a>
            <a href="#methodology" className="rounded-md px-3 py-1.5 text-sm font-medium text-navy/70 transition-colors hover:bg-mint hover:text-navy">Methodology</a>
            <LockButton />
          </nav>
        </div>
      </header>

      <main id="calculator" className="mx-auto max-w-[1400px] px-6 py-10">
        <div className="grid grid-cols-12 items-start gap-8">
          {/* ---------- Left: Inputs sidebar ---------- */}
          <aside className="col-span-12 lg:col-span-4 xl:col-span-3">
            <div className="lg:sticky lg:top-24 space-y-5">
              <section>
                <h1 className="font-heading text-2xl font-extrabold leading-tight tracking-tight text-navy">
                  Rate Calibration
                </h1>
                <p className="mt-2 text-sm text-navy/60">
                  Convert your FTE baseline into defensible fractional pricing.
                </p>
              </section>

              {/* Input mode tabs */}
              <div className="rounded-2xl border border-navy/10 bg-card p-3 shadow-[0_1px_2px_rgba(27,42,74,0.05)]">
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-ivory-deep p-1">
                  {(
                    [
                      { id: "title", label: "Role" },
                      { id: "jd", label: "JD" },
                      { id: "manual", label: "Comp" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setMode(t.id)}
                      className={
                        "rounded-lg py-1.5 text-xs font-semibold transition-all " +
                        (mode === t.id
                          ? "bg-brand text-white shadow-sm"
                          : "text-navy/60 hover:text-navy")
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 space-y-4">
                  {mode === "title" && (
                    <>
                      <Field label="Target Role">
                        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                          {ROLE_BASELINE.map((r) => (
                            <option key={r.title} value={r.title}>{r.title}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Location Tier">
                        <select value={location} onChange={(e) => setLocation(e.target.value as LocationTier)} className={inputCls}>
                          {(Object.keys(LOCATION_LABELS) as LocationTier[]).map((k) => (
                            <option key={k} value={k}>{LOCATION_LABELS[k]}</option>
                          ))}
                        </select>
                      </Field>
                    </>
                  )}

                  {mode === "jd" && (
                    <>
                      <Field label="Paste job description">
                        <textarea
                          value={jdText}
                          onChange={(e) => setJdText(e.target.value)}
                          rows={6}
                          placeholder="Paste JD text — we'll infer role, seniority, and comp."
                          className={inputCls + " leading-relaxed"}
                        />
                      </Field>
                      {jdEst && (
                        <div className="flex flex-wrap gap-1.5">
                          <Chip tone="mint" label="Role" value={jdEst.roleGuess} />
                          <Chip tone="blush" label="Seniority" value={jdEst.seniority} />
                          <Chip tone="ivory" label="Implied" value={fmtUSD(jdEst.comp)} />
                        </div>
                      )}
                      <Field label="Location Tier">
                        <select value={location} onChange={(e) => setLocation(e.target.value as LocationTier)} className={inputCls}>
                          {(Object.keys(LOCATION_LABELS) as LocationTier[]).map((k) => (
                            <option key={k} value={k}>{LOCATION_LABELS[k]}</option>
                          ))}
                        </select>
                      </Field>
                    </>
                  )}

                  {mode === "manual" && (
                    <>
                      <MoneyField label="Base Salary" value={salary} onChange={setSalary} />
                      <MoneyField label="Annual Bonus" value={bonus} onChange={setBonus} />
                      <MoneyField label="Equity (annualized)" value={equity} onChange={setEquity} />
                      <div className="flex items-baseline justify-between rounded-lg bg-mint px-3 py-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-navy/70">Total Comp</span>
                        <span className="font-mono text-sm font-bold tabular-nums text-navy">{fmtUSD(manualComp)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Baseline readout — hero panel */}
              <div className="relative overflow-hidden rounded-2xl bg-navy p-5 text-white shadow-lg">
                <div className="absolute -right-8 -top-8 size-32 rounded-full bg-brand/30 blur-2xl" />
                <div className="relative">
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-brand" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">FTE Baseline</span>
                  </div>
                  <div className="mt-2 font-mono text-3xl font-bold tabular-nums">
                    {hasBaseline ? fmtUSD(baseline.comp) : "—"}
                  </div>
                  <div className="mt-1 text-[11px] text-white/60">{baseline.source}</div>
                </div>
              </div>

              {/* Rate model */}
              <div className="rounded-2xl border border-navy/10 bg-card p-4 shadow-[0_1px_2px_rgba(27,42,74,0.05)]">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-heading text-xs font-bold uppercase tracking-wider text-navy">Assumptions</span>
                  <div className="flex rounded-lg bg-ivory-deep p-0.5">
                    {(["simple", "advanced"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setRateModel(m)}
                        className={
                          "rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all " +
                          (rateModel === m ? "bg-rose text-white shadow-sm" : "text-navy/60")
                        }
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {rateModel === "simple" ? (
                  <ul className="grid grid-cols-2 gap-2 text-[11px]">
                    <MiniStat label="Utilization" value={`${Math.round(SIMPLE.utilization * 100)}%`} tone="mint" />
                    <MiniStat label="Benefits" value={`${Math.round(SIMPLE.benefitsLoad * 100)}%`} tone="blush" />
                    <MiniStat label="Overhead" value={`${Math.round(SIMPLE.overhead * 100)}%`} tone="ivory" />
                    <MiniStat label="Margin" value={`${SIMPLE.margin.toFixed(2)}×`} tone="mint" />
                  </ul>
                ) : (
                  <div className="space-y-3.5">
                    <Lever label="Utilization" value={utilization} onChange={setUtilization} min={0.3} max={0.9} step={0.05} format={(v) => `${Math.round(v * 100)}%`} />
                    <Lever label="Benefits & Taxes" value={benefitsLoad} onChange={setBenefitsLoad} min={0.1} max={0.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
                    <Lever label="Overhead" value={overhead} onChange={setOverhead} min={0} max={0.4} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
                    <Lever label="Margin" value={margin} onChange={setMargin} min={1.0} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}×`} />
                    <Lever label="Billable Weeks" value={billableWeeks} onChange={setBillableWeeks} min={30} max={50} step={1} format={(v) => `${v} wks`} />
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* ---------- Right: Dashboard ---------- */}
          <div className="col-span-12 space-y-6 lg:col-span-8 xl:col-span-9">
            {/* Rate ladder — colorful compartments */}
            <section>
              <SectionHeader eyebrow="Rate ladder" title="Your fractional rate range" />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard
                  label="Hourly"
                  tone="brand"
                  range={hasBaseline ? fmtRange(rates.hourlyLo, rates.hourlyHi) : "—"}
                  mid={hasBaseline ? `mid ${fmtUSD(rates.hourly)}` : ""}
                />
                <MetricCard
                  label="Day (8h)"
                  tone="mint"
                  range={hasBaseline ? fmtRange(rates.dailyLo, rates.dailyHi) : "—"}
                  mid={hasBaseline ? `mid ${fmtUSD(rates.daily)}` : ""}
                />
                <MetricCard
                  label="Week (5d)"
                  tone="blush"
                  range={hasBaseline ? fmtRange(rates.weeklyLo, rates.weeklyHi) : "—"}
                  mid={hasBaseline ? `mid ${fmtUSD(rates.weekly)}` : ""}
                />
                <MetricCard
                  label="Month (4wk)"
                  tone="ivory"
                  range={hasBaseline ? fmtRange(rates.monthlyLo, rates.monthlyHi) : "—"}
                  mid={hasBaseline ? `mid ${fmtUSD(rates.monthly)}` : ""}
                />
              </div>
            </section>

            {/* Retainers */}
            <section>
              <SectionHeader eyebrow="Retainers" title="Fractional package pricing" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <PackageCard
                  tier="Advisory"
                  cadence="1 Day/Wk"
                  price={hasBaseline ? fmtUSD(rates.oneDay.mid) : "—"}
                  range={hasBaseline ? fmtRange(rates.oneDay.lo, rates.oneDay.hi) : ""}
                  copy="Strategy sessions, unblocking teams, and periodic reviews."
                />
                <PackageCard
                  tier="Partner"
                  cadence="2 Days/Wk"
                  price={hasBaseline ? fmtUSD(rates.twoDay.mid) : "—"}
                  range={hasBaseline ? fmtRange(rates.twoDay.lo, rates.twoDay.hi) : ""}
                  copy="Embedded leadership, hands-on execution, and direct reports."
                  featured
                />
                <PackageCard
                  tier="Interim"
                  cadence="0.5 FTE"
                  price={hasBaseline ? fmtUSD(rates.halfFte.mid) : "—"}
                  range={hasBaseline ? fmtRange(rates.halfFte.lo, rates.halfFte.hi) : ""}
                  copy="Full ownership of the function during a leadership gap."
                />
              </div>
            </section>

            {/* AI Package Designer */}
            <section className="rounded-2xl border border-navy/10 bg-card p-5 shadow-[0_1px_2px_rgba(27,42,74,0.05)]">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose">AI Package Designer</div>
                  <h2 className="font-heading text-lg font-extrabold tracking-tight text-navy">Design a custom package</h2>
                  <p className="mt-1 max-w-xl text-xs text-navy/60">
                    Tell us your goal — e.g., “I want $10k/month” or “2 days a week with a startup” — and AI will build a package using your calculated rates.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand">
                  <SparkleIcon className="size-3.5" />
                  Powered by Lovable AI
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 md:flex-row">
                <textarea
                  value={packageGoal}
                  onChange={(e) => setPackageGoal(e.target.value)}
                  rows={2}
                  placeholder="I want to land $12k/month with a Series B SaaS company..."
                  className={inputCls + " flex-1 leading-relaxed"}
                />
                <button
                  onClick={handleDesignPackages}
                  disabled={!hasBaseline || !packageGoal.trim() || aiLoading}
                  className={
                    "shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all " +
                    (hasBaseline && packageGoal.trim() && !aiLoading
                      ? "bg-navy text-white shadow-md hover:bg-navy-light"
                      : "cursor-not-allowed bg-navy/30 text-white")
                  }
                >
                  {aiLoading ? "Designing..." : "Design package"}
                </button>
              </div>

              {aiError && (
                <div className="mt-4 rounded-xl bg-rose-light px-4 py-3 text-xs text-rose">
                  {aiError}
                </div>
              )}

              {aiPackages && (
                <div className="mt-5 space-y-4">
                  {aiPackages.summary && (
                    <p className="text-sm leading-relaxed text-navy/70">{aiPackages.summary}</p>
                  )}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {aiPackages.packages.map((pkg, idx) => (
                      <AiPackageCard key={idx} pkg={pkg} />
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Comparison + Project Estimator */}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* FTE Comparison */}
              <section className="rounded-2xl border border-navy/10 bg-card p-5 shadow-[0_1px_2px_rgba(27,42,74,0.05)]">
                <SectionHeader eyebrow="Comparison" title="FTE vs Fractional" compact />
                <div className="mt-3 space-y-2">
                  <Row label="Base comp" value={hasBaseline ? fmtUSD(baseline.comp) : "—"} />
                  <Row label="Loaded annual (FTE)" value={hasBaseline ? fmtUSD(rates.fteLoadedAnnual) : "—"} strong />
                  <Row label="Loaded monthly (FTE)" value={hasBaseline ? fmtUSD(rates.fteLoadedMonthly) : "—"} />
                  <Row label="Partner tier (annualized)" value={hasBaseline ? fmtUSD(partnerAnnual) : "—"} />
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-brand px-4 py-3 text-white">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/80">Client saves</div>
                      <div className="font-heading text-lg font-extrabold">{hasBaseline ? `${savingsPct}%` : "—"}</div>
                    </div>
                    <div className="text-right text-[11px] text-white/80">
                      vs full-time hire<br />with benefits & overhead
                    </div>
                  </div>
                </div>
              </section>

              {/* Project Estimator */}
              <section className="rounded-2xl border border-navy/10 bg-card p-5 shadow-[0_1px_2px_rgba(27,42,74,0.05)]">
                <SectionHeader eyebrow="Estimator" title="Project fee" compact />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Est. hours">
                    <input
                      type="number"
                      min={1}
                      value={projectHours}
                      onChange={(e) => setProjectHours(Number(e.target.value) || 0)}
                      className={inputCls + " font-mono"}
                    />
                  </Field>
                  <Field label="Risk buffer">
                    <select value={riskBuffer} onChange={(e) => setRiskBuffer(Number(e.target.value))} className={inputCls}>
                      <option value={0}>0%</option>
                      <option value={0.1}>10%</option>
                      <option value={0.15}>15%</option>
                      <option value={0.2}>20%</option>
                      <option value={0.3}>30%</option>
                    </select>
                  </Field>
                </div>
                <div className="mt-4 rounded-xl bg-blush p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-rose">Project fee range</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-navy">
                    {hasBaseline ? fmtRange(projectFee.lo, projectFee.hi) : "—"}
                  </div>
                  {hasBaseline && (
                    <div className="mt-1 font-mono text-[11px] text-navy/50">
                      mid {fmtUSD(projectFee.mid)} · {projectHours} hrs × {fmtUSD(rates.hourly)} × {Math.round((1 + riskBuffer) * 100)}%
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Methodology */}
            <section id="methodology" className="rounded-2xl border border-navy/10 bg-ivory-deep/60 p-6">
              <SectionHeader eyebrow="Methodology" title="How this is calculated" compact />
              <ol className="mt-4 grid grid-cols-1 gap-3 text-xs leading-relaxed text-navy/70 md:grid-cols-2">
                <Step n="01" tone="brand">FTE baseline × ({Math.round(eff.benefitsLoad * 100)}% benefits & taxes) = loaded annual cost.</Step>
                <Step n="02" tone="rose">Loaded cost × {eff.margin.toFixed(2)}× margin × (1 + {Math.round(eff.overhead * 100)}% overhead) = target revenue.</Step>
                <Step n="03" tone="navy">Target ÷ ({eff.billableWeeks} wks × 40 hrs × {Math.round(eff.utilization * 100)}%) = midpoint hourly, ±band.</Step>
                <Step n="04" tone="brand">Retainers apply 5–15% volume discounts to reward committed cadence.</Step>
              </ol>
            </section>
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-[1400px] border-t border-navy/10 px-6 py-8">
        <p className="text-xs text-navy/50">
          Directional guidance for new fractional consultants. Ballpark benchmarks, not authoritative market data.
        </p>
      </footer>
    </div>
  );
}

// ---------- Building blocks ----------

const inputCls =
  "w-full rounded-lg border border-navy/15 bg-white px-3 py-2 text-sm text-navy outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-navy/50">{label}</label>
      {children}
    </div>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-navy/40">$</span>
        <input
          type="number" min={0} step={1000}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={inputCls + " pl-7 font-mono"}
        />
      </div>
    </Field>
  );
}

const chipTones = {
  mint: "bg-mint text-navy",
  blush: "bg-blush text-navy",
  ivory: "bg-ivory-deep text-navy",
} as const;

function Chip({ label, value, tone = "mint" }: { label: string; value: string; tone?: keyof typeof chipTones }) {
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] " + chipTones[tone]}>
      <span className="font-bold uppercase tracking-wider opacity-60">{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "mint" | "blush" | "ivory" }) {
  const bg = tone === "mint" ? "bg-mint" : tone === "blush" ? "bg-blush" : "bg-ivory-deep";
  return (
    <li className={"flex items-center justify-between rounded-lg px-2.5 py-1.5 " + bg}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-navy/60">{label}</span>
      <span className="font-mono text-xs font-bold text-navy">{value}</span>
    </li>
  );
}

function LockButton() {
  const router = useRouter();
  const lock = useServerFn(lockSite);
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try {
          await lock();
          await router.navigate({ to: "/unlock" });
          router.invalidate();
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="ml-2 rounded-md border border-navy/15 px-3 py-1.5 text-sm font-medium text-navy/70 transition-colors hover:bg-navy hover:text-ivory disabled:opacity-50"
    >
      {busy ? "Locking…" : "Lock"}
    </button>
  );
}

function SectionHeader({ eyebrow, title, compact }: { eyebrow: string; title: string; compact?: boolean }) {
  return (
    <div className={compact ? "" : "mb-3"}>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose">{eyebrow}</div>
      <h2 className="font-heading text-lg font-extrabold tracking-tight text-navy">{title}</h2>
    </div>
  );
}

const metricTones = {
  brand: "bg-brand text-white",
  mint: "bg-mint text-navy",
  blush: "bg-blush text-navy",
  ivory: "bg-ivory-deep text-navy",
} as const;

function MetricCard({ label, range, mid, tone }: { label: string; range: string; mid: string; tone: keyof typeof metricTones }) {
  const dark = tone === "brand";
  return (
    <div className={"rounded-2xl p-4 shadow-[0_1px_2px_rgba(27,42,74,0.05)] " + metricTones[tone]}>
      <div className={"text-[10px] font-bold uppercase tracking-[0.18em] " + (dark ? "text-white/80" : "text-navy/50")}>
        {label}
      </div>
      <div className="mt-2 font-mono text-xl font-bold tabular-nums leading-tight">
        {range}
      </div>
      {mid && (
        <div className={"mt-1 font-mono text-[10px] " + (dark ? "text-white/70" : "text-navy/50")}>{mid}</div>
      )}
    </div>
  );
}

function PackageCard({
  tier, cadence, price, range, copy, featured,
}: {
  tier: string; cadence: string; price: string; range: string; copy: string; featured?: boolean;
}) {
  return (
    <div
      className={
        "relative flex flex-col justify-between overflow-hidden rounded-2xl p-5 transition-all " +
        (featured
          ? "bg-navy text-white shadow-xl ring-2 ring-brand"
          : "border border-navy/10 bg-card text-navy shadow-[0_1px_2px_rgba(27,42,74,0.05)]")
      }
    >
      {featured && (
        <span className="absolute right-3 top-3 rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
          Recommended
        </span>
      )}
      <div>
        <div className="flex items-center gap-2">
          <span className={"size-1.5 rounded-full " + (featured ? "bg-brand" : "bg-rose")} />
          <span className={"text-[10px] font-bold uppercase tracking-[0.2em] " + (featured ? "text-brand" : "text-rose")}>
            {tier}
          </span>
        </div>
        <div className={"mt-1 text-xs " + (featured ? "text-white/60" : "text-navy/50")}>{cadence}</div>
        <div className="mt-4">
          <span className="font-mono text-2xl font-bold tabular-nums">{price}</span>
          <span className={"text-xs " + (featured ? "text-white/60" : "text-navy/50")}> /mo</span>
          {range && (
            <div className={"mt-1 font-mono text-[10px] tabular-nums " + (featured ? "text-white/50" : "text-navy/40")}>
              {range}
            </div>
          )}
        </div>
      </div>
      <p className={"mt-4 text-xs leading-relaxed " + (featured ? "text-white/70" : "text-navy/60")}>
        {copy}
      </p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between border-b border-navy/5 py-1.5 last:border-0">
      <span className="text-xs text-navy/60">{label}</span>
      <span className={"font-mono text-sm tabular-nums " + (strong ? "font-bold text-navy" : "text-navy/80")}>{value}</span>
    </div>
  );
}

const stepTones = { brand: "bg-brand text-white", rose: "bg-rose text-white", navy: "bg-navy text-white" } as const;

function Step({ n, tone, children }: { n: string; tone: keyof typeof stepTones; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={"inline-flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold " + stepTones[tone]}>
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Lever({
  label, value, onChange, min, max, step, format,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; format: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <label className="text-[11px] font-medium text-navy/70">{label}</label>
        <span className="font-mono text-[11px] font-bold tabular-nums text-navy">{format(value)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-ivory-deep">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-1 block w-full accent-[color:var(--color-brand)]"
      />
    </div>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
    </svg>
  );
}

function AiPackageCard({ pkg }: { pkg: SuggestedPackage }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-navy/10 bg-ivory-deep/50 p-5">
      <div>
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-brand" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">{pkg.name}</span>
        </div>
        <div className="mt-1 text-xs text-navy/60">{pkg.cadence}</div>
        <div className="mt-4">
          <span className="font-mono text-2xl font-bold tabular-nums text-navy">{fmtUSD(pkg.monthlyFee)}</span>
          <span className="text-xs text-navy/50"> /mo</span>
        </div>
        <div className="mt-3 space-y-1 text-[11px] text-navy/60">
          <div className="flex justify-between">
            <span>Days/mo</span>
            <span className="font-mono font-semibold text-navy">{pkg.daysPerMonth}</span>
          </div>
          <div className="flex justify-between">
            <span>Hours/mo</span>
            <span className="font-mono font-semibold text-navy">{pkg.hoursPerMonth}</span>
          </div>
          <div className="flex justify-between">
            <span>Annualized</span>
            <span className="font-mono font-semibold text-navy">{fmtUSD(pkg.annualizedFee)}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-[11px] leading-relaxed text-navy/70">
          <span className="font-semibold text-navy">Rationale:</span> {pkg.rationale}
        </p>
        <p className="text-[11px] leading-relaxed text-navy/70">
          <span className="font-semibold text-navy">Ideal for:</span> {pkg.idealFor}
        </p>
      </div>
    </div>
  );
}

