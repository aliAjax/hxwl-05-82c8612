import {
  TankTrendData,
  TrendMetric,
  TrendDataPoint,
  TREND_METRICS,
  evaluateDataPoint,
  METRIC_RANGES,
} from "./types";
import { TrendDataSource } from "./dataSource";

interface MockTankConfig {
  id: string;
  name: string;
  type: string;
  baseValues: Record<TrendMetric, number>;
  volatility: Record<TrendMetric, number>;
}

const MOCK_TANKS: MockTankConfig[] = [
  {
    id: "tank-001",
    name: "草缸A",
    type: "草缸",
    baseValues: { ph: 6.8, ammonia: 0.02, nitrate: 15, temperature: 25.5 },
    volatility: { ph: 0.15, ammonia: 0.03, nitrate: 5, temperature: 1 },
  },
  {
    id: "tank-002",
    name: "海缸B",
    type: "海缸",
    baseValues: { ph: 8.1, ammonia: 0.01, nitrate: 8, temperature: 26 },
    volatility: { ph: 0.1, ammonia: 0.02, nitrate: 3, temperature: 0.8 },
  },
  {
    id: "tank-003",
    name: "繁殖缸C",
    type: "繁殖缸",
    baseValues: { ph: 7.2, ammonia: 0.05, nitrate: 25, temperature: 27 },
    volatility: { ph: 0.2, ammonia: 0.08, nitrate: 8, temperature: 1.5 },
  },
  {
    id: "tank-004",
    name: "三湖缸D",
    type: "三湖缸",
    baseValues: { ph: 8.0, ammonia: 0.03, nitrate: 18, temperature: 26.5 },
    volatility: { ph: 0.12, ammonia: 0.04, nitrate: 6, temperature: 1.2 },
  },
  {
    id: "tank-005",
    name: "草缸E",
    type: "草缸",
    baseValues: { ph: 6.6, ammonia: 0.01, nitrate: 12, temperature: 25 },
    volatility: { ph: 0.1, ammonia: 0.02, nitrate: 4, temperature: 0.9 },
  },
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateDataPoints(
  metric: TrendMetric,
  baseValue: number,
  volatility: number,
  days: number,
  seed: number
): TrendDataPoint[] {
  const random = seededRandom(seed);
  const points: TrendDataPoint[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = days - 1; i >= 0; i--) {
    const timestamp = now - i * dayMs + Math.floor(random() * dayMs * 0.5);
    const noise = (random() - 0.5) * 2 * volatility;
    let value = baseValue + noise;

    if (random() > 0.92) {
      const spike = (random() - 0.3) * volatility * 3;
      value += spike;
    }

    const range = METRIC_RANGES[metric];
    value = Math.max(range.warning[0] - volatility, Math.min(range.warning[1] + volatility, value));
    value = Math.round(value * 100) / 100;

    points.push({
      timestamp,
      value,
      status: evaluateDataPoint(metric, value),
    });
  }

  return points;
}

function generateTankData(tankConfig: MockTankConfig, days: number): TankTrendData {
  const metrics = {} as Record<TrendMetric, TrendDataPoint[]>;
  let seedOffset = 0;
  for (const metric of TREND_METRICS) {
    const seed =
      tankConfig.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) + seedOffset;
    metrics[metric] = generateDataPoints(
      metric,
      tankConfig.baseValues[metric],
      tankConfig.volatility[metric],
      days,
      seed
    );
    seedOffset += 100;
  }

  return {
    tankId: tankConfig.id,
    tankName: tankConfig.name,
    tankType: tankConfig.type,
    metrics,
  };
}

export class MockTrendDataSource implements TrendDataSource {
  private defaultDays: number;

  constructor(defaultDays: number = 30) {
    this.defaultDays = defaultDays;
  }

  async getAllTanks(): Promise<TankTrendData[]> {
    await this.delay(80);
    return MOCK_TANKS.map((tank) => generateTankData(tank, this.defaultDays));
  }

  async getTankTrend(
    tankId: string,
    _metric: TrendMetric,
    days?: number
  ): Promise<TankTrendData | null> {
    await this.delay(50);
    const tankConfig = MOCK_TANKS.find((t) => t.id === tankId);
    if (!tankConfig) return null;
    return generateTankData(tankConfig, days || this.defaultDays);
  }

  async getTanksByType(tankType: string): Promise<TankTrendData[]> {
    await this.delay(60);
    const filtered = MOCK_TANKS.filter((t) => t.type === tankType);
    return filtered.map((tank) => generateTankData(tank, this.defaultDays));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const mockDataSource = new MockTrendDataSource(30);
