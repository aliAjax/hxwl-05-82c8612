export type TankType = "草缸" | "海缸" | "三湖缸" | "繁殖缸";

export const TANK_TYPES: TankType[] = ["草缸", "海缸", "三湖缸", "繁殖缸"];

export type AlertMetric =
  | "ph"
  | "ammonia"
  | "nitrite"
  | "nitrate"
  | "hardness"
  | "temperature";

export type AlertSeverity = "mild" | "severe";

export type AlertStatus = "pending" | "processed";

export type TreatmentAction = "换水" | "停喂" | "补菌" | "复测";

export const TREATMENT_ACTIONS: TreatmentAction[] = [
  "换水",
  "停喂",
  "补菌",
  "复测",
];

export interface MetricThreshold {
  ok: [number, number];
  mild: [number, number];
  unit: string;
  label: string;
}

export type ThresholdConfig = Record<TankType, Record<AlertMetric, MetricThreshold>>;

export type RetestTaskStatus = "pending" | "completed" | "overdue";

export type RetestResult = "recovered" | "not_recovered" | null;

export interface RetestTask {
  id: string;
  sourceAlertId: string;
  sourceAlertMetric: AlertMetric;
  sourceAlertMetricLabel: string;
  tankName: string;
  tankId?: string;
  tankType: TankType | string;
  triggerTreatment: TreatmentAction;
  treatmentNote?: string;
  originalValue: string;
  originalUnit: string;
  thresholdRange: string;
  dueDate: string;
  status: RetestTaskStatus;
  retestRecordId?: string;
  retestValue?: string;
  retestResult: RetestResult;
  createdAt: string;
  completedAt?: string;
  handler?: string;
}

export interface AlertItem {
  id: string;
  tankName: string;
  tankId?: string;
  tankType: TankType | string;
  metric: AlertMetric;
  metricLabel: string;
  value: string;
  unit: string;
  severity: AlertSeverity;
  status: AlertStatus;
  thresholdRange: string;
  description: string;
  recordId: string;
  recordedAt: string;
  createdAt: string;
  processedAt?: string;
  treatment?: TreatmentAction;
  treatmentNote?: string;
  handler?: string;
  retestTaskId?: string;
  retestResult?: RetestResult;
  isClosed?: boolean;
  closedAt?: string;
}

export interface AlertMetricValues {
  ph: string;
  ammonia: string;
  nitrite: string;
  nitrate: string;
  hardness: string;
  temperature: string;
  waterChange: string;
}
