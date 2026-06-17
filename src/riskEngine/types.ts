import type { RecordStatus, WaterMetrics, WaterRecord, TankProfile, WaterChangePlan } from "../db/types";
import type { AlertItem, TankType, AlertMetric } from "../alertCenter/types";

export type RiskLevel = "低风险" | "中风险" | "高风险" | "严重风险";

export type RiskFactorType =
  | "single_threshold"
  | "continuous_rise"
  | "rapid_fluctuation"
  | "no_water_change_long"
  | "retest_still_abnormal"
  | "capacity_sensitivity"
  | "multiple_abnormal_metrics";

export interface RiskFactor {
  type: RiskFactorType;
  severity: "mild" | "severe";
  metric?: AlertMetric;
  metricLabel?: string;
  description: string;
  score: number;
  evidence?: string;
}

export interface RiskAssessmentResult {
  riskLevel: RiskLevel;
  recordStatus: RecordStatus;
  totalScore: number;
  factors: RiskFactor[];
  summary: string;
  recommendations: string[];
}

export interface TankRiskContext {
  tank: TankProfile;
  records: WaterRecord[];
  plans: WaterChangePlan[];
  alerts: AlertItem[];
}

export const RISK_LEVEL_THRESHOLDS = {
  low: 10,
  medium: 25,
  high: 50,
};

export const RISK_SCORE_CONFIG = {
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
