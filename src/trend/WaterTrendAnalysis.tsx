import { useState, useEffect, useMemo } from "react";
import {
  TrendMetric,
  TREND_METRICS,
  METRIC_RANGES,
  TankTrendData,
  getMetricRangeByTankType,
} from "./types";
import { TrendDataSource } from "./dataSource";
import { TrendChart, MultiTrendChart } from "./TrendChart";

interface WaterTrendAnalysisProps {
  dataSource: TrendDataSource;
  tankTypes?: string[];
}

const TANK_TYPES = ["全部", "草缸", "海缸", "三湖缸", "繁殖缸"];
const COMPARE_MIN = 2;
const COMPARE_MAX = 3;

type ViewMode = "single" | "compare";

const formatValue = (value: number) => {
  if (Math.abs(value) < 1) return value.toFixed(3);
  if (Math.abs(value) < 10) return value.toFixed(2);
  return value.toFixed(1);
};

export function WaterTrendAnalysis({
  dataSource,
  tankTypes = TANK_TYPES,
}: WaterTrendAnalysisProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("single");

  const [activeMetric, setActiveMetric] = useState<TrendMetric>("ph");
  const [activeTankType, setActiveTankType] = useState<string>("全部");

  const [compareTankId, setCompareTankId] = useState<string>("");
  const [selectedMetrics, setSelectedMetrics] = useState<TrendMetric[]>([
    "ph",
    "nitrate",
  ]);

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
          if (data.length > 0 && !compareTankId) {
            setCompareTankId(data[0].tankId);
          }
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

  useEffect(() => {
    if (allTrendData.length > 0 && !compareTankId) {
      setCompareTankId(allTrendData[0].tankId);
    }
  }, [allTrendData, compareTankId]);

  const singleModeTrendData = useMemo(() => {
    if (activeTankType === "全部") return allTrendData;
    return allTrendData.filter((t) => t.tankType === activeTankType);
  }, [allTrendData, activeTankType]);

  const stats = useMemo(() => {
    const result: Record<
      string,
      { latest: number; change: number; status: "normal" | "warning" | "danger" }
    > = {};

    for (const tank of singleModeTrendData) {
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
  }, [singleModeTrendData, activeMetric]);

  const headerRange = useMemo(() => {
    if (activeTankType === "全部") return null;
    return getMetricRangeByTankType(activeMetric, activeTankType);
  }, [activeMetric, activeTankType]);

  const compareTank = useMemo(
    () => allTrendData.find((t) => t.tankId === compareTankId) || null,
    [allTrendData, compareTankId]
  );

  const compareSeries = useMemo(() => {
    if (!compareTank) return [];
    return selectedMetrics.map((m) => ({
      metric: m,
      data: compareTank.metrics[m],
    }));
  }, [compareTank, selectedMetrics]);

  const compareMetricStats = useMemo(() => {
    if (!compareTank) return [];
    return selectedMetrics.map((m) => {
      const points = compareTank.metrics[m];
      const range = getMetricRangeByTankType(
        m,
        compareTank.tankType,
        compareTank.customThresholds
      );
      let latest: number | null = null;
      let previous: number | null = null;
      let change: number | null = null;
      let status: "normal" | "warning" | "danger" = "normal";
      let thresholdCrossed = false;
      let direction: "up" | "down" | "flat" = "flat";

      if (points.length >= 1) {
        latest = points[points.length - 1].value;
        status = points[points.length - 1].status;
        thresholdCrossed = status !== "normal";
      }
      if (points.length >= 2) {
        previous = points[points.length - 2].value;
        change = latest! - previous;
        if (change > 0.0001) direction = "up";
        else if (change < -0.0001) direction = "down";
      }

      return {
        metric: m,
        label: range.label,
        unit: range.unit,
        color: range.color,
        okRange: range.ok,
        warningRange: range.warning,
        latest,
        previous,
        change,
        status,
        thresholdCrossed,
        direction,
        hasCustom: !!(
          compareTank.customThresholds && compareTank.customThresholds[m]
        ),
      };
    });
  }, [compareTank, selectedMetrics]);

  const toggleMetric = (m: TrendMetric) => {
    setSelectedMetrics((prev) => {
      const exists = prev.includes(m);
      if (exists) {
        if (prev.length <= COMPARE_MIN) return prev;
        return prev.filter((x) => x !== m);
      } else {
        if (prev.length >= COMPARE_MAX) return prev;
        return [...prev, m];
      }
    });
  };

  const renderSingleMode = () => {
    if (loading) {
      return (
        <div className="trend-loading">
          <div className="trend-loading-spinner" />
          <p>加载中...</p>
        </div>
      );
    }
    if (singleModeTrendData.length === 0) {
      return (
        <div className="empty-state empty-state-compact">
          <div className="empty-icon">📊</div>
          <h3>暂无趋势数据</h3>
          <p>当前筛选条件下没有鱼缸数据，试试切换其他筛选条件。</p>
        </div>
      );
    }
    return (
      <div className="trend-grid">
        {singleModeTrendData.map((tank) => {
          const tankStats = stats[tank.tankId];
          const tankRange = getMetricRangeByTankType(
            activeMetric,
            tank.tankType,
            tank.customThresholds
          );
          const hasCustomThresholds =
            tank.customThresholds && tank.customThresholds[activeMetric];
          return (
            <article key={tank.tankId} className="trend-card">
              <header className="trend-card-header">
                <div>
                  <span className={`tank-type-tag tank-type-${tank.tankType}`}>
                    {tank.tankType}
                  </span>
                  <h3>{tank.tankName}</h3>
                  <div className="trend-card-range">
                    <span className="trend-card-range-label">
                      {hasCustomThresholds ? "自定义范围" : "适用范围"}
                    </span>
                    <span className="trend-card-range-value">
                      {tankRange.ok[0]} ~ {tankRange.ok[1]} {tankRange.unit}
                    </span>
                  </div>
                </div>
                {tankStats && (
                  <div className="trend-card-stats">
                    <div className="trend-latest-value">
                      {formatValue(tankStats.latest)}
                      <span className="trend-unit">{tankRange.unit}</span>
                    </div>
                    <div
                      className={`trend-change trend-change-${
                        tankStats.change > 0
                          ? "up"
                          : tankStats.change < 0
                            ? "down"
                            : "flat"
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
                  {tankStats.status === "danger"
                    ? "⚠️ 指标异常，需立即处理"
                    : "⚡ 指标偏离，建议关注"}
                </div>
              )}
            </article>
          );
        })}
      </div>
    );
  };

  const renderCompareMode = () => {
    if (loading) {
      return (
        <div className="trend-loading">
          <div className="trend-loading-spinner" />
          <p>加载中...</p>
        </div>
      );
    }
    if (allTrendData.length === 0) {
      return (
        <div className="empty-state empty-state-compact">
          <div className="empty-icon">📊</div>
          <h3>暂无趋势数据</h3>
          <p>请先录入水质数据后再查看对比分析。</p>
        </div>
      );
    }
    if (!compareTank) {
      return (
        <div className="empty-state empty-state-compact">
          <div className="empty-icon">🐠</div>
          <h3>请选择鱼缸</h3>
          <p>请在上方选择要对比的鱼缸。</p>
        </div>
      );
    }
    return (
      <div className="compare-mode-container">
        <div className="compare-tank-header">
          <div className="compare-tank-info">
            <span className={`tank-type-tag tank-type-${compareTank.tankType}`}>
              {compareTank.tankType}
            </span>
            <h3 className="compare-tank-name">{compareTank.tankName}</h3>
          </div>
          <div className="compare-data-note">
            <span className="trend-data-note">近 30 天数据</span>
          </div>
        </div>

        <div className="multi-chart-card">
          <MultiTrendChart
            series={compareSeries}
            tankType={compareTank.tankType}
            customThresholds={compareTank.customThresholds}
            width={760}
            height={360}
          />
        </div>

        <div className="compare-metric-details">
          {compareMetricStats.map((stat) => (
            <div
              key={stat.metric}
              className={`metric-detail-card metric-detail-${stat.status}`}
            >
              <header className="metric-detail-header">
                <div
                  className="metric-detail-color-bar"
                  style={{ background: stat.color }}
                />
                <div className="metric-detail-title-block">
                  <h4 className="metric-detail-title">{stat.label}</h4>
                  <span className="metric-detail-range-note">
                    {stat.hasCustom ? "自定义" : "标准"} · 安全范围{" "}
                    {stat.okRange[0]}~{stat.okRange[1]}
                    {stat.unit}
                  </span>
                </div>
                {stat.thresholdCrossed && (
                  <span
                    className={`metric-detail-badge badge-${stat.status}`}
                  >
                    {stat.status === "danger" ? "异常" : "关注"}
                  </span>
                )}
              </header>

              <div className="metric-detail-body">
                <div className="metric-detail-latest">
                  <span className="detail-value-label">最新值</span>
                  <span className="detail-value-main">
                    {stat.latest !== null ? formatValue(stat.latest) : "—"}
                    <span className="detail-value-unit">{stat.unit}</span>
                  </span>
                </div>

                <div className="metric-detail-change">
                  <span className="detail-value-label">变化</span>
                  <span
                    className={`detail-change-value trend-change trend-change-${stat.direction}`}
                  >
                    {stat.change !== null
                      ? stat.direction === "up"
                        ? `↑ ${formatValue(Math.abs(stat.change))}`
                        : stat.direction === "down"
                          ? `↓ ${formatValue(Math.abs(stat.change))}`
                          : "—"
                      : "数据不足"}
                  </span>
                </div>

                <div className="metric-detail-threshold">
                  <span className="detail-value-label">阈值判断</span>
                  <span
                    className={`detail-threshold-value threshold-${stat.status}`}
                  >
                    {stat.status === "normal"
                      ? "✓ 正常范围内"
                      : stat.status === "warning"
                        ? "⚡ 超出安全范围"
                        : "⚠️ 超出警戒范围"}
                  </span>
                </div>

                <div className="metric-detail-warning-range">
                  <span className="detail-value-label">警戒范围</span>
                  <span className="detail-range-text">
                    {stat.warningRange[0]} ~ {stat.warningRange[1]} {stat.unit}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className="water-trend panel">
      <div className="section-heading">
        <div>
          <p>趋势分析</p>
          <h2>水质趋势分析</h2>
        </div>
        <div className="trend-header-actions">
          <div className="view-mode-toggle">
            <button
              className={`view-mode-btn ${
                viewMode === "single" ? "view-mode-active" : ""
              }`}
              onClick={() => setViewMode("single")}
            >
              📋 单指标多鱼缸
            </button>
            <button
              className={`view-mode-btn ${
                viewMode === "compare" ? "view-mode-active" : ""
              }`}
              onClick={() => setViewMode("compare")}
            >
              📈 多指标对比
            </button>
          </div>
          {viewMode === "single" && (
            <span className="trend-data-note">近 30 天数据</span>
          )}
        </div>
      </div>

      {viewMode === "single" && (
        <>
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
                        {
                          allTrendData.filter((t) => t.tankType === type)
                            .length
                        }
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
            {headerRange ? (
              <>
                <div className="trend-summary-item">
                  <span className="trend-summary-label">正常范围</span>
                  <span className="trend-summary-value">
                    {headerRange.ok[0]} ~ {headerRange.ok[1]} {headerRange.unit}
                  </span>
                </div>
                <div className="trend-summary-item">
                  <span className="trend-summary-label">警戒范围</span>
                  <span className="trend-summary-value">
                    {headerRange.warning[0]} ~ {headerRange.warning[1]}{" "}
                    {headerRange.unit}
                  </span>
                </div>
              </>
            ) : (
              <div className="trend-summary-item trend-summary-full">
                <span className="trend-summary-label">范围说明</span>
                <span className="trend-summary-value">
                  各鱼缸按自身适养参数评估状态
                </span>
              </div>
            )}
            <div className="trend-summary-item trend-summary-warning">
              <span className="trend-summary-label">关注鱼缸</span>
              <span className="trend-summary-value">
                {Object.values(stats).filter((s) => s.status === "warning").length}{" "}
                个
              </span>
            </div>
            <div className="trend-summary-item trend-summary-danger">
              <span className="trend-summary-label">异常鱼缸</span>
              <span className="trend-summary-value">
                {Object.values(stats).filter((s) => s.status === "danger").length}{" "}
                个
              </span>
            </div>
          </div>

          {renderSingleMode()}
        </>
      )}

      {viewMode === "compare" && (
        <>
          <div className="trend-controls compare-controls">
            <div className="trend-control-group">
              <span className="trend-control-label">选择鱼缸</span>
              <select
                className="compare-tank-select"
                value={compareTankId}
                onChange={(e) => setCompareTankId(e.target.value)}
              >
                {allTrendData.map((t) => (
                  <option key={t.tankId} value={t.tankId}>
                    {t.tankName}（{t.tankType}）
                  </option>
                ))}
              </select>
            </div>

            <div className="trend-control-group compare-metric-group">
              <span className="trend-control-label">
                选择指标
                <span className="metric-selection-hint">
                  （{selectedMetrics.length}/{COMPARE_MAX}，至少{COMPARE_MIN}个）
                </span>
              </span>
              <div className="chips muted">
                {TREND_METRICS.map((metric) => {
                  const isSelected = selectedMetrics.includes(metric);
                  const atMin = selectedMetrics.length <= COMPARE_MIN;
                  const atMax = selectedMetrics.length >= COMPARE_MAX;
                  const disabled =
                    (!isSelected && atMax) || (isSelected && atMin);
                  return (
                    <button
                      key={metric}
                      className={`${
                        isSelected ? "chip-active" : ""
                      } ${disabled ? "chip-disabled" : ""}`}
                      onClick={() => !disabled && toggleMetric(metric)}
                      disabled={disabled}
                      title={
                        disabled
                          ? isSelected
                            ? `至少保留 ${COMPARE_MIN} 个指标`
                            : `最多选择 ${COMPARE_MAX} 个指标`
                          : undefined
                      }
                    >
                      {METRIC_RANGES[metric].label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {renderCompareMode()}
        </>
      )}
    </section>
  );
}
