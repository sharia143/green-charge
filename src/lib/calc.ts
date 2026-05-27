import { ACTIVITY_EXTRA_W, Activity, Device } from "./devices";

export type ChargeMethod = "wired" | "fast" | "wireless";

export const METHOD_EFFICIENCY: Record<ChargeMethod, number> = {
  wired:    0.88,
  fast:     0.80,
  wireless: 0.65,
};

export const METHOD_LABEL: Record<ChargeMethod, string> = {
  wired:    "Slow wired (5–10W)",
  fast:     "Fast wired (20W+)",
  wireless: "Wireless (Qi)",
};

const WHILE_USE_PENALTY: Record<Activity, number> = {
  off:    1.0,
  light:  1.05,
  video:  1.10,
  call:   1.10,
  gaming: 1.25,
  ai:     1.18,
};

export type EnergyBreakdown = {
  batteryEnergyWh: number;
  chargingWh: number;
  activeUseWh: number;
  totalWh: number;
  totalKWh: number;
  penaltyFactor: number;
};

export function calcEnergy(args: {
  device: Device;
  startPct: number;
  endPct: number;
  method: ChargeMethod;
  activity: Activity;
  durationMinutes: number;
}): EnergyBreakdown {
  const deltaPct = Math.max(0, args.endPct - args.startPct);
  const batteryEnergyWh = args.device.batteryWh * (deltaPct / 100);
  const baseChargingWh = batteryEnergyWh / METHOD_EFFICIENCY[args.method];
  const penalty = WHILE_USE_PENALTY[args.activity];
  const chargingWh = baseChargingWh * penalty;

  const extraW = ACTIVITY_EXTRA_W[args.device.category][args.activity];
  const activeUseWh = args.activity === "off"
    ? 0
    : (args.device.idlePowerW + extraW) * (args.durationMinutes / 60);

  const totalWh = chargingWh + activeUseWh;
  return {
    batteryEnergyWh,
    chargingWh,
    activeUseWh,
    totalWh,
    totalKWh: totalWh / 1000,
    penaltyFactor: penalty,
  };
}

export function gramsCO2(kWh: number, gPerKWh: number): number {
  return kWh * gPerKWh;
}

export function formatGrams(g: number): string {
  if (g < 1) return `${(g * 1000).toFixed(0)} mg`;
  if (g < 1000) return `${g.toFixed(1)} g`;
  return `${(g / 1000).toFixed(2)} kg`;
}

export function formatKm(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(0)} km`;
}

export type AnnualImpact = {
  kgPerYear: number;
  kmDriven: number;
  smartphonesMade: number;
  treesNeeded: number;
};

// rough UK averages
const G_PER_KM_PETROL = 170;
const KG_PER_PHONE_MFG = 70;
const KG_PER_TREE_PER_YEAR = 21;

export function annualImpact(gramsPerCharge: number, chargesPerDay = 1): AnnualImpact {
  const gPerYear = gramsPerCharge * chargesPerDay * 365;
  const kgPerYear = gPerYear / 1000;
  return {
    kgPerYear,
    kmDriven: gPerYear / G_PER_KM_PETROL,
    smartphonesMade: kgPerYear / KG_PER_PHONE_MFG,
    treesNeeded: kgPerYear / KG_PER_TREE_PER_YEAR,
  };
}

export const MMU_STUDENT_COUNT = 25000;

export function mmuCampusImpact(gramsSavedPerCharge: number): { tonnesPerYear: number; carsOffRoad: number } {
  const totalGPerYear = gramsSavedPerCharge * MMU_STUDENT_COUNT * 365;
  const kgPerYear = totalGPerYear / 1000;
  const tonnesPerYear = kgPerYear / 1000;
  // an average UK car emits ~1.6 tonnes CO₂/year
  return { tonnesPerYear, carsOffRoad: tonnesPerYear / 1.6 };
}

export function formatTimeRange(fromIso: string, toIso: string): string {
  const f = new Date(fromIso);
  const t = new Date(toIso);
  const hh = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = f.toDateString() === t.toDateString();
  if (sameDay) return `${hh(f)} – ${hh(t)}`;
  return `${f.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} – ${t.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}`;
}
