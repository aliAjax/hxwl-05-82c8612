import type { TankDashboardInfo } from "./types";
import type { WaterRecord, WaterMetrics } from "../db/types";
import type { RiskFactor, RiskLevel } from "../riskEngine";
import { getRiskLevelColor } from "../riskEngine";

interface TankDetailPanelProps {
  info: TankDashboardInfo;
  records: WaterRecord[];
  onClose: () => void;
}

const METRIC_LABELS: Record<keyof Omit<WaterMetrics, "waterChange">, string> = {
  ph: "pH",
  ammonia: "氨氮",
  nitrite: "亚硝酸盐",
  nitrate: "硝酸盐",
  hardness: "硬度",
  temperature: "温度",
};

const METRIC_UNITS: Record<keyof Omit<WaterMetrics, "waterChange">, string> = {
  ph: "",
  ammonia: "ppm",
  nitrite: "ppm",
  nitrate: "ppm",
  hardness: "dGH",
  temperature: "°C",
};

const FACTOR_TYPE_LABELS: Record<RiskFactor["type"], string> = {
  single_threshold: "单次阈值超标",
  continuous_rise: "连续升高趋势",
  rapid_fluctuation: "快速波动",
  no_water_change_long: "长期未换水",
  retest_still_abnormal: "复测仍异常",
  capacity_sensitivity: "水体敏感度",
  multiple_abnormal_metrics: "多项指标异常",
};

function getRiskScoreProgressColor(score: number): string {
  if (score >= 50) return "#dc2626";
  if (score >= 25) return "#ea580c";
  if (score >= 10) return "#f59e0b";
  return "#16a34a";
}

export function TankDetailPanel({ info, records, onClose }: TankDetailPanelProps) {
  const { tank, customer, latestRecord, nextPlan, riskLevel, pendingAlerts, riskAssessment } = info;
  const risk = riskAssessment;

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="detail-header">
          <div>
            <div className="detail-title-row">
              <span className={`tank-type-tag tank-type-${tank.tankType}`}>
                {tank.tankType}
              </span>
              <h2>{tank.name}</h2>
              <span
                className="record-status"
                style={{
                  backgroundColor: getRiskLevelColor(risk.riskLevel as RiskLevel),
                  color: "#fff",
                  border: "none",
                }}
              >
                {risk.riskLevel}
              </span>
              {pendingAlerts > 0 && (
                <span className="dashboard-alert-badge">
                  {pendingAlerts} 条待处理告警
                </span>
              )}
            </div>
            {customer && (
              <p className="detail-customer">
                👤 {customer.name} · {customer.address} · {customer.phone}
              </p>
            )}
          </div>
          <button className="detail-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="detail-body">
          <section className="detail-section detail-risk-overview">
            <h3>综合风险评估</h3>
            <div className="risk-overview-card">
              <div className="risk-score-display">
                <div className="risk-score-circle">
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="10"
                    />
                    <circle
                      cx="60"
                      cy="60"
                      r="50"
                      fill="none"
                      stroke={getRiskScoreProgressColor(risk.totalScore)}
                      strokeWidth="10"
                      strokeDasharray={`${Math.min(risk.totalScore, 100) * 3.14} 314`}
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                    />
                  </svg>
                  <div className="risk-score-text">
                    <strong>{risk.totalScore}</strong>
                    <span>风险分</span>
                  </div>
                </div>
                <div className="risk-level-info">
                  <div
                    className="risk-level-badge"
                    style={{
                      backgroundColor: getRiskLevelColor(risk.riskLevel as RiskLevel),
                    }}
                  >
                    {risk.riskLevel}
                  </div>
                  <p className="risk-summary">{risk.summary}</p>
                </div>
              </div>
            </div>
          </section>

          {risk.factors.length > 0 && (
            <section className="detail-section">
              <h3>风险触发因素（{risk.factors.length}项）</h3>
              <div className="risk-factors-list">
                {risk.factors.map((factor, idx) => (
                  <div
                    key={idx}
                    className={`risk-factor-item risk-factor-${factor.severity}`}
                  >
                    <div className="risk-factor-header">
                      <span className="risk-factor-type-tag">
                        {FACTOR_TYPE_LABELS[factor.type]}
                      </span>
                      <span className={`risk-factor-severity risk-factor-severity-${factor.severity}`}>
                        {factor.severity === "severe" ? "严重" : "轻微"}
                      </span>
                      <span className="risk-factor-score">+{factor.score}分</span>
                    </div>
                    <p className="risk-factor-description">{factor.description}</p>
                    {factor.evidence && (
                      <p className="risk-factor-evidence">📊 依据：{factor.evidence}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {risk.recommendations.length > 0 && (
            <section className="detail-section">
              <h3>维护建议</h3>
              <ul className="risk-recommendations-list">
                {risk.recommendations.map((rec, idx) => (
                  <li key={idx}>
                    <span className="rec-icon">💡</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="detail-section">
            <h3>鱼缸信息</h3>
            <div className="detail-info-grid">
              <div>
                <dt>容量</dt>
                <dd>{tank.capacity || "—"}</dd>
              </div>
              <div>
                <dt>开缸日期</dt>
                <dd>{tank.setupDate || "—"}</dd>
              </div>
              <div>
                <dt>主要生物</dt>
                <dd>{tank.mainCreatures || "—"}</dd>
              </div>
              <div>
                <dt>维护负责人</dt>
                <dd>{tank.maintainer || customer?.maintainer || "—"}</dd>
              </div>
            </div>
          </section>

          {nextPlan && (
            <section className="detail-section">
              <h3>换水计划</h3>
              <div className="detail-info-grid">
                <div>
                  <dt>下次换水</dt>
                  <dd className="detail-highlight">
                    {nextPlan.nextDate}
                    <span className="dashboard-days">
                      {(() => {
                        if (nextPlan.completedAt) return "已完成";
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const d = new Date(nextPlan.nextDate);
                        d.setHours(0, 0, 0, 0);
                        const diff = Math.ceil(
                          (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                        );
                        if (diff === 0) return "今天";
                        if (diff === 1) return "明天";
                        if (diff > 0) return `${diff}天后`;
                        return `逾期${Math.abs(diff)}天`;
                      })()}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>换水周期</dt>
                  <dd>每 {nextPlan.cycleDays} 天</dd>
                </div>
                <div>
                  <dt>换水比例</dt>
                  <dd>{nextPlan.waterRatio}%</dd>
                </div>
                <div>
                  <dt>备注</dt>
                  <dd>{nextPlan.note || "—"}</dd>
                </div>
              </div>
            </section>
          )}

          {latestRecord && (
            <section className="detail-section">
              <h3>最近一次检测（{latestRecord.recordedAt}）</h3>
              <div className="detail-metrics-grid">
                {(Object.keys(METRIC_LABELS) as (keyof Omit<WaterMetrics, "waterChange">)[]).map(
                  (key) => {
                    const value = latestRecord.metrics[key];
                    if (!value) return null;
                    return (
                      <div key={key} className="detail-metric-card">
                        <span className="detail-metric-label">
                          {METRIC_LABELS[key]}
                        </span>
                        <strong className="detail-metric-value">
                          {value}
                          <span className="detail-metric-unit">
                            {METRIC_UNITS[key]}
                          </span>
                        </strong>
                      </div>
                    );
                  }
                )}
                {latestRecord.metrics.waterChange && (
                  <div className="detail-metric-card">
                    <span className="detail-metric-label">换水量</span>
                    <strong className="detail-metric-value">
                      {latestRecord.metrics.waterChange}
                    </strong>
                  </div>
                )}
              </div>
              {latestRecord.note && (
                <p className="detail-note">{latestRecord.note}</p>
              )}
            </section>
          )}

          <section className="detail-section">
            <h3>近期水质记录（{records.length}条）</h3>
            {records.length === 0 ? (
              <div className="empty-state empty-state-compact">
                <div className="empty-icon">💧</div>
                <p>暂无水质记录</p>
              </div>
            ) : (
              <div className="detail-record-list">
                {records.slice(0, 20).map((record, idx) => (
                  <article key={record.id} className="detail-record-item">
                    <div className={`record-index ${
                      record.status === "稳定" ? "status-ok" :
                      record.status === "关注" ? "status-watch" : "status-danger"
                    }`}>
                      {String(idx + 1).padStart(2, "0")}
                    </div>
                    <div className="detail-record-content">
                      <header className="detail-record-header">
                        <span className="record-time">{record.recordedAt}</span>
                        <span className={`record-status record-status-${record.status}`}>
                          {record.status}
                        </span>
                      </header>
                      <div className="detail-record-metrics">
                        {(Object.keys(METRIC_LABELS) as (keyof Omit<WaterMetrics, "waterChange">)[]).map(
                          (key) => {
                            const v = record.metrics[key];
                            if (!v) return null;
                            return (
                              <span key={key} className="detail-metric-chip">
                                {METRIC_LABELS[key]} {v}{METRIC_UNITS[key]}
                              </span>
                            );
                          }
                        )}
                        {record.metrics.waterChange && (
                          <span className="detail-metric-chip">
                            换水量 {record.metrics.waterChange}
                          </span>
                        )}
                      </div>
                      {record.note && (
                        <p className="detail-record-note">{record.note}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
