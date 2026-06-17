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

export const METRIC_RANGES: Record<
  keyof Omit<WaterTestFormData, "tankName" | "tankId" | "waterChange" | "note">,
  { ok: [number, number]; watch: [number, number]; unit: string; label: string }
> = {
  ph: { ok: [6.5, 7.5], watch: [6.0, 8.0], unit: "", label: "pH" },
  ammonia: { ok: [0, 0], watch: [0, 0.25], unit: "ppm", label: "氨氮" },
  nitrite: { ok: [0, 0], watch: [0, 0.5], unit: "ppm", label: "亚硝酸盐" },
  nitrate: { ok: [0, 20], watch: [0, 40], unit: "ppm", label: "硝酸盐" },
  hardness: { ok: [4, 12], watch: [2, 18], unit: "dGH", label: "硬度" },
  temperature: { ok: [24, 28], watch: [20, 32], unit: "°C", label: "温度" },
};

export type RecordStatus = "稳定" | "关注" | "异常";
