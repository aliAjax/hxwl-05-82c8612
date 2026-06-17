import type { Customer } from "../db/types";
import type { TankProfile, WaterRecord, WaterChangePlan, RecordStatus } from "../App";
import type { RiskAssessmentResult, RiskLevel } from "../riskEngine";

export interface TankDashboardInfo {
  tank: TankProfile;
  customer?: Customer;
  latestRecord?: WaterRecord;
  nextPlan?: WaterChangePlan;
  riskLevel: RecordStatus;
  pendingAlerts: number;
  riskAssessment: RiskAssessmentResult;
}

export interface CustomerDashboardInfo {
  customer: Customer;
  tanks: TankDashboardInfo[];
  overallRisk: RecordStatus;
  overallRiskLevel: RiskLevel;
}

export type RiskFilter = "全部" | "稳定" | "关注" | "异常";
export type ViewMode = "byCustomer" | "flat";
