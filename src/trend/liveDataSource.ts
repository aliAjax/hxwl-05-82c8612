import {
  TankTrendData,
  TrendMetric,
  TrendDataPoint,
  TREND_METRICS,
  evaluateDataPoint,
  TrendCustomThresholds,
} from "./types";
import { TrendDataSource } from "./dataSource";
import type { TankProfile, WaterRecord } from "../db/types";

const METRIC_KEY_MAP: Record<TrendMetric, keyof WaterRecord["metrics"]> = {
  ph: "ph",
  ammonia: "ammonia",
  nitrate: "nitrate",
  hardness: "hardness",
  temperature: "temperature",
};

function toTrendCustomThresholds(
  tankCustomThresholds?: TankProfile["customThresholds"]
): TrendCustomThresholds | undefined {
  if (!tankCustomThresholds) return undefined;
  const result: TrendCustomThresholds = {};
  for (const metric of TREND_METRICS) {
    const tankMetric = metric as keyof typeof tankCustomThresholds;
    if (tankCustomThresholds[tankMetric]) {
      const range = tankCustomThresholds[tankMetric]!;
      result[metric] = {
        ok: range.ok,
        warning: range.watch,
      };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function buildTankTrend(
  tank: TankProfile,
  records: WaterRecord[],
  days: number
): TankTrendData {
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  const tankRecords = records
    .filter((r) => r.tankId === tank.id)
    .filter((r) => new Date(r.recordedAt).getTime() >= cutoffTime)
    .sort(
      (a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );

  const customThresholds = toTrendCustomThresholds(tank.customThresholds);

  const metrics = {} as Record<TrendMetric, TrendDataPoint[]>;
  for (const metric of TREND_METRICS) {
    const key = METRIC_KEY_MAP[metric];
    const points: TrendDataPoint[] = [];
    for (const record of tankRecords) {
      const raw = record.metrics[key];
      const value = parseFloat(raw);
      if (!isFinite(value)) continue;
      const timestamp = new Date(record.recordedAt).getTime();
      const status = evaluateDataPoint(
        metric,
        value,
        tank.tankType,
        customThresholds
      );
      points.push({ timestamp, value, status });
    }
    metrics[metric] = points;
  }

  return {
    tankId: tank.id,
    tankName: tank.name,
    tankType: tank.tankType,
    customThresholds,
    metrics,
  };
}

export class LiveTrendDataSource implements TrendDataSource {
  private tanks: TankProfile[];
  private waterRecords: WaterRecord[];
  private defaultDays: number;

  constructor(
    tanks: TankProfile[],
    waterRecords: WaterRecord[],
    defaultDays: number = 30
  ) {
    this.tanks = tanks;
    this.waterRecords = waterRecords;
    this.defaultDays = defaultDays;
  }

  async getAllTanks(): Promise<TankTrendData[]> {
    return this.tanks.map((tank) =>
      buildTankTrend(tank, this.waterRecords, this.defaultDays)
    );
  }

  async getTankTrend(
    tankId: string,
    _metric: TrendMetric,
    days?: number
  ): Promise<TankTrendData | null> {
    const tank = this.tanks.find((t) => t.id === tankId);
    if (!tank) return null;
    return buildTankTrend(tank, this.waterRecords, days || this.defaultDays);
  }

  async getTanksByType(tankType: string): Promise<TankTrendData[]> {
    return this.tanks
      .filter((t) => t.tankType === tankType)
      .map((tank) =>
        buildTankTrend(tank, this.waterRecords, this.defaultDays)
      );
  }
}
