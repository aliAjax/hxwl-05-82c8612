export type TrendMetric = "ph" | "ammonia" | "nitrate" | "temperature";

export type TrendTankType = "草缸" | "海缸" | "三湖缸" | "繁殖缸";

export interface TrendThresholdRange {
  ok: [number, number];
  warning: [number, number];
}

export type TrendCustomThresholds = Partial<
  Record<TrendMetric, TrendThresholdRange>
>;

export interface TrendDataPoint {
  timestamp: number;
  value: number;
  status: "normal" | "warning" | "danger";
}

export interface TankTrendData {
  tankId: string;
  tankName: string;
  tankType: string;
  customThresholds?: TrendCustomThresholds;
  metrics: Record<TrendMetric, TrendDataPoint[]>;
}

export interface MetricRange {
  ok: [number, number];
  warning: [number, number];
  unit: string;
  label: string;
  color: string;
}

export const METRIC_RANGES: Record<TrendMetric, MetricRange> = {
  ph: {
    ok: [6.5, 7.5],
    warning: [6.0, 8.0],
    unit: "",
    label: "pH",
    color: "#0891b2",
  },
  ammonia: {
    ok: [0, 0],
    warning: [0, 0.25],
    unit: "ppm",
    label: "氨氮",
    color: "#f59e0b",
  },
  nitrate: {
    ok: [0, 20],
    warning: [0, 40],
    unit: "ppm",
    label: "硝酸盐",
    color: "#8b5cf6",
  },
  temperature: {
    ok: [24, 28],
    warning: [20, 32],
    unit: "°C",
    label: "温度",
    color: "#16a34a",
  },
};

const TANK_TYPE_RANGES: Record<
  TrendTankType,
  Partial<Record<TrendMetric, { ok: [number, number]; warning: [number, number] }>>
> = {
  草缸: {
    ph: { ok: [6.0, 7.0], warning: [5.5, 7.5] },
    nitrate: { ok: [0, 20], warning: [0, 40] },
    temperature: { ok: [24, 28], warning: [22, 30] },
  },
  海缸: {
    ph: { ok: [8.0, 8.4], warning: [7.8, 8.6] },
    nitrate: { ok: [0, 5], warning: [0, 10] },
    temperature: { ok: [25, 27], warning: [24, 28] },
  },
  三湖缸: {
    ph: { ok: [7.8, 8.6], warning: [7.5, 9.0] },
    nitrate: { ok: [0, 30], warning: [0, 60] },
    temperature: { ok: [25, 28], warning: [23, 30] },
  },
  繁殖缸: {
    ph: { ok: [6.5, 7.2], warning: [6.0, 7.6] },
    nitrate: { ok: [0, 10], warning: [0, 20] },
    temperature: { ok: [25, 27], warning: [24, 28] },
  },
};

export const TREND_METRICS: TrendMetric[] = ["ph", "ammonia", "nitrate", "temperature"];

const VALID_TANK_TYPES: TrendTankType[] = ["草缸", "海缸", "三湖缸", "繁殖缸"];

export function getMetricRangeByTankType(
  metric: TrendMetric,
  tankType?: string,
  customThresholds?: TrendCustomThresholds
): MetricRange {
  const baseRange = METRIC_RANGES[metric];
  if (customThresholds && customThresholds[metric]) {
    const custom = customThresholds[metric]!;
    return {
      ...baseRange,
      ok: custom.ok,
      warning: custom.warning,
    };
  }
  if (!tankType) return baseRange;
  const validType = VALID_TANK_TYPES.includes(tankType as TrendTankType)
    ? (tankType as TrendTankType)
    : null;
  if (!validType) return baseRange;
  const typeOverride = TANK_TYPE_RANGES[validType][metric];
  if (!typeOverride) return baseRange;
  return {
    ...baseRange,
    ok: typeOverride.ok,
    warning: typeOverride.warning,
  };
}

export function evaluateDataPoint(
  metric: TrendMetric,
  value: number,
  tankType?: string,
  customThresholds?: TrendCustomThresholds
): "normal" | "warning" | "danger" {
  const range = getMetricRangeByTankType(metric, tankType, customThresholds);
  const isZeroRange = range.ok[0] === 0 && range.ok[1] === 0;

  if (value < range.warning[0] || value > range.warning[1]) return "danger";

  if (isZeroRange) {
    if (value <= 0) return "normal";
    if (value <= range.warning[1] * 0.5) return "warning";
    return "danger";
  }

  if (value < range.ok[0] || value > range.ok[1]) return "warning";
  return "normal";
}
