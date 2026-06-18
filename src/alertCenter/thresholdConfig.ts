import {
  TankType,
  AlertMetric,
  MetricThreshold,
  ThresholdConfig,
  TANK_TYPES,
} from "./types";
import type { CustomThresholds, ThresholdMetric } from "../db/types";
import { TEMPLATE_METRIC_UNITS, TEMPLATE_METRIC_LABELS } from "../db/tankTemplates";

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  草缸: {
    ph: { ok: [6.0, 7.0], mild: [5.5, 7.5], unit: "", label: "pH" },
    ammonia: { ok: [0, 0], mild: [0, 0.2], unit: "ppm", label: "氨氮" },
    nitrite: { ok: [0, 0], mild: [0, 0.3], unit: "ppm", label: "亚硝酸盐" },
    nitrate: { ok: [0, 20], mild: [0, 40], unit: "ppm", label: "硝酸盐" },
    hardness: { ok: [4, 10], mild: [2, 14], unit: "dGH", label: "硬度" },
    temperature: { ok: [24, 28], mild: [22, 30], unit: "°C", label: "温度" },
  },
  海缸: {
    ph: { ok: [8.0, 8.4], mild: [7.8, 8.6], unit: "", label: "pH" },
    ammonia: { ok: [0, 0], mild: [0, 0.1], unit: "ppm", label: "氨氮" },
    nitrite: { ok: [0, 0], mild: [0, 0.2], unit: "ppm", label: "亚硝酸盐" },
    nitrate: { ok: [0, 5], mild: [0, 10], unit: "ppm", label: "硝酸盐" },
    hardness: { ok: [8, 12], mild: [7, 15], unit: "dGH", label: "硬度" },
    temperature: { ok: [25, 27], mild: [24, 28], unit: "°C", label: "温度" },
  },
  三湖缸: {
    ph: { ok: [7.8, 8.6], mild: [7.5, 9.0], unit: "", label: "pH" },
    ammonia: { ok: [0, 0], mild: [0, 0.2], unit: "ppm", label: "氨氮" },
    nitrite: { ok: [0, 0], mild: [0, 0.3], unit: "ppm", label: "亚硝酸盐" },
    nitrate: { ok: [0, 30], mild: [0, 60], unit: "ppm", label: "硝酸盐" },
    hardness: { ok: [10, 20], mild: [8, 25], unit: "dGH", label: "硬度" },
    temperature: { ok: [25, 28], mild: [23, 30], unit: "°C", label: "温度" },
  },
  繁殖缸: {
    ph: { ok: [6.5, 7.2], mild: [6.0, 7.6], unit: "", label: "pH" },
    ammonia: { ok: [0, 0], mild: [0, 0.05], unit: "ppm", label: "氨氮" },
    nitrite: { ok: [0, 0], mild: [0, 0.1], unit: "ppm", label: "亚硝酸盐" },
    nitrate: { ok: [0, 10], mild: [0, 20], unit: "ppm", label: "硝酸盐" },
    hardness: { ok: [3, 8], mild: [2, 12], unit: "dGH", label: "硬度" },
    temperature: { ok: [25, 27], mild: [24, 28], unit: "°C", label: "温度" },
  },
};

const ALERT_METRIC_KEYS: AlertMetric[] = [
  "ph",
  "ammonia",
  "nitrite",
  "nitrate",
  "hardness",
  "temperature",
];

const CUSTOMIZABLE_METRICS: ThresholdMetric[] = [
  "ph",
  "nitrate",
  "hardness",
  "temperature",
];

export function getMetricThreshold(
  tankType: TankType | string,
  metric: AlertMetric,
  customThresholds?: CustomThresholds
): MetricThreshold {
  const validType = (TANK_TYPES as string[]).includes(tankType)
    ? (tankType as TankType)
    : "草缸";
  const defaultThreshold = DEFAULT_THRESHOLDS[validType][metric];

  if (
    customThresholds &&
    (CUSTOMIZABLE_METRICS as string[]).includes(metric)
  ) {
    const custom = customThresholds[metric as ThresholdMetric];
    if (custom) {
      return {
        ok: custom.ok,
        mild: custom.watch,
        unit: TEMPLATE_METRIC_UNITS[metric as ThresholdMetric],
        label: TEMPLATE_METRIC_LABELS[metric as ThresholdMetric],
      };
    }
  }

  return defaultThreshold;
}

export function evaluateMetricValue(
  tankType: TankType | string,
  metric: AlertMetric,
  rawValue: string,
  customThresholds?: CustomThresholds
): { status: "ok" | "mild" | "severe"; threshold: MetricThreshold } | null {
  const value = parseFloat(rawValue);
  if (isNaN(value)) return null;

  const threshold = getMetricThreshold(tankType, metric, customThresholds);
  const [mildMin, mildMax] = threshold.mild;
  const [okMin, okMax] = threshold.ok;

  if (value < mildMin || value > mildMax) {
    return { status: "severe", threshold };
  }

  const isZeroRange = okMin === 0 && okMax === 0;
  if (isZeroRange) {
    if (value <= 0) return { status: "ok", threshold };
    const mildMid = mildMax * 0.5;
    if (value <= mildMid) return { status: "mild", threshold };
    return { status: "severe", threshold };
  }

  if (value < okMin || value > okMax) {
    return { status: "mild", threshold };
  }

  return { status: "ok", threshold };
}

export function getAlertMetricKeys(): AlertMetric[] {
  return [...ALERT_METRIC_KEYS];
}

export function formatThresholdRange(threshold: MetricThreshold): string {
  const { ok, mild, unit } = threshold;
  const okStr = `${ok[0]}${unit} ~ ${ok[1]}${unit}`;
  const mildStr = `${mild[0]}${unit} ~ ${mild[1]}${unit}`;
  return `安全:${okStr} / 关注:${mildStr}`;
}

export function buildAlertDescription(
  metricLabel: string,
  value: string,
  unit: string,
  severity: "mild" | "severe",
  threshold: MetricThreshold
): string {
  const v = parseFloat(value);
  const [okMin, okMax] = threshold.ok;
  const [mildMin, mildMax] = threshold.mild;

  let direction = "";
  if (v < mildMin) direction = "低于下限";
  else if (v > mildMax) direction = "高于上限";
  else if (v < okMin) direction = "略低于安全范围";
  else if (v > okMax) direction = "略高于安全范围";

  const level = severity === "severe" ? "严重异常" : "轻微关注";
  return `${metricLabel} ${value}${unit} ${direction}，属于${level}，安全范围为 ${okMin}${unit} ~ ${okMax}${unit}`;
}
