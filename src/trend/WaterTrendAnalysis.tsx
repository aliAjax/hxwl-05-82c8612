import { useState, useEffect, useMemo } from "react";
import {
  TrendMetric,
  TREND_METRICS,
  METRIC_RANGES,
  TankTrendData,
  getMetricRangeByTankType,
} from "./types";
import { TrendDataSource } from "./dataSource";
import { TrendChart } from "./TrendChart";

interface WaterTrendAnalysisProps {
  dataSource: TrendDataSource;
  tankTypes?: string[];
}

const TANK_TYPES = ["全部", "草缸", "海缸", "三湖缸", "繁殖缸"];

export function WaterTrendAnalysis({
  dataSource,
  tankTypes = TANK_TYPES,
}: WaterTrendAnalysisProps) {
  const [activeMetric, setActiveMetric] = useState<TrendMetric>("ph");
  const [activeTankType, setActiveTankType] = useState<string>("全部");
  const [allTrendData, setAllTrendData] = useState<TankTrendData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const fetchData = async () => {
      try {
        const data = await dataSource.getAllTanks();
        if (mounted) {
          setAllTrendData(data);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch trend data:", err);
        if (mounted) {
          setAllTrendData([]);
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      mounted = false;
    };
  }, [dataSource]);

  const trendData = useMemo(() => {
    if (activeTankType === "全部") return allTrendData;
    return allTrendData.filter((t) => t.tankType === activeTankType);
  }, [allTrendData, activeTankType]);

  const stats = useMemo(() => {
    const result: Record<
      string,
      { latest: number; change: number; status: "normal" | "warning" | "danger" }
    > = {};

    for (const tank of trendData) {
      const points = tank.metrics[activeMetric];
      if (points.length < 2) continue;
      const latest = points[points.length - 1].value;
      const previous = points[points.length - 2].value;
      const change = latest - previous;
      let status: "normal" | "warning" | "danger" = "normal";
      const latestStatus = points[points.length - 1].status;
      if (latestStatus === "danger") status = "danger";
      else if (latestStatus === "warning") status = "warning";
      result[tank.tankId] = { latest, change, status };
    }
    return result;
  }, [trendData, activeMetric]);

  const range = useMemo(() => {
    if (activeTankType === "全部") return METRIC_RANGES[activeMetric];
    return getMetricRangeByTankType(activeMetric, activeTankType);
  }, [activeMetric, activeTankType]);

  const formatValue = (value: number) => {
    if (Math.abs(value) < 1) return value.toFixed(3);
    if (Math.abs(value) < 10) return value.toFixed(2);
    return value.toFixed(1);
  };

  return (
    <section className="water-trend panel">
      <div className="section-heading">
        <div>
          <p>趋势分析</p>
          <h2>水质趋势分析</h2>
        </div>
        <div className="trend-header-actions">
          <span className="trend-data-note">近 30 天数据</span>
        </div>
      </div>

      <div className="trend-controls">
        <div className="trend-control-group">
          <span className="trend-control-label">指标</span>
          <div className="chips muted">
            {TREND_METRICS.map((metric) => (
              <button
                key={metric}
                className={activeMetric === metric ? "chip-active" : ""}
                onClick={() => setActiveMetric(metric)}
              >
                {METRIC_RANGES[metric].label}
              </button>
            ))}
          </div>
        </div>

        <div className="trend-control-group">
          <span className="trend-control-label">鱼缸类型</span>
          <div className="chips muted">
            {tankTypes.map((type) => (
              <button
                key={type}
                className={activeTankType === type ? "chip-active" : ""}
                onClick={() => setActiveTankType(type)}
              >
                {type}
                {type !== "全部" && (
                  <span className="chip-count">
                    {allTrendData.filter((t) => t.tankType === type).length}
                  </span>
                )}
                {type === "全部" && (
                  <span className="chip-count">{allTrendData.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="trend-summary">
        <div className="trend-summary-item">
          <span className="trend-summary-label">正常范围</span>
          <span className="trend-summary-value">
            {range.ok[0]} ~ {range.ok[1]} {range.unit}
          </span>
        </div>
        <div className="trend-summary-item">
          <span className="trend-summary-label">警戒范围</span>
          <span className="trend-summary-value">
            {range.warning[0]} ~ {range.warning[1]} {range.unit}
          </span>
        </div>
        <div className="trend-summary-item trend-summary-warning">
          <span className="trend-summary-label">关注鱼缸</span>
          <span className="trend-summary-value">
            {Object.values(stats).filter((s) => s.status === "warning").length} 个
          </span>
        </div>
        <div className="trend-summary-item trend-summary-danger">
          <span className="trend-summary-label">异常鱼缸</span>
          <span className="trend-summary-value">
            {Object.values(stats).filter((s) => s.status === "danger").length} 个
          </span>
        </div>
      </div>

      {loading ? (
        <div className="trend-loading">
          <div className="trend-loading-spinner" />
          <p>加载中...</p>
        </div>
      ) : trendData.length === 0 ? (
        <div className="empty-state empty-state-compact">
          <div className="empty-icon">📊</div>
          <h3>暂无趋势数据</h3>
          <p>当前筛选条件下没有鱼缸数据，试试切换其他筛选条件。</p>
        </div>
      ) : (
        <div className="trend-grid">
          {trendData.map((tank) => {
            const tankStats = stats[tank.tankId];
            return (
              <article key={tank.tankId} className="trend-card">
                <header className="trend-card-header">
                  <div>
                    <span className={`tank-type-tag tank-type-${tank.tankType}`}>
                      {tank.tankType}
                    </span>
                    <h3>{tank.tankName}</h3>
                  </div>
                  {tankStats && (
                    <div className="trend-card-stats">
                      <div className="trend-latest-value">
                        {formatValue(tankStats.latest)}
                        <span className="trend-unit">{range.unit}</span>
                      </div>
                      <div
                        className={`trend-change trend-change-${
                          tankStats.change > 0 ? "up" : tankStats.change < 0 ? "down" : "flat"
                        }`}
                      >
                        {tankStats.change > 0
                          ? `↑ ${formatValue(Math.abs(tankStats.change))}`
                          : tankStats.change < 0
                            ? `↓ ${formatValue(Math.abs(tankStats.change))}`
                            : "—"}
                      </div>
                    </div>
                  )}
                </header>

                <div className="trend-chart-container">
                  <TrendChart
                    data={tank.metrics[activeMetric]}
                    metric={activeMetric}
                    width={320}
                    height={180}
                  />
                </div>

                {tankStats && tankStats.status !== "normal" && (
                  <div className={`trend-alert trend-alert-${tankStats.status}`}>
                    {tankStats.status === "danger" ? "⚠️ 指标异常，需立即处理" : "⚡ 指标偏离，建议关注"}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
