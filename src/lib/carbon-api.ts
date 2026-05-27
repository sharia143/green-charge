const BASE = "https://api.carbonintensity.org.uk";

export type CIIndex = "very low" | "low" | "moderate" | "high" | "very high";

export type Period = {
  from: string;
  to: string;
  intensity: { forecast: number; actual?: number; index: CIIndex };
  generationmix?: { fuel: string; perc: number }[];
};

export type RegionalForecast = {
  regionid: number;
  shortname: string;
  postcode: string;
  data: Period[];
};

function formatISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

export async function fetchCurrentNational(): Promise<Period> {
  const res = await fetch(`${BASE}/intensity`);
  if (!res.ok) throw new Error(`carbonintensity.org.uk ${res.status}`);
  const json = await res.json();
  return json.data[0];
}

export async function fetchForecastByPostcode(postcode: string): Promise<RegionalForecast> {
  const from = formatISO(new Date());
  const url = `${BASE}/regional/intensity/${from}/fw48h/postcode/${encodeURIComponent(postcode.toUpperCase())}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`carbonintensity.org.uk ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "API error");
  return json.data as RegionalForecast;
}

export type GreenWindow = { from: string; to: string; avgCI: number };

export function findGreenestWindow(periods: Period[], windowHours: number): GreenWindow {
  const slots = windowHours * 2;
  if (periods.length < slots) {
    return { from: periods[0].from, to: periods[periods.length - 1].to, avgCI: avgCI(periods) };
  }
  let best = { idx: 0, avg: Infinity };
  for (let i = 0; i + slots <= periods.length; i++) {
    const avg = avgCI(periods.slice(i, i + slots));
    if (avg < best.avg) best = { idx: i, avg };
  }
  return {
    from: periods[best.idx].from,
    to: periods[best.idx + slots - 1].to,
    avgCI: best.avg,
  };
}

export function avgCI(periods: Period[]): number {
  if (periods.length === 0) return 0;
  return periods.reduce((s, p) => s + p.intensity.forecast, 0) / periods.length;
}

export function ciIndex(gPerKWh: number): CIIndex {
  if (gPerKWh < 50) return "very low";
  if (gPerKWh < 150) return "low";
  if (gPerKWh < 300) return "moderate";
  if (gPerKWh < 450) return "high";
  return "very high";
}
