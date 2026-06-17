export type TrendMetric = "ph" | "ammonia" | "nitrate" | "temperature";

export interface TrendDataPoint {
  timestamp: number;
  value: number;
  status: "normal" | "warning" | "danger";
}

export interface TankTrendData {
  tankId: string;
  tankName: string;
  tankType: string;
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

export const TREND_METRICS: TrendMetric[] = ["ph", "ammonia", "nitrate", "temperature"];

export function evaluateDataPoint(
  metric: TrendMetric,
  value: number
): "normal" | "warning" | "danger" {
  const range = METRIC_RANGES[metric];
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
