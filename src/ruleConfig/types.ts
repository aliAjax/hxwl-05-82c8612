export type RuleMetric =
  | "ph"
  | "ammonia"
  | "nitrite"
  | "nitrate"
  | "hardness"
  | "temperature";

export type TankType = "草缸" | "海缸" | "三湖缸" | "繁殖缸";

export const RULE_TANK_TYPES: TankType[] = ["草缸", "海缸", "三湖缸", "繁殖缸"];

export const RULE_METRICS: RuleMetric[] = [
  "ph",
  "ammonia",
  "nitrite",
  "nitrate",
  "hardness",
  "temperature",
];

export const RULE_METRIC_LABELS: Record<RuleMetric, string> = {
  ph: "pH",
  ammonia: "氨氮",
  nitrite: "亚硝酸盐",
  nitrate: "硝酸盐",
  hardness: "硬度",
  temperature: "温度",
};

export const RULE_METRIC_UNITS: Record<RuleMetric, string> = {
  ph: "",
  ammonia: "ppm",
  nitrite: "ppm",
  nitrate: "ppm",
  hardness: "dGH",
  temperature: "°C",
};

export const RULE_METRIC_STEPS: Record<RuleMetric, string> = {
  ph: "0.1",
  ammonia: "0.01",
  nitrite: "0.01",
  nitrate: "1",
  hardness: "1",
  temperature: "0.5",
};

export const RULE_METRIC_ORDER: RuleMetric[] = [
  "ph",
  "ammonia",
  "nitrite",
  "nitrate",
  "hardness",
  "temperature",
];

export interface MetricRule {
  ok: [number, number];
  watch: [number, number];
  severe: [number, number];
  unit: string;
  label: string;
  step: string;
}

export type TankTypeRules = Record<RuleMetric, MetricRule>;

export interface RiskScoreConfig {
  single_threshold_mild: number;
  single_threshold_severe: number;
  continuous_rise_mild: number;
  continuous_rise_severe: number;
  rapid_fluctuation_mild: number;
  rapid_fluctuation_severe: number;
  no_water_change_mild: number;
  no_water_change_severe: number;
  retest_still_abnormal_mild: number;
  retest_still_abnormal_severe: number;
  capacity_sensitivity: number;
  multiple_metrics_bonus: number;
}

export interface RiskLevelThresholds {
  low: number;
  medium: number;
  high: number;
}

export interface RetestDelayConfig {
  复测: number;
  换水: number;
  停喂: number;
  补菌: number;
  "温度调整": number;
  其他: number;
}

export type TreatmentAction = "换水" | "停喂" | "补菌" | "复测" | "温度调整" | "其他";

export const TREATMENT_ACTIONS: TreatmentAction[] = [
  "换水",
  "停喂",
  "补菌",
  "复测",
  "温度调整",
  "其他",
];

export interface RuleConfig {
  tankTypeRules: Record<TankType, TankTypeRules>;
  riskScoreConfig: RiskScoreConfig;
  riskLevelThresholds: RiskLevelThresholds;
  retestDelayConfig: RetestDelayConfig;
  updatedAt: string;
}

export type MetricEvalStatus = "ok" | "mild" | "severe";

export type RecordStatus = "稳定" | "关注" | "异常";

export interface MetricEvalResult {
  status: MetricEvalStatus;
  rule: MetricRule;
  recordStatus: RecordStatus;
}

export interface RecordEvalResult {
  status: RecordStatus;
  note: string;
}
