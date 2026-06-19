export interface WaterTestFormData {
  tankName: string;
  tankId?: string;
  ph: string;
  ammonia: string;
  nitrite: string;
  nitrate: string;
  hardness: string;
  temperature: string;
  waterChange: string;
  note: string;
}

export interface WaterChangeTaskFormData {
  tankName: string;
  tankId?: string;
  waterRatio: string;
  note: string;
  addDechlorinator: boolean;
  checkTemperature: boolean;
  checkPH: boolean;
}

export type RecordStatus = "稳定" | "关注" | "异常";
