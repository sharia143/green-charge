"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ACTIVITY_EXTRA_W,
  ACTIVITY_LABEL,
  Activity,
  AI_SUBTASK_EMOJI,
  AI_SUBTASK_LABEL,
  AI_SUBTASK_PER_OUTPUT_G,
  AI_SUBTASK_SERVER_G_PER_HOUR,
  AISubtask,
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  DEVICES,
  DeviceCategory,
  TASK_EMOJI,
  TASK_LABEL,
  TASK_POWER_W,
  TASK_SERVER_G_PER_HOUR,
  Task,
  deviceById,
} from "@/lib/devices";
import {
  ChargeMethod,
  METHOD_EFFICIENCY,
  METHOD_LABEL,
  annualImpact,
  calcEnergy,
  formatGrams,
  formatKm,
  formatTimeRange,
  gramsCO2,
  mmuCampusImpact,
} from "@/lib/calc";
import {
  Period,
  RegionalForecast,
  ciIndex,
  fetchForecastByPostcode,
  findGreenestWindow,
} from "@/lib/carbon-api";

const INDEX_COLOR: Record<string, string> = {
  "very low":  "#059669",
  "low":       "#65a30d",
  "moderate":  "#ca8a04",
  "high":      "#ea580c",
  "very high": "#dc2626",
};

const INDEX_BG: Record<string, string> = {
  "very low":  "bg-emerald-100 text-emerald-800 ring-emerald-200",
  "low":       "bg-lime-100 text-lime-800 ring-lime-200",
  "moderate":  "bg-amber-100 text-amber-800 ring-amber-200",
  "high":      "bg-orange-100 text-orange-800 ring-orange-200",
  "very high": "bg-rose-100 text-rose-800 ring-rose-200",
};

function effectiveBatteryPowerW(maxWiredW: number, maxFastW: number, method: ChargeMethod): number {
  if (method === "wireless") return Math.min(7.5, maxWiredW);
  if (method === "fast")     return maxFastW;
  return Math.min(10, maxWiredW);
}

function dominantFuel(mix?: { fuel: string; perc: number }[]): { fuel: string; perc: number } | null {
  if (!mix || mix.length === 0) return null;
  return [...mix].sort((a, b) => b.perc - a.perc)[0];
}

export default function Home() {
  const [deviceId, setDeviceId] = useState("iphone-15");
  const [startPct, setStartPct] = useState(20);
  const [endPct, setEndPct]     = useState(100);
  const [method, setMethod]     = useState<ChargeMethod>("wired");
  const [activity, setActivity] = useState<Activity>("off");
  const [postcode, setPostcode] = useState("M15");
  const [task, setTask]             = useState<Task>("ai");
  const [aiSubtask, setAiSubtask]   = useState<AISubtask>("short-text");
  const [taskMinutes, setTaskMinutes] = useState<number>(60);

  const [forecast, setForecast] = useState<RegionalForecast | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const device = useMemo(() => deviceById(deviceId), [deviceId]);

  const durationMinutes = useMemo(() => {
    const deltaPct = Math.max(0, endPct - startPct);
    const batteryWhDelta = device.batteryWh * (deltaPct / 100);
    const pBattW = effectiveBatteryPowerW(device.maxWiredW, device.maxFastW, method);
    let mins = (batteryWhDelta / pBattW) * 60;
    if (endPct > 80) {
      const tailFrac = (endPct - Math.max(80, startPct)) / 100;
      mins += (device.batteryWh * tailFrac / pBattW) * 60;
    }
    return Math.max(1, Math.round(mins));
  }, [device, startPct, endPct, method]);

  const energy = useMemo(
    () => calcEnergy({ device, startPct, endPct, method, activity, durationMinutes }),
    [device, startPct, endPct, method, activity, durationMinutes],
  );

  useEffect(() => {
    const pc = postcode.trim();
    if (pc.length < 2) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      fetchForecastByPostcode(pc)
        .then((f) => { if (!cancelled) { setForecast(f); setLoading(false); } })
        .catch((err: Error) => { if (!cancelled) { setError(err.message); setLoading(false); setForecast(null); } });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [postcode]);

  const currentPeriod = forecast?.data[0];
  const currentCI     = currentPeriod?.intensity.forecast ?? null;
  const currentIdx    = currentPeriod?.intensity.index ?? null;
  const topFuel       = dominantFuel(currentPeriod?.generationmix);

  const windowHrs = Math.max(0.5, Math.ceil(durationMinutes / 60));
  const greenest  = useMemo(
    () => (forecast ? findGreenestWindow(forecast.data, windowHrs) : null),
    [forecast, windowHrs],
  );

  const carbonNowG   = currentCI != null ? gramsCO2(energy.totalKWh, currentCI) : null;
  const carbonLaterG = greenest         ? gramsCO2(energy.totalKWh, greenest.avgCI) : null;
  const savedG       = carbonNowG != null && carbonLaterG != null ? Math.max(0, carbonNowG - carbonLaterG) : null;
  const savedPct     = carbonNowG && carbonLaterG ? (1 - carbonLaterG / carbonNowG) * 100 : null;

  const annual = carbonNowG != null ? annualImpact(carbonNowG) : null;
  const annualShifted = carbonLaterG != null ? annualImpact(carbonLaterG) : null;
  const mmu = savedG != null ? mmuCampusImpact(savedG) : null;

  const chartData = useMemo(() => {
    if (!forecast) return [];
    return forecast.data.map((p) => ({
      ts: new Date(p.from).getTime(),
      ci: p.intensity.forecast,
      idx: p.intensity.index,
    }));
  }, [forecast]);

  // scenario comparison: same charge under each activity, at current CI
  const scenarioData = useMemo(() => {
    if (currentCI == null) return [];
    const activities: Activity[] = ["off", "light", "video", "call", "gaming", "ai"];
    return activities.map((a) => {
      const e = calcEnergy({ device, startPct, endPct, method, activity: a, durationMinutes });
      const g = gramsCO2(e.totalKWh, currentCI);
      return {
        activity: a,
        label: ACTIVITY_LABEL[a].replace(/\s*\(.*\)/, ""),
        g,
        wh: e.totalWh,
      };
    });
  }, [device, startPct, endPct, method, durationMinutes, currentCI]);
  const maxScenarioG = Math.max(...scenarioData.map((s) => s.g), 1);

  // server gCO2/hr depends on AI subtype when task=ai, else fixed by task
  const serverGPerHour = task === "ai"
    ? AI_SUBTASK_SERVER_G_PER_HOUR[aiSubtask]
    : TASK_SERVER_G_PER_HOUR[task];

  // "Same task, different device" — compare same task across phone/tablet/laptop
  const taskRows = useMemo(() => {
    if (currentCI == null) return [];
    const hours = taskMinutes / 60;
    const serverG = serverGPerHour * hours;
    const cats: DeviceCategory[] = ["phone", "tablet", "laptop"];
    return cats.map((cat) => {
      const watts = TASK_POWER_W[task][cat];
      const kWh = (watts * hours) / 1000;
      const deviceG = kWh * currentCI;
      const totalG = deviceG + serverG;
      return { cat, watts, kWh, deviceG, serverG, totalG };
    });
  }, [task, taskMinutes, currentCI, serverGPerHour]);
  const minTaskDeviceG = Math.min(...taskRows.map((r) => r.deviceG));
  const maxTaskDeviceG = Math.max(...taskRows.map((r) => r.deviceG));
  const taskRatio = minTaskDeviceG > 0 ? maxTaskDeviceG / minTaskDeviceG : null;
  const taskServerG = currentCI != null ? serverGPerHour * (taskMinutes / 60) : 0;

  const idxColor = currentIdx ? INDEX_COLOR[currentIdx] : "#10b981";

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50 text-zinc-900">
      {/* top brand strip + live grid */}
      <div className="border-b border-zinc-200/70 bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <BoltMark color={idxColor} />
            <div>
              <div className="text-sm font-semibold tracking-tight">Green Charge</div>
              <div className="-mt-0.5 text-[10px] uppercase tracking-widest text-zinc-500">MMU Sustainable Computing Hackathon · 2026</div>
            </div>
          </div>
          <LiveGridPill
            shortname={forecast?.shortname}
            ci={currentCI}
            idx={currentIdx ?? null}
            topFuel={topFuel}
            loading={loading}
            error={error}
          />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-8 md:py-12">
        <header className="mb-8 max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
            What does it cost the planet <span className="text-emerald-600">to charge your stuff?</span>
          </h1>
          <p className="mt-3 max-w-2xl text-zinc-600 md:text-lg">
            Pick a device, set how you charge and use it, and we&apos;ll show the carbon footprint —
            and the greenest time to plug in tonight, using live UK National Grid carbon data.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-12">
          {/* inputs */}
          <section className="md:col-span-4 space-y-5 self-start rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm backdrop-blur lg:sticky lg:top-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Your charge</h2>

            <Field label="Device">
              <select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {(["phone", "tablet", "laptop"] as const).map((cat) => (
                  <optgroup key={cat} label={cat.toUpperCase()}>
                    {DEVICES.filter((d) => d.category === cat).map((d) => (
                      <option key={d.id} value={d.id}>{d.name} · {d.batteryWh} Wh</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>

            <Field label={`Charge ${startPct}% → ${endPct}%`}>
              <div className="space-y-2.5">
                <RangeRow label="From" value={startPct} onChange={(v) => setStartPct(Math.min(v, endPct - 1))} />
                <RangeRow label="To"   value={endPct}   onChange={(v) => setEndPct(Math.max(v, startPct + 1))} />
              </div>
            </Field>

            <Field label="Charging method">
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(METHOD_LABEL) as ChargeMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                      method === m
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                    }`}
                  >
                    {METHOD_LABEL[m]}
                    <div className="mt-0.5 text-[10px] font-normal text-zinc-500">{Math.round(METHOD_EFFICIENCY[m] * 100)}% efficient</div>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="What are you doing while it charges?">
              <select
                value={activity}
                onChange={(e) => setActivity(e.target.value as Activity)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => (
                  <option key={a} value={a}>{ACTIVITY_LABEL[a]}{a !== "off" ? ` · +${ACTIVITY_EXTRA_W[device.category][a]} W` : ""}</option>
                ))}
              </select>
            </Field>

            <Field label="UK Postcode (outward, e.g. M15)">
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                maxLength={6}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm uppercase focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <p className="mt-1 text-xs text-zinc-500">
                {forecast ? <>Region: <span className="font-medium">{forecast.shortname}</span></> : loading ? "Looking up grid…" : error ? <span className="text-rose-600">{error}</span> : "M15 = MMU campus"}
              </p>
            </Field>

            <div className="mt-2 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
              <div className="font-medium text-zinc-700">This charge takes</div>
              <div className="mt-0.5 text-2xl font-bold text-zinc-900 tabular-nums">
                {Math.floor(durationMinutes / 60)}h {durationMinutes % 60}m
              </div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                {(device.batteryWh * (endPct - startPct) / 100).toFixed(1)} Wh into the battery
              </div>
            </div>
          </section>

          {/* results */}
          <section className="md:col-span-8 space-y-6">
            {/* KPI strip */}
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiCard
                eyebrow="Energy from the wall"
                value={`${energy.totalKWh.toFixed(4)} kWh`}
                sub={`${energy.totalWh.toFixed(2)} Wh · over ${durationMinutes} min`}
              />
              <KpiCard
                eyebrow="Carbon, charging now"
                value={carbonNowG != null ? formatGrams(carbonNowG) : "—"}
                sub={currentCI != null ? `${currentCI} gCO₂/kWh · ${currentIdx}` : "no grid data"}
                accent={idxColor}
              />
              <KpiCard
                eyebrow="While-charging penalty"
                value={`+${((energy.penaltyFactor - 1) * 100).toFixed(0)}%`}
                sub={activity === "off"
                  ? "no use → no extra heat loss"
                  : `extra ${(energy.activeUseWh).toFixed(2)} Wh from ${ACTIVITY_LABEL[activity].toLowerCase()}`}
              />
            </div>

            {/* HERO: now vs later */}
            <div className="overflow-hidden rounded-3xl border border-emerald-300/70 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 p-6 text-white shadow-lg shadow-emerald-500/20">
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-emerald-50/90">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
                  Live · charge now or later?
                </div>
                {savedPct != null && (
                  <div className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
                    Save {savedPct.toFixed(0)}%
                  </div>
                )}
              </div>

              <div className="mt-5 grid items-center gap-5 sm:grid-cols-[1fr_auto_1fr]">
                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur">
                  <div className="text-[10px] font-medium uppercase tracking-widest text-emerald-50/80">If you charge now</div>
                  <div className="mt-1 text-4xl font-bold tabular-nums md:text-5xl">{carbonNowG != null ? formatGrams(carbonNowG) : "—"}</div>
                  <div className="mt-1 text-xs text-emerald-50/80">at {currentCI ?? "—"} gCO₂/kWh ({currentIdx ?? "—"})</div>
                </div>
                <div className="hidden text-3xl text-white/60 sm:block">→</div>
                <div className="rounded-2xl bg-white p-4 text-emerald-800 shadow-lg">
                  <div className="text-[10px] font-medium uppercase tracking-widest text-emerald-700">Charge in greenest {windowHrs}h window</div>
                  <div className="mt-1 text-4xl font-bold tabular-nums md:text-5xl">{carbonLaterG != null ? formatGrams(carbonLaterG) : "—"}</div>
                  <div className="mt-1 text-xs text-emerald-700/80">{greenest ? formatTimeRange(greenest.from, greenest.to) : "—"} · {greenest ? `${greenest.avgCI.toFixed(0)} gCO₂/kWh` : ""}</div>
                </div>
              </div>

              {savedG != null && savedG > 0 && (
                <p className="mt-5 text-sm text-emerald-50">
                  Shifting this single charge saves{" "}
                  <span className="font-bold text-white">{formatGrams(savedG)} of CO₂</span>
                  {" "}— and it&apos;s the same charge.
                </p>
              )}
            </div>

            {/* 48h chart */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Next 48 hours · {forecast?.shortname ?? "—"}</h3>
                <p className="text-xs text-zinc-500">Green band = greenest {windowHrs}h window</p>
              </div>
              <div className="h-64 w-full">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 12, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                      <XAxis
                        dataKey="ts"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        tick={{ fontSize: 11 }}
                        scale="time"
                      />
                      <YAxis tick={{ fontSize: 11 }} unit=" g" />
                      <Tooltip
                        labelFormatter={(v) => new Date(Number(v)).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                        formatter={(v) => [`${v} gCO₂/kWh`, "Carbon intensity"]}
                      />
                      {greenest && (
                        <ReferenceArea
                          x1={new Date(greenest.from).getTime()}
                          x2={new Date(greenest.to).getTime()}
                          fill="#10b981"
                          fillOpacity={0.15}
                          stroke="#10b981"
                          strokeOpacity={0.5}
                        />
                      )}
                      <Area type="monotone" dataKey="ci" stroke="#059669" strokeWidth={2.5} fill="url(#g)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                    {loading ? "Loading grid forecast…" : error ?? "Enter a UK postcode."}
                  </div>
                )}
              </div>
            </div>

            {/* scenario comparison */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">What if you did something else while charging?</h3>
                <p className="text-xs text-zinc-500">Same charge · same grid · different activity</p>
              </div>
              <div className="h-56 w-full">
                {scenarioData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scenarioData} margin={{ top: 15, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(1)}`} unit=" g" />
                      <Tooltip formatter={(v) => [`${(v as number).toFixed(2)} g CO₂`, "Carbon"]} />
                      <Bar dataKey="g" radius={[6, 6, 0, 0]}>
                        {scenarioData.map((s) => (
                          <Cell key={s.activity}
                            fill={s.activity === activity ? "#059669" : "#d1d5db"} />
                        ))}
                        <LabelList dataKey="g" position="top" formatter={(v) => `${Number(v).toFixed(1)}g`} style={{ fontSize: 10, fill: "#525252" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                    {loading ? "loading…" : "no grid data"}
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-zinc-500">Gaming or AI use while charging makes both sides waste more energy as heat.</p>
            </div>

            {/* Same task, different device */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Same task. Different device. Different carbon.</h3>
                <p className="text-xs text-zinc-500">An AI chat on your phone hits the same server — but uses a fraction of your laptop&apos;s local power.</p>
              </div>

              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Field label="Task">
                  <select
                    value={task}
                    onChange={(e) => setTask(e.target.value as Task)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {(Object.keys(TASK_LABEL) as Task[]).map((t) => (
                      <option key={t} value={t}>{TASK_EMOJI[t]} {TASK_LABEL[t]}</option>
                    ))}
                  </select>
                </Field>
                {task === "ai" ? (
                  <Field label="AI kind">
                    <select
                      value={aiSubtask}
                      onChange={(e) => setAiSubtask(e.target.value as AISubtask)}
                      className="w-full rounded-lg border border-emerald-300 bg-emerald-50/50 px-3 py-2 text-sm font-medium text-emerald-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      {(Object.keys(AI_SUBTASK_LABEL) as AISubtask[]).map((a) => (
                        <option key={a} value={a}>{AI_SUBTASK_EMOJI[a]} {AI_SUBTASK_LABEL[a]}</option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field label="AI kind">
                    <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-400">
                      pick &quot;AI chat&quot; to enable
                    </div>
                  </Field>
                )}
                <Field label={`Duration · ${taskMinutes} min`}>
                  <input
                    type="range"
                    min={5}
                    max={240}
                    step={5}
                    value={taskMinutes}
                    onChange={(e) => setTaskMinutes(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </Field>
              </div>

              {task === "ai" && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/40 px-3.5 py-2.5 text-xs text-emerald-900">
                  <span className="font-semibold">{AI_SUBTASK_EMOJI[aiSubtask]} {AI_SUBTASK_LABEL[aiSubtask]}:</span>
                  <span className="ml-1.5 text-emerald-800/80">
                    ~{AI_SUBTASK_PER_OUTPUT_G[aiSubtask]} gCO₂ <em>per output</em> · ~{AI_SUBTASK_SERVER_G_PER_HOUR[aiSubtask]} gCO₂/hr server-side
                  </span>
                </div>
              )}

              {taskRows.length > 0 ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {taskRows.map((r) => {
                      const isLowest  = r.deviceG === minTaskDeviceG;
                      const isHighest = r.deviceG === maxTaskDeviceG;
                      return (
                        <div
                          key={r.cat}
                          className={`relative flex flex-col rounded-2xl border p-4 transition ${
                            isLowest
                              ? "border-emerald-300 bg-emerald-50 shadow-sm ring-2 ring-emerald-300/40"
                              : isHighest
                                ? "border-rose-200 bg-rose-50/50"
                                : "border-zinc-200 bg-zinc-50/60"
                          }`}
                        >
                          {isLowest && (
                            <span className="absolute right-3 top-3 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">greenest</span>
                          )}
                          <div className="text-3xl">{CATEGORY_EMOJI[r.cat]}</div>
                          <div className="mt-1 text-sm font-semibold">{CATEGORY_LABEL[r.cat]}</div>

                          <div className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Local carbon</div>
                          <div className="text-3xl font-bold tabular-nums leading-tight" style={isLowest ? { color: "#047857" } : undefined}>
                            {formatGrams(r.deviceG)}
                          </div>
                          <div className="text-xs text-zinc-500">
                            <span className="tabular-nums">{r.watts}W</span> active · <span className="tabular-nums">{(r.kWh * 1000).toFixed(1)} Wh</span>
                          </div>

                          <div className="mt-3 border-t border-zinc-200 pt-2 text-xs text-zinc-500">
                            + <span className="tabular-nums">{formatGrams(r.serverG)}</span> cloud share <span className="text-zinc-400">(same)</span>
                          </div>
                          <div className="mt-1 text-sm font-medium text-zinc-700">
                            Total: <span className="tabular-nums">{formatGrams(r.totalG)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {taskRatio && taskRatio > 1.2 && (
                    <p className="mt-4 text-sm text-zinc-700">
                      A laptop uses <span className="font-bold text-emerald-700 tabular-nums">{taskRatio.toFixed(1)}×</span> more <em>local</em> energy than a phone for the same task. The cloud bill ({formatGrams(taskServerG)} per session) is identical — only the device on your desk differs.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-zinc-500">
                    The server-side share (the LLM, CDN, call relay) is the same regardless of which device you pick. For cloud AI it&apos;s often the bigger slice — for video calls, gaming and browsing the device dominates.
                  </p>
                </>
              ) : (
                <div className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-400">
                  {loading ? "loading grid…" : "no grid data — enter a postcode."}
                </div>
              )}
            </div>

            {/* Annual & MMU impact */}
            <div className="grid gap-4 lg:grid-cols-2">
              {annual && annualShifted && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">If you charged like this once a day for a year</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-zinc-50 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Charge now, every day</div>
                      <div className="mt-1 text-3xl font-bold tabular-nums">{annual.kgPerYear.toFixed(2)}<span className="ml-1 text-base font-medium text-zinc-500">kg</span></div>
                      <div className="text-xs text-zinc-500">≈ {formatKm(annual.kmDriven)} driven (petrol car)</div>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                      <div className="text-[10px] uppercase tracking-wide text-emerald-700">Shifting to greenest window</div>
                      <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-800">{annualShifted.kgPerYear.toFixed(2)}<span className="ml-1 text-base font-medium text-emerald-700/70">kg</span></div>
                      <div className="text-xs text-emerald-700/80">≈ {formatKm(annualShifted.kmDriven)} driven</div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">UK average petrol car ≈ 170 gCO₂/km. Smartphone manufacturing ≈ 70 kg CO₂ per device.</p>
                </div>
              )}

              {mmu && (
                <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-sky-700">If every MMU student shifted</h3>
                  <p className="text-xs text-sky-700/70">≈ 25,000 students, one daily charge each</p>
                  <div className="mt-3">
                    <div className="text-4xl font-bold tabular-nums text-sky-900">
                      {mmu.tonnesPerYear < 0.01
                        ? `${(mmu.tonnesPerYear * 1000).toFixed(1)} kg`
                        : `${mmu.tonnesPerYear.toFixed(2)} t`}
                      <span className="ml-1 text-base font-medium text-sky-700/70">CO₂/yr saved</span>
                    </div>
                    <div className="mt-1 text-sm text-sky-700">
                      ≈ {mmu.carsOffRoad.toFixed(1)} average UK cars taken off the road for a year
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-sky-700/60">Same charge, same battery, same device — just timed for greener grid.</p>
                </div>
              )}
            </div>

            {/* did you know */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Did you know</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DidYouKnow title="Wireless wastes ~35%" body="Qi wireless drops to ~65% efficiency. Slow wired charging is closer to 88%." />
                <DidYouKnow title="The last 20% is slowest" body="Lithium-ion charges fastest 20–80%. Beyond 80% takes disproportionately more time and energy." />
                <DidYouKnow title="Heat = wasted energy" body="Using a phone while charging makes it hotter — both the battery and chipset waste more electricity as heat." />
                <DidYouKnow title="Embodied > operational" body="Manufacturing an iPhone emits ~70 kg CO₂ — equal to 2–3 years of typical charging. Keeping a device longer beats green charging." />
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-12 border-t border-zinc-200 pt-5 text-xs text-zinc-500">
          Live UK grid data: <a className="underline hover:text-zinc-700" href="https://carbonintensity.org.uk/" target="_blank" rel="noopener">National Grid ESO Carbon Intensity API</a>.
          Built for the <a className="underline hover:text-zinc-700" href="https://greencompute.uk/" target="_blank" rel="noopener">MMU Sustainable Computing Hackathon 2026</a>.
          Carbon estimates are first-order — read more on <a className="underline hover:text-zinc-700" href="https://greencompute.uk/Measurement/CarbonFootprint" target="_blank" rel="noopener">methodology</a>.
        </footer>
      </div>
    </main>
  );
}

function BoltMark({ color }: { color: string }) {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-xl shadow-sm ring-1 ring-zinc-200" style={{ background: `${color}15` }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill={color} stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function LiveGridPill({
  shortname, ci, idx, topFuel, loading, error,
}: {
  shortname?: string;
  ci: number | null;
  idx: Period["intensity"]["index"] | null;
  topFuel: { fuel: string; perc: number } | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-500">loading grid…</span>;
  if (error)   return <span className="rounded-full bg-rose-100 px-3 py-1 text-xs text-rose-700">{error}</span>;
  if (ci == null || !idx) return null;
  const cls = INDEX_BG[idx];
  return (
    <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${cls}`}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: INDEX_COLOR[idx] }} />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: INDEX_COLOR[idx] }} />
      </span>
      <span className="font-semibold">{shortname ?? "UK"}</span>
      <span className="opacity-50">·</span>
      <span className="tabular-nums">{ci} gCO₂/kWh</span>
      <span className="opacity-50">·</span>
      <span className="uppercase tracking-wide">{idx}</span>
      {topFuel && (
        <>
          <span className="opacity-50">·</span>
          <span className="capitalize">{topFuel.fuel} {topFuel.perc.toFixed(0)}%</span>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}

function RangeRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 shrink-0 text-xs text-zinc-500">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-emerald-600"
      />
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums">{value}%</span>
    </div>
  );
}

function KpiCard({ eyebrow, value, sub, accent }: { eyebrow: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{eyebrow}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums leading-tight" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function DidYouKnow({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
      <div className="text-xs font-semibold text-amber-900">💡 {title}</div>
      <div className="mt-1.5 text-xs leading-relaxed text-amber-900/80">{body}</div>
    </div>
  );
}
