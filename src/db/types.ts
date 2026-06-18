import type { AlertItem } from "../alertCenter/types";

export type RecordStatus = "稳定" | "关注" | "异常";

export interface WaterMetrics {
  ph: string;
  ammonia: string;
  nitrite: string;
  nitrate: string;
  hardness: string;
  temperature: string;
  waterChange: string;
}

export type PlanStatus = "normal" | "upcoming" | "overdue" | "completed";

export type ThresholdMetric = "ph" | "nitrate" | "hardness" | "temperature";

export interface MetricRange {
  ok: [number, number];
  watch: [number, number];
}

export type CustomThresholds = Partial<Record<ThresholdMetric, MetricRange>>;

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  maintainer: string;
  createdAt: string;
}

export interface TankProfile {
  id: string;
  name: string;
  tankType: string;
  capacity: string;
  setupDate: string;
  mainCreatures: string;
  maintainer: string;
  customerId?: string;
  customThresholds?: CustomThresholds;
}

export interface WaterRecord {
  id: string;
  tankName: string;
  tankId?: string;
  recordedAt: string;
  metrics: WaterMetrics;
  status: RecordStatus;
  note: string;
}

export interface WaterChangePlan {
  id: string;
  tankName: string;
  tankId?: string;
  cycleDays: string;
  waterRatio: string;
  nextDate: string;
  note: string;
  completedAt?: string;
  createdAt: string;
}

export type { AlertItem };

export interface AppData {
  customers: Customer[];
  tanks: TankProfile[];
  waterRecords: WaterRecord[];
  waterChangePlans: WaterChangePlan[];
  alerts: AlertItem[];
}

export type StoreName = "customers" | "tanks" | "waterRecords" | "waterChangePlans" | "alerts";

export const STORE_NAMES: StoreName[] = [
  "customers",
  "tanks",
  "waterRecords",
  "waterChangePlans",
  "alerts",
];
