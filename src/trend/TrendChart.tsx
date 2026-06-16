import { useMemo, useState } from "react";
import { TrendDataPoint, TrendMetric, METRIC_RANGES } from "./types";

interface TrendChartProps {
  data: TrendDataPoint[];
  metric: TrendMetric;
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
