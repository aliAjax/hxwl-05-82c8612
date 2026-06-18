import type { TankDashboardInfo } from "./types";
import type { WaterRecord, WaterChangePlan, AlertItem } from "../db/types";
import type { RiskFactor } from "../riskEngine";
import { getRiskLevelColor } from "../riskEngine";
import "../styles.css";

interface RiskTraceabilityViewProps {
  info: TankDashboardInfo;
  records: WaterRecord[];
  overduePlans: WaterChangePlan[];
  pendingAlerts: AlertItem[];
  onClose: () => void;
  onJumpToAlert?: (alertId: string) => void;
  onJumpToWaterChangePlan?: (planId: string) => void;
  onJumpToAllAlerts?: () => void;
  onJumpToAllPlans?: () => void;
}

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

const formatDateShort = (dateStr: string) => {
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const getPlanDaysText = (plan: WaterChangePlan): string => {
  if (plan.completedAt) return "已完成";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextDate = new Date(plan.nextDate);
  nextDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(
    (nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "今天";
  if (diffDays > 0) return `${diffDays}天后`;
  return `逾期${Math.abs(diffDays)}天`;
};

export function RiskTraceabilityView({
  info,
  records,
  overduePlans,
  pendingAlerts,
  onClose,
  onJumpToAlert,
  onJumpToWaterChangePlan,
  onJumpToAllAlerts,
  onJumpToAllPlans,
}: RiskTraceabilityViewProps) {
  const { tank, customer, riskAssessment } = info;
  const risk = riskAssessment;
  const isLowRisk = risk.riskLevel === "低风险";
  const recentRecords = records.slice(0, 5);

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
              <h2>{tank.name} · 风险溯源</h2>
              <span
                className="record-status"
                style={{
                  backgroundColor: getRiskLevelColor(risk.riskLevel),
                  color: "#fff",
                  border: "none",
                }}
              >
                {risk.riskLevel}
              </span>
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
                      backgroundColor: getRiskLevelColor(risk.riskLevel),
                    }}
                  >
                    {risk.riskLevel}
                  </div>
                  <p className="risk-summary">{risk.summary}</p>
                </div>
              </div>
            </div>
          </section>

          {isLowRisk && risk.lowRiskReasons && risk.lowRiskReasons.length > 0 && (
            <section className="detail-section">
              <h3>低风险判定依据（{risk.lowRiskReasons.length}项）</h3>
              <div className="risk-low-reasons-list">
                {risk.lowRiskReasons.map((reason, idx) => (
                  <div key={idx} className="risk-low-reason-item">
                    <span className="risk-low-reason-icon">✓</span>
                    <p>{reason}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!isLowRisk && risk.factors.length > 0 && (
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

          {!isLowRisk && risk.recommendations.length > 0 && (
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
            <div className="detail-section-header-with-action">
              <h3>关联最近记录（{recentRecords.length}条）</h3>
            </div>
            {recentRecords.length === 0 ? (
              <div className="empty-state empty-state-compact">
                <div className="empty-icon">📋</div>
                <p>暂无水质记录</p>
              </div>
            ) : (
              <div className="detail-record-list">
                {recentRecords.map((record, idx) => (
                  <article key={record.id} className="detail-record-item">
                    <div className={`record-index ${
                      record.status === "稳定" ? "status-ok" :
                      record.status === "关注" ? "status-watch" : "status-danger"
                    }`}>
                      {String(idx + 1).padStart(2, "0")}
                    </div>
                    <div className="detail-record-content">
                      <header className="detail-record-header">
                        <span className="record-time">{formatDateShort(record.recordedAt)}</span>
                        <span className={`record-status record-status-${record.status}`}>
                          {record.status}
                        </span>
                      </header>
                      {record.note && (
                        <p className="detail-record-note">{record.note}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="detail-section">
            <div className="detail-section-header-with-action">
              <h3>逾期换水计划（{overduePlans.length}个）</h3>
              {overduePlans.length > 0 && onJumpToAllPlans && (
                <button
                  className="secondary-action traceability-action-btn"
                  onClick={onJumpToAllPlans}
                >
                  📅 查看全部计划
                </button>
              )}
            </div>
            {overduePlans.length === 0 ? (
              <div className="empty-state empty-state-compact">
                <div className="empty-icon">✅</div>
                <p>暂无逾期换水计划</p>
              </div>
            ) : (
              <div className="traceability-plan-list">
                {overduePlans.map((plan) => (
                  <article key={plan.id} className="traceability-plan-item">
                    <div className="traceability-plan-info">
                      <h4>{plan.tankName}</h4>
                      <p>
                        下次换水：<strong>{plan.nextDate}</strong>
                        <span className="traceability-plan-days overdue">
                          {getPlanDaysText(plan)}
                        </span>
                      </p>
                      <p className="traceability-plan-meta">
                        周期：每{plan.cycleDays}天 · 比例：{plan.waterRatio}%
                      </p>
                      {plan.note && (
                        <p className="traceability-plan-note">备注：{plan.note}</p>
                      )}
                    </div>
                    {onJumpToWaterChangePlan && (
                      <button
                        className="primary-action traceability-action-btn-small"
                        onClick={() => onJumpToWaterChangePlan(plan.id)}
                      >
                        立即处理
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="detail-section">
            <div className="detail-section-header-with-action">
              <h3>未处理提醒（{pendingAlerts.length}条）</h3>
              {pendingAlerts.length > 0 && onJumpToAllAlerts && (
                <button
                  className="secondary-action traceability-action-btn"
                  onClick={onJumpToAllAlerts}
                >
                  🔔 查看全部提醒
                </button>
              )}
            </div>
            {pendingAlerts.length === 0 ? (
              <div className="empty-state empty-state-compact">
                <div className="empty-icon">✅</div>
                <p>暂无未处理提醒</p>
              </div>
            ) : (
              <div className="traceability-alert-list">
                {pendingAlerts.map((alert) => (
                  <article
                    key={alert.id}
                    className={`traceability-alert-item traceability-alert-${alert.severity}`}
                  >
                    <div className="traceability-alert-info">
                      <div className="traceability-alert-header">
                        <span className={`alert-severity alert-severity-${alert.severity}`}>
                          {alert.severity === "severe" ? "严重" : "轻微"}
                        </span>
                        <strong>{alert.metricLabel} {alert.value}{alert.unit}</strong>
                      </div>
                      <p className="traceability-alert-desc">{alert.description}</p>
                      <p className="traceability-alert-meta">
                        创建时间：{formatDateShort(alert.createdAt)}
                      </p>
                    </div>
                    {onJumpToAlert && (
                      <button
                        className="primary-action traceability-action-btn-small"
                        onClick={() => onJumpToAlert(alert.id)}
                      >
                        处理提醒
                      </button>
                    )}
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
