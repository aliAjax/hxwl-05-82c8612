import { useMemo, useState } from "react";
import {
  TrendDataPoint,
  TrendMetric,
  METRIC_RANGES,
  getMetricRangeByTankType,
  TrendCustomThresholds,
} from "./types";

interface TrendChartProps {
  data: TrendDataPoint[];
  metric: TrendMetric;
  width?: number;
  height?: number;
}

interface MultiMetricSeries {
  metric: TrendMetric;
  data: TrendDataPoint[];
}

interface MultiTrendChartProps {
  series: MultiMetricSeries[];
  tankType?: string;
  customThresholds?: TrendCustomThresholds;
  width?: number;
  height?: number;
}

const PADDING = { top: 20, right: 20, bottom: 36, left: 52 };

export function TrendChart({
  data,
  metric,
  width = 680,
  height = 280,
}: TrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const range = METRIC_RANGES[metric];

  const chartWidth = width - PADDING.left - PADDING.right;
  const chartHeight = height - PADDING.top - PADDING.bottom;

  const { minValue, maxValue } = useMemo(() => {
    if (data.length === 0) return { minValue: 0, maxValue: 1 };
    const values = data.map((d) => d.value);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const rangePadding = (dataMax - dataMin) * 0.1 || 1;
    return {
      minValue: Math.min(range.warning[0], dataMin - rangePadding),
      maxValue: Math.max(range.warning[1], dataMax + rangePadding),
    };
  }, [data, range.warning]);

  const xScale = (index: number) => {
    if (data.length <= 1) return PADDING.left;
    return PADDING.left + (index / (data.length - 1)) * chartWidth;
  };

  const yScale = (value: number) => {
    return PADDING.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;
  };

  const pathD = useMemo(() => {
    if (data.length === 0) return "";
    return data
      .map((d, i) => {
        const x = xScale(i);
        const y = yScale(d.value);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [data, chartWidth, chartHeight, minValue, maxValue]);

  const areaD = useMemo(() => {
    if (data.length === 0) return "";
    const firstX = xScale(0);
    const lastX = xScale(data.length - 1);
    const bottomY = PADDING.top + chartHeight;
    return `${pathD} L ${lastX.toFixed(2)} ${bottomY} L ${firstX.toFixed(2)} ${bottomY} Z`;
  }, [pathD, chartHeight]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = (maxValue - minValue) / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(minValue + step * i);
    }
    return ticks;
  }, [minValue, maxValue]);

  const xLabels = useMemo(() => {
    if (data.length === 0) return [];
    const labels: { index: number; label: string }[] = [];
    const count = Math.min(6, data.length);
    const step = Math.floor(data.length / (count - 1 || 1));
    for (let i = 0; i < data.length; i += step) {
      const date = new Date(data[i].timestamp);
      const label = `${date.getMonth() + 1}/${date.getDate()}`;
      labels.push({ index: i, label });
    }
    if (labels[labels.length - 1]?.index !== data.length - 1) {
      const lastDate = new Date(data[data.length - 1].timestamp);
      labels.push({
        index: data.length - 1,
        label: `${lastDate.getMonth() + 1}/${lastDate.getDate()}`,
      });
    }
    return labels;
  }, [data]);

  const okZoneY1 = yScale(range.ok[1]);
  const okZoneY2 = yScale(range.ok[0]);
  const okZoneHeight = Math.abs(okZoneY2 - okZoneY1);

  const getPointColor = (status: "normal" | "warning" | "danger") => {
    switch (status) {
      case "normal":
        return "#16a34a";
      case "warning":
        return "#f59e0b";
      case "danger":
        return "#e11d48";
    }
  };

  const formatValue = (value: number) => {
    if (Math.abs(value) < 1) return value.toFixed(3);
    if (Math.abs(value) < 10) return value.toFixed(2);
    return value.toFixed(1);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  if (data.length === 0) {
    return (
      <div className="trend-chart-empty">
        <p>暂无数据</p>
      </div>
    );
  }

  return (
    <div className="trend-chart-wrapper">
      <svg
        className="trend-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={`area-gradient-${metric}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={range.color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={range.color} stopOpacity="0.03" />
          </linearGradient>
        </defs>

        <rect
          x={PADDING.left}
          y={okZoneY1}
          width={chartWidth}
          height={okZoneHeight}
          fill="#16a34a"
          fillOpacity="0.06"
        />

        {yTicks.map((tick, i) => (
          <g key={`ytick-${i}`}>
            <line
              x1={PADDING.left}
              y1={yScale(tick)}
              x2={width - PADDING.right}
              y2={yScale(tick)}
              stroke="#e2e8f0"
              strokeDasharray="3,3"
            />
            <text
              x={PADDING.left - 10}
              y={yScale(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="#64748b"
              fontSize="11"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        <path
          d={areaD}
          fill={`url(#area-gradient-${metric})`}
        />

        <path
          d={pathD}
          fill="none"
          stroke={range.color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {data.map((point, i) => (
          <g key={`point-${i}`}>
            <circle
              cx={xScale(i)}
              cy={yScale(point.value)}
              r={point.status === "normal" ? 3.5 : 5.5}
              fill={getPointColor(point.status)}
              stroke="#ffffff"
              strokeWidth="2"
              className={`trend-point trend-point-${point.status} ${
                hoveredIndex === i ? "trend-point-hovered" : ""
              }`}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{ cursor: "pointer" }}
            />
            {point.status !== "normal" && (
              <circle
                cx={xScale(i)}
                cy={yScale(point.value)}
                r={point.status === "danger" ? 10 : 8}
                fill={getPointColor(point.status)}
                fillOpacity="0.2"
                className="trend-point-pulse"
              />
            )}
          </g>
        ))}

        {xLabels.map((item, i) => (
          <text
            key={`xlabel-${i}`}
            x={xScale(item.index)}
            y={height - PADDING.bottom + 20}
            textAnchor="middle"
            fill="#64748b"
            fontSize="11"
          >
            {item.label}
          </text>
        ))}

        {hoveredIndex !== null && (
          <g>
            <line
              x1={xScale(hoveredIndex)}
              y1={PADDING.top}
              x2={xScale(hoveredIndex)}
              y2={height - PADDING.bottom}
              stroke={range.color}
              strokeWidth="1"
              strokeDasharray="4,4"
              opacity="0.5"
            />
            <g transform={`translate(${xScale(hoveredIndex) + 10}, ${yScale(data[hoveredIndex].value) - 30})`}>
              <rect
                width="120"
                height="46"
                rx="6"
                fill="#1e293b"
                fillOpacity="0.92"
              />
              <text x="10" y="18" fill="#f1f5f9" fontSize="12" fontWeight="600">
                {formatDate(data[hoveredIndex].timestamp)}
              </text>
              <text x="10" y="36" fill="#cbd5e1" fontSize="11">
                {range.label}: {formatValue(data[hoveredIndex].value)}{range.unit}
              </text>
            </g>
          </g>
        )}
      </svg>

      <div className="trend-legend">
        <div className="trend-legend-item">
          <span className="legend-dot legend-ok" />
          <span>正常范围</span>
        </div>
        <div className="trend-legend-item">
          <span className="legend-dot legend-warning" />
          <span>关注值</span>
        </div>
        <div className="trend-legend-item">
          <span className="legend-dot legend-danger" />
          <span>异常值</span>
        </div>
      </div>
    </div>
  );
}

export function MultiTrendChart({
  series,
  tankType,
  customThresholds,
  width = 760,
  height = 360,
}: MultiTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredSeries, setHoveredSeries] = useState<number | null>(null);

  const validSeries = useMemo(
    () => series.filter((s) => s.data.length > 0),
    [series]
  );

  if (validSeries.length === 0) {
    return (
      <div className="trend-chart-empty">
        <p>暂无数据</p>
      </div>
    );
  }

  const chartWidth = width - PADDING.left - PADDING.right;
  const chartHeight = height - PADDING.top - PADDING.bottom;

  const normalizedData = useMemo(() => {
    return validSeries.map((s) => {
      const range = getMetricRangeByTankType(s.metric, tankType, customThresholds);
      const minNorm = range.warning[0];
      const maxNorm = range.warning[1];
      const span = maxNorm - minNorm || 1;
      return {
        metric: s.metric,
        range,
        normalized: s.data.map((d) => ({
          ...d,
          normValue: ((d.value - minNorm) / span) * 100,
        })),
      };
    });
  }, [validSeries, tankType, customThresholds]);

  const commonLength = useMemo(() => {
    return Math.min(...normalizedData.map((n) => n.normalized.length));
  }, [normalizedData]);

  const xScale = (index: number, length: number) => {
    if (length <= 1) return PADDING.left;
    return PADDING.left + (index / (length - 1)) * chartWidth;
  };

  const yScale = (normValue: number) => {
    const clamped = Math.max(0, Math.min(100, normValue));
    return PADDING.top + chartHeight - (clamped / 100) * chartHeight;
  };

  const paths = useMemo(() => {
    return normalizedData.map((n) => {
      const data = n.normalized.slice(-commonLength);
      const d = data
        .map((pt, i) => {
          const x = xScale(i, data.length);
          const y = yScale(pt.normValue);
          return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ");
      return { metric: n.metric, color: n.range.color, d, length: data.length };
    });
  }, [normalizedData, commonLength, chartWidth, chartHeight]);

  const yTicks = [0, 25, 50, 75, 100];

  const xLabels = useMemo(() => {
    const refData = normalizedData[0]?.normalized.slice(-commonLength) || [];
    if (refData.length === 0) return [];
    const labels: { index: number; label: string }[] = [];
    const count = Math.min(6, refData.length);
    const step = Math.floor(refData.length / (count - 1 || 1));
    for (let i = 0; i < refData.length; i += step) {
      const date = new Date(refData[i].timestamp);
      labels.push({ index: i, label: `${date.getMonth() + 1}/${date.getDate()}` });
    }
    if (labels[labels.length - 1]?.index !== refData.length - 1) {
      const lastDate = new Date(refData[refData.length - 1].timestamp);
      labels.push({
        index: refData.length - 1,
        label: `${lastDate.getMonth() + 1}/${lastDate.getDate()}`,
      });
    }
    return labels;
  }, [normalizedData, commonLength]);

  const formatValue = (value: number) => {
    if (Math.abs(value) < 1) return value.toFixed(3);
    if (Math.abs(value) < 10) return value.toFixed(2);
    return value.toFixed(1);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  const getPointColor = (status: "normal" | "warning" | "danger") => {
    switch (status) {
      case "normal": return "#16a34a";
      case "warning": return "#f59e0b";
      case "danger": return "#e11d48";
    }
  };

  const okZoneTop = yScale(100 * (0.4));
  const okZoneBottom = yScale(100 * (0.6));
  const okZoneHeight = Math.abs(okZoneBottom - okZoneTop);

  const hoveredData =
    hoveredIndex !== null && hoveredSeries !== null
      ? {
          seriesIdx: hoveredSeries,
          pointIdx: hoveredIndex,
          series: normalizedData[hoveredSeries],
          point: normalizedData[hoveredSeries]?.normalized.slice(-commonLength)[hoveredIndex],
        }
      : null;

  return (
    <div className="trend-chart-wrapper multi-trend-wrapper">
      <svg
        className="trend-chart multi-trend-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {normalizedData.map((n, i) => (
            <linearGradient
              key={`grad-${i}`}
              id={`multi-area-gradient-${n.metric}-${i}`}
              x1="0%" y1="0%" x2="0%" y2="100%"
            >
              <stop offset="0%" stopColor={n.range.color} stopOpacity="0.15" />
              <stop offset="100%" stopColor={n.range.color} stopOpacity="0.01" />
            </linearGradient>
          ))}
        </defs>

        <rect
          x={PADDING.left}
          y={okZoneTop}
          width={chartWidth}
          height={okZoneHeight}
          fill="#16a34a"
          fillOpacity="0.06"
        />

        {yTicks.map((tick, i) => (
          <g key={`ytick-${i}`}>
            <line
              x1={PADDING.left}
              y1={yScale(tick)}
              x2={width - PADDING.right}
              y2={yScale(tick)}
              stroke="#e2e8f0"
              strokeDasharray="3,3"
            />
            <text
              x={PADDING.left - 10}
              y={yScale(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="#64748b"
              fontSize="11"
            >
              {tick}%
            </text>
          </g>
        ))}

        {paths.map((p, i) => {
          const data = normalizedData[i].normalized.slice(-commonLength);
          const firstX = xScale(0, data.length);
          const lastX = xScale(data.length - 1, data.length);
          const bottomY = PADDING.top + chartHeight;
          const areaD = `${p.d} L ${lastX.toFixed(2)} ${bottomY} L ${firstX.toFixed(2)} ${bottomY} Z`;
          return (
            <g key={`series-${i}`}>
              <path d={areaD} fill={`url(#multi-area-gradient-${normalizedData[i].metric}-${i})`} />
              <path
                d={p.d}
                fill="none"
                stroke={p.color}
                strokeWidth={hoveredSeries === i ? 3 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: "stroke-width 0.15s ease" }}
              />
            </g>
          );
        })}

        {normalizedData.map((n, si) => {
          const data = n.normalized.slice(-commonLength);
          return data.map((pt, pi) => (
            <g key={`point-${si}-${pi}`}>
              <circle
                cx={xScale(pi, data.length)}
                cy={yScale(pt.normValue)}
                r={
                  hoveredSeries === si && hoveredIndex === pi
                    ? 6
                    : pt.status === "normal"
                      ? 3
                      : 4.5
                }
                fill={getPointColor(pt.status)}
                stroke={n.range.color}
                strokeWidth="2"
                style={{ cursor: "pointer", transition: "r 0.15s ease" }}
                onMouseEnter={() => {
                  setHoveredIndex(pi);
                  setHoveredSeries(si);
                }}
                onMouseLeave={() => {
                  setHoveredIndex(null);
                  setHoveredSeries(null);
                }}
              />
            </g>
          ));
        })}

        {xLabels.map((item, i) => (
          <text
            key={`xlabel-${i}`}
            x={xScale(item.index, commonLength)}
            y={height - PADDING.bottom + 20}
            textAnchor="middle"
            fill="#64748b"
            fontSize="11"
          >
            {item.label}
          </text>
        ))}

        {hoveredData && hoveredData.point && (
          <g>
            <line
              x1={xScale(hoveredData.pointIdx, commonLength)}
              y1={PADDING.top}
              x2={xScale(hoveredData.pointIdx, commonLength)}
              y2={height - PADDING.bottom}
              stroke={hoveredData.series.range.color}
              strokeWidth="1"
              strokeDasharray="4,4"
              opacity="0.5"
            />
            <g
              transform={`translate(${
                xScale(hoveredData.pointIdx, commonLength) + 12
              }, ${yScale(hoveredData.point.normValue) - 46})`}
            >
              <rect
                width="180"
                height="62"
                rx="6"
                fill="#1e293b"
                fillOpacity="0.92"
              />
              <text x="10" y="18" fill="#f1f5f9" fontSize="12" fontWeight="600">
                {formatDate(hoveredData.point.timestamp)}
              </text>
              <text x="10" y="38" fill={hoveredData.series.range.color} fontSize="12" fontWeight="600">
                {hoveredData.series.range.label}
              </text>
              <text x="10" y="56" fill="#cbd5e1" fontSize="11">
                {formatValue(hoveredData.point.value)}{hoveredData.series.range.unit}
                {" · "}
                <tspan
                  fill={
                    hoveredData.point.status === "normal"
                      ? "#22c55e"
                      : hoveredData.point.status === "warning"
                        ? "#f59e0b"
                        : "#ef4444"
                  }
                >
                  {hoveredData.point.status === "normal"
                    ? "正常"
                    : hoveredData.point.status === "warning"
                      ? "关注"
                      : "异常"}
                </tspan>
              </text>
            </g>
          </g>
        )}
      </svg>

      <div className="trend-legend multi-trend-legend">
        {normalizedData.map((n, i) => (
          <div
            key={n.metric}
            className={`trend-legend-item ${hoveredSeries === i ? "legend-item-active" : ""}`}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoveredSeries(i)}
            onMouseLeave={() => setHoveredSeries(null)}
          >
            <span
              className="legend-dot"
              style={{ background: n.range.color }}
            />
            <span style={{ fontWeight: hoveredSeries === i ? 700 : 500 }}>
              {n.range.label}
            </span>
            <span className="legend-range-hint">
              ({n.range.ok[0]}~{n.range.ok[1]}{n.range.unit})
            </span>
          </div>
        ))}
        <div className="trend-legend-split" />
        <div className="trend-legend-item">
          <span className="legend-dot legend-ok" />
          <span>正常</span>
        </div>
        <div className="trend-legend-item">
          <span className="legend-dot legend-warning" />
          <span>关注</span>
        </div>
        <div className="trend-legend-item">
          <span className="legend-dot legend-danger" />
          <span>异常</span>
        </div>
      </div>

      <div className="multi-trend-axis-note">
        Y 轴为各指标归一化百分比（基于自身警戒范围），以便对比走势
      </div>
    </div>
  );
}
