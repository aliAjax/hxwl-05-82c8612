import { TankTrendData, TrendMetric } from "./types";

export interface TrendDataSource {
  getAllTanks(): Promise<TankTrendData[]>;
  getTankTrend(tankId: string, metric: TrendMetric, days?: number): Promise<TankTrendData | null>;
  getTanksByType(tankType: string): Promise<TankTrendData[]>;
}
