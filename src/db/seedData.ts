import type { TankProfile, WaterRecord, WaterChangePlan } from "../App";
import type { AlertItem } from "../alertCenter/types";
import type { WaterMetrics } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
const now = new Date();

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatDateTime = (date: Date) =>
  `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

const daysAgo = (days: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
};

const daysLater = (days: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d;
};

export const seedTanks: TankProfile[] = [
  {
    id: "tank-seed-001",
    name: "草缸A",
    tankType: "草缸",
    capacity: "60L",
    setupDate: "2024-03-15",
    mainCreatures: "红绿灯、宝莲灯、迷你矮珍珠、莫斯",
    maintainer: "李师傅",
  },
  {
    id: "tank-seed-002",
    name: "海缸B",
    tankType: "海缸",
    capacity: "120L",
    setupDate: "2024-01-20",
    mainCreatures: "公子小丑、蓝吊、火柴头、纽扣珊瑚",
    maintainer: "王师傅",
  },
  {
    id: "tank-seed-003",
    name: "繁殖缸C",
    tankType: "繁殖缸",
    capacity: "40L",
    setupDate: "2024-05-10",
    mainCreatures: "孔雀鱼、玛丽鱼、繁殖盒",
    maintainer: "张师傅",
  },
  {
    id: "tank-seed-004",
    name: "三湖缸D",
    tankType: "三湖缸",
    capacity: "180L",
    setupDate: "2023-11-05",
    mainCreatures: "萨伊蓝、六间、马鲷、珍珠虎",
    maintainer: "赵师傅",
  },
  {
    id: "tank-seed-005",
    name: "草缸E",
    tankType: "草缸",
    capacity: "90L",
    setupDate: "2024-02-28",
    mainCreatures: "一眉道人、红鼻剪刀、挖耳草、牛毛毡",
    maintainer: "李师傅",
  },
];

const createWaterMetrics = (data: Partial<WaterMetrics>): WaterMetrics => ({
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  hardness: "",
  temperature: "",
  waterChange: "",
  ...data,
});

const METRIC_RANGES: Record<
  keyof Omit<WaterMetrics, "waterChange">,
  { ok: [number, number]; watch: [number, number]; unit: string; label: string }
> = {
  ph: { ok: [6.5, 7.5], watch: [6.0, 8.0], unit: "", label: "pH" },
  ammonia: { ok: [0, 0], watch: [0, 0.25], unit: "ppm", label: "氨氮" },
  nitrite: { ok: [0, 0], watch: [0, 0.5], unit: "ppm", label: "亚硝酸盐" },
  nitrate: { ok: [0, 20], watch: [0, 40], unit: "ppm", label: "硝酸盐" },
  hardness: { ok: [4, 12], watch: [2, 18], unit: "dGH", label: "硬度" },
  temperature: { ok: [24, 28], watch: [20, 32], unit: "°C", label: "温度" },
};

function evaluateMetric(
  key: keyof Omit<WaterMetrics, "waterChange">,
  raw: string
): "稳定" | "关注" | "异常" {
  const value = parseFloat(raw);
  if (isNaN(value)) return "稳定";
  const range = METRIC_RANGES[key];
  if (value < range.watch[0] || value > range.watch[1]) return "异常";
  if (value < range.ok[0] || value > range.ok[1]) return "关注";
  return "稳定";
}

function evaluateRecordStatus(metrics: WaterMetrics): {
  status: "稳定" | "关注" | "异常";
  note: string;
} {
  const metricKeys = Object.keys(METRIC_RANGES) as (keyof Omit<
    WaterMetrics,
    "waterChange"
  >)[];
  const issues: {
    key: keyof Omit<WaterMetrics, "waterChange">;
    status: "稳定" | "关注" | "异常";
  }[] = [];
  let overall: "稳定" | "关注" | "异常" = "稳定";

  for (const key of metricKeys) {
    const raw = metrics[key];
    if (!raw.trim()) continue;
    const st = evaluateMetric(key, raw);
    if (st !== "稳定") {
      issues.push({ key, status: st });
    }
    if (st === "异常") overall = "异常";
    else if (st === "关注" && overall !== "异常") overall = "关注";
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
          .map((i) => {
            const r = METRIC_RANGES[i.key];
            return `${r.label}${metrics[i.key]}${r.unit}异常`;
          })
          .join("、")
      );
    }
    if (watchItems.length > 0) {
      parts.push(
        watchItems
          .map((i) => `${METRIC_RANGES[i.key].label}${metrics[i.key]}需关注`)
          .join("、")
      );
    }
    note = parts.join("；");
    if (metrics.waterChange.trim()) {
      note += `；本次换水${metrics.waterChange}`;
    }
    if (dangerItems.length > 0) {
      note += "，建议立即处理";
    }
  }
  return { status: overall, note };
}

export const seedWaterRecords: WaterRecord[] = [
  {
    id: "record-seed-001",
    tankName: "草缸A",
    tankId: "tank-seed-001",
    recordedAt: formatDateTime(daysAgo(0)),
    metrics: createWaterMetrics({
      ph: "6.8",
      ammonia: "0",
      nitrite: "0",
      nitrate: "18",
      hardness: "8",
      temperature: "25.5",
    }),
    ...evaluateRecordStatus(
      createWaterMetrics({
        ph: "6.8",
        ammonia: "0",
        nitrite: "0",
        nitrate: "18",
        hardness: "8",
        temperature: "25.5",
      })
    ),
  },
  {
    id: "record-seed-002",
    tankName: "海缸B",
    tankId: "tank-seed-002",
    recordedAt: formatDateTime(daysAgo(1)),
    metrics: createWaterMetrics({
      ph: "8.1",
      ammonia: "0.01",
      nitrite: "0",
      nitrate: "8",
      hardness: "10",
      temperature: "26.0",
      waterChange: "20%",
    }),
    ...evaluateRecordStatus(
      createWaterMetrics({
        ph: "8.1",
        ammonia: "0.01",
        nitrite: "0",
        nitrate: "8",
        hardness: "10",
        temperature: "26.0",
        waterChange: "20%",
      })
    ),
  },
  {
    id: "record-seed-003",
    tankName: "繁殖缸C",
    tankId: "tank-seed-003",
    recordedAt: formatDateTime(daysAgo(2)),
    metrics: createWaterMetrics({
      ph: "7.2",
      ammonia: "0.05",
      nitrite: "0.3",
      nitrate: "25",
      hardness: "6",
      temperature: "27.5",
    }),
    ...evaluateRecordStatus(
      createWaterMetrics({
        ph: "7.2",
        ammonia: "0.05",
        nitrite: "0.3",
        nitrate: "25",
        hardness: "6",
        temperature: "27.5",
      })
    ),
  },
  {
    id: "record-seed-004",
    tankName: "三湖缸D",
    tankId: "tank-seed-004",
    recordedAt: formatDateTime(daysAgo(3)),
    metrics: createWaterMetrics({
      ph: "8.0",
      ammonia: "0",
      nitrite: "0",
      nitrate: "18",
      hardness: "14",
      temperature: "26.5",
    }),
    ...evaluateRecordStatus(
      createWaterMetrics({
        ph: "8.0",
        ammonia: "0",
        nitrite: "0",
        nitrate: "18",
        hardness: "14",
        temperature: "26.5",
      })
    ),
  },
  {
    id: "record-seed-005",
    tankName: "草缸E",
    tankId: "tank-seed-005",
    recordedAt: formatDateTime(daysAgo(4)),
    metrics: createWaterMetrics({
      ph: "6.6",
      ammonia: "0",
      nitrite: "0",
      nitrate: "12",
      hardness: "7",
      temperature: "25.0",
      waterChange: "30%",
    }),
    ...evaluateRecordStatus(
      createWaterMetrics({
        ph: "6.6",
        ammonia: "0",
        nitrite: "0",
        nitrate: "12",
        hardness: "7",
        temperature: "25.0",
        waterChange: "30%",
      })
    ),
  },
];

export const seedWaterChangePlans: WaterChangePlan[] = [
  {
    id: "plan-seed-001",
    tankName: "草缸A",
    tankId: "tank-seed-001",
    cycleDays: "7",
    waterRatio: "30",
    nextDate: formatDate(daysLater(2)),
    note: "周日上午换水，注意水温",
    createdAt: formatDateTime(daysAgo(7)),
  },
  {
    id: "plan-seed-002",
    tankName: "海缸B",
    tankId: "tank-seed-002",
    cycleDays: "14",
    waterRatio: "20",
    nextDate: formatDate(daysLater(5)),
    note: "换水时补充微量元素",
    createdAt: formatDateTime(daysAgo(14)),
  },
  {
    id: "plan-seed-003",
    tankName: "繁殖缸C",
    tankId: "tank-seed-003",
    cycleDays: "5",
    waterRatio: "25",
    nextDate: formatDate(daysAgo(1)),
    note: "少量多次，避免水质波动",
    createdAt: formatDateTime(daysAgo(5)),
  },
  {
    id: "plan-seed-004",
    tankName: "三湖缸D",
    tankId: "tank-seed-004",
    cycleDays: "10",
    waterRatio: "25",
    nextDate: formatDate(daysLater(7)),
    note: "",
    createdAt: formatDateTime(daysAgo(10)),
  },
  {
    id: "plan-seed-005",
    tankName: "草缸E",
    tankId: "tank-seed-005",
    cycleDays: "7",
    waterRatio: "30",
    nextDate: formatDate(daysLater(3)),
    note: "配合修剪水草",
    completedAt: formatDateTime(daysAgo(0)),
    createdAt: formatDateTime(daysAgo(7)),
  },
];

export const seedAlerts: AlertItem[] = [
  {
    id: "alert-seed-001",
    tankName: "繁殖缸C",
    tankId: "tank-seed-003",
    tankType: "繁殖缸",
    metric: "nitrite",
    metricLabel: "亚硝酸盐",
    value: "0.3",
    unit: "ppm",
    severity: "mild",
    status: "pending",
    thresholdRange: "0 - 0.5 ppm",
    description: "亚硝酸盐 0.3ppm 轻微偏高，建议少量换水并加强过滤",
    recordId: "record-seed-003",
    recordedAt: formatDateTime(daysAgo(2)),
    createdAt: formatDateTime(daysAgo(2)),
  },
  {
    id: "alert-seed-002",
    tankName: "繁殖缸C",
    tankId: "tank-seed-003",
    tankType: "繁殖缸",
    metric: "nitrate",
    metricLabel: "硝酸盐",
    value: "25",
    unit: "ppm",
    severity: "mild",
    status: "pending",
    thresholdRange: "0 - 40 ppm",
    description: "硝酸盐 25ppm 偏高，建议增加换水频率",
    recordId: "record-seed-003",
    recordedAt: formatDateTime(daysAgo(2)),
    createdAt: formatDateTime(daysAgo(2)),
  },
  {
    id: "alert-seed-003",
    tankName: "三湖缸D",
    tankId: "tank-seed-004",
    tankType: "三湖缸",
    metric: "hardness",
    metricLabel: "硬度",
    value: "14",
    unit: "dGH",
    severity: "mild",
    status: "pending",
    thresholdRange: "2 - 18 dGH",
    description: "硬度 14dGH 偏高，三湖慈鲷适宜硬度范围 8-15dGH",
    recordId: "record-seed-004",
    recordedAt: formatDateTime(daysAgo(3)),
    createdAt: formatDateTime(daysAgo(3)),
  },
];

export const SEED_DATA = {
  tanks: seedTanks,
  waterRecords: seedWaterRecords,
  waterChangePlans: seedWaterChangePlans,
  alerts: seedAlerts,
};

export const SEED_DATA_CHECK_KEY = "aquarium_seed_data_v1";

export function hasSeedDataBeenLoaded(): boolean {
  return localStorage.getItem(SEED_DATA_CHECK_KEY) === "true";
}

export function markSeedDataAsLoaded(): void {
  localStorage.setItem(SEED_DATA_CHECK_KEY, "true");
}

export function clearSeedDataFlag(): void {
  localStorage.removeItem(SEED_DATA_CHECK_KEY);
}
