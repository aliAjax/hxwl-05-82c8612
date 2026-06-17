import type { TankProfile, WaterRecord, WaterChangePlan } from "../App";
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

export type { TankProfile, WaterRecord, WaterChangePlan, AlertItem };

export interface AppData {
  tanks: TankProfile[];
  waterRecords: WaterRecord[];
  waterChangePlans: WaterChangePlan[];
  alerts: AlertItem[];
}

export type StoreName = "tanks" | "waterRecords" | "waterChangePlans" | "alerts";

export const STORE_NAMES: StoreName[] = [
  "tanks",
  "waterRecords",
  "waterChangePlans",
  "alerts",
];
