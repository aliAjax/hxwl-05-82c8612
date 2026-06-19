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
  lowRiskReasons?: string[];
}

export interface TankRiskContext {
  tank: TankProfile;
  records: WaterRecord[];
  plans: WaterChangePlan[];
  alerts: AlertItem[];
}

export { getRiskScoreConfig, getRiskLevelThresholds } from "../ruleConfig/ruleEngine";
