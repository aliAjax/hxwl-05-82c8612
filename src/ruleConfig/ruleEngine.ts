import {
  type RuleConfig,
  type TankType,
  type RuleMetric,
  type MetricRule,
  type MetricEvalStatus,
  type MetricEvalResult,
  type RecordEvalResult,
  type RecordStatus,
  type RiskScoreConfig,
  type RiskLevelThresholds,
  type RetestDelayConfig,
  type TankTypeRules,
  RULE_TANK_TYPES,
  RULE_METRICS,
  RULE_METRIC_LABELS,
  RULE_METRIC_UNITS,
  RULE_METRIC_STEPS,
} from "./types";
import type { WaterMetrics } from "../db/types";
import type { CustomThresholds, ThresholdMetric } from "../db/types";

const STORAGE_KEY = "aquarium_rule_config_v1";

function makeMetricRule(
  ok: [number, number],
  watch: [number, number],
  severe: [number, number],
  unit: string,
  label: string,
  step: string
): MetricRule {
  return { ok, watch, severe, unit, label, step };
}

function makeTankRules(
  rules: Record<RuleMetric, { ok: [number, number]; watch: [number, number]; severe: [number, number] }>
): TankTypeRules {
  const result: Partial<TankTypeRules> = {};
  for (const key of RULE_METRICS) {
    const r = rules[key];
    result[key] = makeMetricRule(
      r.ok,
      r.watch,
      r.severe,
      RULE_METRIC_UNITS[key],
      RULE_METRIC_LABELS[key],
      RULE_METRIC_STEPS[key]
    );
  }
  return result as TankTypeRules;
}

const DEFAULT_TANK_TYPE_RULES: Record<TankType, TankTypeRules> = {
  草缸: makeTankRules({
    ph: { ok: [6.0, 7.0], watch: [5.5, 7.5], severe: [5.0, 8.0] },
    ammonia: { ok: [0, 0], watch: [0, 0.2], severe: [0, 0.5] },
    nitrite: { ok: [0, 0], watch: [0, 0.3], severe: [0, 0.8] },
    nitrate: { ok: [0, 20], watch: [0, 40], severe: [0, 60] },
    hardness: { ok: [4, 10], watch: [2, 14], severe: [0, 18] },
    temperature: { ok: [24, 28], watch: [22, 30], severe: [20, 32] },
  }),
  海缸: makeTankRules({
    ph: { ok: [8.0, 8.4], watch: [7.8, 8.6], severe: [7.6, 8.8] },
    ammonia: { ok: [0, 0], watch: [0, 0.1], severe: [0, 0.3] },
    nitrite: { ok: [0, 0], watch: [0, 0.2], severe: [0, 0.5] },
    nitrate: { ok: [0, 5], watch: [0, 10], severe: [0, 20] },
    hardness: { ok: [8, 12], watch: [7, 15], severe: [6, 18] },
    temperature: { ok: [25, 27], watch: [24, 28], severe: [23, 30] },
  }),
  三湖缸: makeTankRules({
    ph: { ok: [7.8, 8.6], watch: [7.5, 9.0], severe: [7.2, 9.5] },
    ammonia: { ok: [0, 0], watch: [0, 0.2], severe: [0, 0.5] },
    nitrite: { ok: [0, 0], watch: [0, 0.3], severe: [0, 0.8] },
    nitrate: { ok: [0, 30], watch: [0, 60], severe: [0, 80] },
    hardness: { ok: [10, 20], watch: [8, 25], severe: [6, 30] },
    temperature: { ok: [25, 28], watch: [23, 30], severe: [21, 32] },
  }),
  繁殖缸: makeTankRules({
    ph: { ok: [6.5, 7.2], watch: [6.0, 7.6], severe: [5.5, 8.0] },
    ammonia: { ok: [0, 0], watch: [0, 0.05], severe: [0, 0.15] },
    nitrite: { ok: [0, 0], watch: [0, 0.1], severe: [0, 0.3] },
    nitrate: { ok: [0, 10], watch: [0, 20], severe: [0, 30] },
    hardness: { ok: [3, 8], watch: [2, 12], severe: [1, 15] },
    temperature: { ok: [25, 27], watch: [24, 28], severe: [23, 30] },
  }),
};

const DEFAULT_RISK_SCORE_CONFIG: RiskScoreConfig = {
  single_threshold_mild: 5,
  single_threshold_severe: 15,
  continuous_rise_mild: 10,
  continuous_rise_severe: 25,
  rapid_fluctuation_mild: 8,
  rapid_fluctuation_severe: 20,
  no_water_change_mild: 8,
  no_water_change_severe: 20,
  retest_still_abnormal_mild: 12,
  retest_still_abnormal_severe: 30,
  capacity_sensitivity: 5,
  multiple_metrics_bonus: 10,
};

const DEFAULT_RISK_LEVEL_THRESHOLDS: RiskLevelThresholds = {
  low: 10,
  medium: 25,
  high: 50,
};

const DEFAULT_RETEST_DELAY_CONFIG: RetestDelayConfig = {
  复测: 1,
  换水: 3,
  停喂: 2,
  补菌: 3,
};

export function getDefaultRuleConfig(): RuleConfig {
  return {
    tankTypeRules: JSON.parse(JSON.stringify(DEFAULT_TANK_TYPE_RULES)),
    riskScoreConfig: { ...DEFAULT_RISK_SCORE_CONFIG },
    riskLevelThresholds: { ...DEFAULT_RISK_LEVEL_THRESHOLDS },
    retestDelayConfig: { ...DEFAULT_RETEST_DELAY_CONFIG },
    updatedAt: new Date().toISOString(),
  };
}

let cachedConfig: RuleConfig | null = null;

export function loadRuleConfig(): RuleConfig {
  if (cachedConfig) return cachedConfig;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as RuleConfig;
      let needsMigration = false;
      for (const tankType of RULE_TANK_TYPES) {
        if (!parsed.tankTypeRules[tankType]) {
          parsed.tankTypeRules[tankType] = DEFAULT_TANK_TYPE_RULES[tankType];
          needsMigration = true;
        } else {
          for (const metric of RULE_METRICS) {
            if (!parsed.tankTypeRules[tankType][metric]) {
              parsed.tankTypeRules[tankType][metric] =
                DEFAULT_TANK_TYPE_RULES[tankType][metric];
              needsMigration = true;
            } else if (!parsed.tankTypeRules[tankType][metric].severe) {
              const existing = parsed.tankTypeRules[tankType][metric];
              const defaults = DEFAULT_TANK_TYPE_RULES[tankType][metric];
              parsed.tankTypeRules[tankType][metric] = {
                ...existing,
                severe: defaults.severe,
                step: defaults.step,
              };
              needsMigration = true;
            }
          }
        }
      }
      if (needsMigration) {
        saveRuleConfig(parsed);
      }
      cachedConfig = parsed;
      return parsed;
    }
  } catch {
    // ignore
  }
  const defaults = getDefaultRuleConfig();
  cachedConfig = defaults;
  return defaults;
}

export function saveRuleConfig(config: RuleConfig): void {
  config.updatedAt = new Date().toISOString();
  cachedConfig = config;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetRuleConfig(): RuleConfig {
  const defaults = getDefaultRuleConfig();
  cachedConfig = defaults;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  return defaults;
}

export function getMetricRule(
  tankType: string,
  metric: RuleMetric,
  customThresholds?: CustomThresholds
): MetricRule {
  const config = loadRuleConfig();
  const validType = (RULE_TANK_TYPES as string[]).includes(tankType)
    ? (tankType as TankType)
    : "草缸";
  const baseRule = config.tankTypeRules[validType][metric];

  const customizableMetrics: ThresholdMetric[] = [
    "ph",
    "nitrate",
    "hardness",
    "temperature",
  ];
  if (
    customThresholds &&
    (customizableMetrics as string[]).includes(metric)
  ) {
    const custom = customThresholds[metric as ThresholdMetric];
    if (custom) {
      return {
        ...baseRule,
        ok: custom.ok,
        watch: custom.watch,
      };
    }
  }

  return baseRule;
}

export function evaluateMetricValue(
  tankType: string,
  metric: RuleMetric,
  rawValue: string,
  customThresholds?: CustomThresholds
): MetricEvalResult | null {
  const value = parseFloat(rawValue);
  if (isNaN(value)) return null;

  const rule = getMetricRule(tankType, metric, customThresholds);
  const [severeMin, severeMax] = rule.severe;
  const [watchMin, watchMax] = rule.watch;
  const [okMin, okMax] = rule.ok;

  if (value < severeMin || value > severeMax) {
    return {
      status: "severe",
      rule,
      recordStatus: "异常",
    };
  }

  if (value < watchMin || value > watchMax) {
    return {
      status: "severe",
      rule,
      recordStatus: "异常",
    };
  }

  const isZeroRange = okMin === 0 && okMax === 0;
  if (isZeroRange) {
    if (value <= 0) return { status: "ok", rule, recordStatus: "稳定" };
    const mildMid = watchMax * 0.5;
    if (value <= mildMid)
      return { status: "mild", rule, recordStatus: "关注" };
    return { status: "severe", rule, recordStatus: "异常" };
  }

  if (value < okMin || value > okMax) {
    return { status: "mild", rule, recordStatus: "关注" };
  }

  return { status: "ok", rule, recordStatus: "稳定" };
}

export function evaluateRecordStatus(
  metrics: WaterMetrics,
  tank?: { tankType: string; customThresholds?: CustomThresholds }
): RecordEvalResult {
  const metricKeys = RULE_METRICS;
  const issues: {
    key: RuleMetric;
    status: RecordStatus;
    rule: MetricRule;
  }[] = [];
  let overall: RecordStatus = "稳定";

  for (const key of metricKeys) {
    const raw = metrics[key];
    if (!raw || !raw.trim()) continue;
    const result = evaluateMetricValue(
      tank?.tankType || "草缸",
      key,
      raw,
      tank?.customThresholds
    );
    if (!result || result.status === "ok") continue;
    issues.push({ key, status: result.recordStatus, rule: result.rule });
    if (result.recordStatus === "异常") overall = "异常";
    else if (result.recordStatus === "关注" && overall !== "异常")
      overall = "关注";
  }

  let note = "";
  if (issues.length === 0) {
    note = "各项指标正常，继续保持";
  } else {
    const dangerItems = issues.filter((i) => i.status === "异常");
    const watchItems = issues.filter((i) => i.status === "关注");
    const parts: string[] = [];
    if (dangerItems.length > 0) {
      parts.push(
        dangerItems
          .map((i) => `${i.rule.label}${metrics[i.key]}${i.rule.unit}异常`)
          .join("、")
      );
    }
    if (watchItems.length > 0) {
      parts.push(
        watchItems
          .map((i) => `${i.rule.label}${metrics[i.key]}需关注`)
          .join("、")
      );
    }
    note = parts.join("；");
    if (metrics.waterChange && metrics.waterChange.trim()) {
      note += `；本次换水${metrics.waterChange}`;
    }
    if (dangerItems.length > 0) {
      note += "，建议立即处理";
    }
  }
  return { status: overall, note };
}

export function getRiskScoreConfig(): RiskScoreConfig {
  const config = loadRuleConfig();
  return config.riskScoreConfig;
}

export function getRiskLevelThresholds(): RiskLevelThresholds {
  const config = loadRuleConfig();
  return config.riskLevelThresholds;
}

export function getRetestDelayConfig(): RetestDelayConfig {
  const config = loadRuleConfig();
  return config.retestDelayConfig;
}

export function getAlertMetricKeys(): RuleMetric[] {
  return [...RULE_METRICS];
}

export function formatThresholdRange(rule: MetricRule): string {
  const { ok, watch, unit } = rule;
  const okStr = `${ok[0]}${unit} ~ ${ok[1]}${unit}`;
  const watchStr = `${watch[0]}${unit} ~ ${watch[1]}${unit}`;
  return `安全:${okStr} / 关注:${watchStr}`;
}

export function buildAlertDescription(
  metricLabel: string,
  value: string,
  unit: string,
  severity: "mild" | "severe",
  rule: MetricRule
): string {
  const v = parseFloat(value);
  const [okMin, okMax] = rule.ok;
  const [watchMin, watchMax] = rule.watch;
  const [severeMin, severeMax] = rule.severe;

  let direction = "";
  if (v < severeMin) direction = "远低于下限";
  else if (v > severeMax) direction = "远高于上限";
  else if (v < watchMin) direction = "低于关注范围";
  else if (v > watchMax) direction = "高于关注范围";
  else if (v < okMin) direction = "略低于安全范围";
  else if (v > okMax) direction = "略高于安全范围";

  const level = severity === "severe" ? "严重异常" : "轻微关注";
  return `${metricLabel} ${value}${unit} ${direction}，属于${level}，安全范围为 ${okMin}${unit} ~ ${okMax}${unit}`;
}

export function evaluateDataPoint(
  metric: RuleMetric,
  value: number,
  tankType?: string,
  customThresholds?: CustomThresholds
): "normal" | "warning" | "danger" {
  const rule = getMetricRule(tankType || "草缸", metric, customThresholds);
  const isZeroRange = rule.ok[0] === 0 && rule.ok[1] === 0;

  if (value < rule.severe[0] || value > rule.severe[1]) return "danger";
  if (value < rule.watch[0] || value > rule.watch[1]) return "danger";

  if (isZeroRange) {
    if (value <= 0) return "normal";
    if (value <= rule.watch[1] * 0.5) return "warning";
    return "danger";
  }

  if (value < rule.ok[0] || value > rule.ok[1]) return "warning";
  return "normal";
}

export type { MetricRule as MetricThreshold };

export { DEFAULT_TANK_TYPE_RULES };
