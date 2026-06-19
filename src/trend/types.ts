import {
  getMetricRule,
  evaluateDataPoint,
} from "../ruleConfig/ruleEngine";
import {
  RULE_METRICS as TREND_METRICS_INTERNAL,
  RULE_METRIC_LABELS,
  RULE_METRIC_UNITS,
} from "../ruleConfig/types";
import type { RuleMetric, MetricRule } from "../ruleConfig/types";

export type TrendMetric = "ph" | "ammonia" | "nitrate" | "hardness" | "temperature";

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

const TREND_METRIC_LIST: TrendMetric[] = ["ph", "ammonia", "nitrate", "hardness", "temperature"];

const METRIC_RANGE_COLORS: Record<TrendMetric, string> = {
  ph: "#0891b2",
  ammonia: "#f59e0b",
  nitrate: "#8b5cf6",
  hardness: "#0f766e",
  temperature: "#16a34a",
};

export const METRIC_RANGES: Record<TrendMetric, MetricRange> = (() => {
  const result: Partial<Record<TrendMetric, MetricRange>> = {};
  for (const m of TREND_METRIC_LIST) {
    const rule = getMetricRule("草缸", m as RuleMetric);
    result[m] = {
      ok: rule.ok,
      warning: rule.watch,
      unit: rule.unit,
      label: rule.label,
      color: METRIC_RANGE_COLORS[m],
    };
  }
  return result as Record<TrendMetric, MetricRange>;
})();

export const TREND_METRICS: TrendMetric[] = [
  "ph",
  "ammonia",
  "nitrate",
  "hardness",
  "temperature",
];

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
  const rule = getMetricRule(tankType, metric as RuleMetric);
  return {
    ...baseRange,
    ok: rule.ok,
    warning: rule.watch,
  };
}

export { evaluateDataPoint };
