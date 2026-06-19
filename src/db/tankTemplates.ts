import type { ThresholdMetric, CustomThresholds } from "./types";
import { loadRuleConfig } from "../ruleConfig/ruleEngine";

export type TankTemplateType = "草缸" | "海缸" | "三湖缸" | "繁殖缸";

export const TANK_TEMPLATE_TYPES: TankTemplateType[] = [
  "草缸",
  "海缸",
  "三湖缸",
  "繁殖缸",
];

export const TEMPLATE_METRIC_LABELS: Record<ThresholdMetric, string> = {
  ph: "pH",
  nitrate: "硝酸盐",
  hardness: "硬度",
  temperature: "温度",
};

export const TEMPLATE_METRIC_UNITS: Record<ThresholdMetric, string> = {
  ph: "",
  nitrate: "ppm",
  hardness: "dGH",
  temperature: "°C",
};

export const TEMPLATE_METRIC_STEPS: Record<ThresholdMetric, string> = {
  ph: "0.1",
  nitrate: "1",
  hardness: "1",
  temperature: "0.5",
};

export const TANK_TEMPLATES: Record<
  TankTemplateType,
  { description: string; thresholds: Record<ThresholdMetric, { ok: [number, number]; watch: [number, number] }> }
> = {
  草缸: {
    description: "淡水水草造景缸，适合热带观赏鱼",
    thresholds: {
      ph: { ok: [6.0, 7.0], watch: [5.5, 7.5] },
      nitrate: { ok: [0, 20], watch: [0, 40] },
      hardness: { ok: [4, 10], watch: [2, 14] },
      temperature: { ok: [24, 28], watch: [22, 30] },
    },
  },
  海缸: {
    description: "海水珊瑚/观赏鱼缸，对水质要求严格",
    thresholds: {
      ph: { ok: [8.0, 8.4], watch: [7.8, 8.6] },
      nitrate: { ok: [0, 5], watch: [0, 10] },
      hardness: { ok: [8, 12], watch: [7, 15] },
      temperature: { ok: [25, 27], watch: [24, 28] },
    },
  },
  三湖缸: {
    description: "三湖慈鲷缸，喜高pH高硬度水质",
    thresholds: {
      ph: { ok: [7.8, 8.6], watch: [7.5, 9.0] },
      nitrate: { ok: [0, 30], watch: [0, 60] },
      hardness: { ok: [10, 20], watch: [8, 25] },
      temperature: { ok: [25, 28], watch: [23, 30] },
    },
  },
  繁殖缸: {
    description: "鱼苗/繁殖专用缸，水质需要特别稳定",
    thresholds: {
      ph: { ok: [6.5, 7.2], watch: [6.0, 7.6] },
      nitrate: { ok: [0, 10], watch: [0, 20] },
      hardness: { ok: [3, 8], watch: [2, 12] },
      temperature: { ok: [25, 27], watch: [24, 28] },
    },
  },
};

export const TEMPLATE_METRIC_ORDER: ThresholdMetric[] = [
  "ph",
  "temperature",
  "hardness",
  "nitrate",
];

export function getTemplateThresholds(
  tankType: string
): Record<ThresholdMetric, { ok: [number, number]; watch: [number, number] }> {
  const config = loadRuleConfig();
  const validType = TANK_TEMPLATE_TYPES.includes(tankType as TankTemplateType)
    ? (tankType as TankTemplateType)
    : "草缸";
  const result: Partial<Record<ThresholdMetric, { ok: [number, number]; watch: [number, number] }>> = {};
  for (const key of TEMPLATE_METRIC_ORDER) {
    const rule = config.tankTypeRules[validType][key];
    result[key] = { ok: rule.ok, watch: rule.watch };
  }
  return result as Record<ThresholdMetric, { ok: [number, number]; watch: [number, number] }>;
}

export function cloneTemplateThresholds(
  tankType: string
): CustomThresholds {
  const template = getTemplateThresholds(tankType);
  const result: CustomThresholds = {};
  for (const key of TEMPLATE_METRIC_ORDER) {
    result[key] = {
      ok: [...template[key].ok] as [number, number],
      watch: [...template[key].watch] as [number, number],
    };
  }
  return result;
}

export function getEffectiveThresholds(
  tank: { tankType: string; customThresholds?: CustomThresholds } | undefined,
  metric: ThresholdMetric
): { ok: [number, number]; watch: [number, number] } {
  const template = getTemplateThresholds(tank?.tankType || "草缸");
  const custom = tank?.customThresholds?.[metric];
  if (custom) {
    return custom;
  }
  return template[metric];
}

export function getAllEffectiveThresholds(
  tank: { tankType: string; customThresholds?: CustomThresholds } | undefined
): Record<ThresholdMetric, { ok: [number, number]; watch: [number, number] }> {
  const template = getTemplateThresholds(tank?.tankType || "草缸");
  const result: Record<string, { ok: [number, number]; watch: [number, number] }> = {};
  for (const key of TEMPLATE_METRIC_ORDER) {
    const custom = tank?.customThresholds?.[key];
    result[key] = custom ? custom : template[key];
  }
  return result as Record<ThresholdMetric, { ok: [number, number]; watch: [number, number] }>;
}
