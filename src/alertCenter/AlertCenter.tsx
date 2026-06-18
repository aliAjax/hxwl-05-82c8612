import { useState, useMemo, useEffect } from "react";
import {
  AlertItem,
  AlertSeverity,
  AlertStatus,
  TreatmentAction,
  TREATMENT_ACTIONS,
  TankType,
  AlertMetric,
  AlertMetricValues,
} from "./types";
import {
  evaluateMetricValue,
  getAlertMetricKeys,
  formatThresholdRange,
  buildAlertDescription,
  getMetricThreshold,
} from "./thresholdConfig";
import type { CustomThresholds } from "../db/types";

interface AlertCenterProps {
  alerts: AlertItem[];
  onProcessAlert: (
    alertId: string,
    treatment: TreatmentAction,
    treatmentNote: string,
    handler: string
  ) => void;
  pendingCount: number;
  targetAlertId?: string | null;
  onTargetAlertHandled?: () => void;
}

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  mild: "轻微关注",
  severe: "严重异常",
};

const STATUS_LABELS: Record<AlertStatus, string> = {
  pending: "待处理",
  processed: "已处理",
};

type AlertFilter = "全部" | "严重异常" | "轻微关注" | "已处理";

const ALERT_FILTER_OPTIONS: AlertFilter[] = ["全部", "严重异常", "轻微关注", "已处理"];

function AlertCenter({ alerts, onProcessAlert, pendingCount, targetAlertId, onTargetAlertHandled }: AlertCenterProps) {
  const [filter, setFilter] = useState<AlertFilter>("全部");
  const [processingAlertId, setProcessingAlertId] = useState<string | null>(null);
  const [treatment, setTreatment] = useState<TreatmentAction>("换水");
  const [treatmentNote, setTreatmentNote] = useState("");
  const [handler, setHandler] = useState("");

  useEffect(() => {
    if (targetAlertId) {
      openProcessModal(targetAlertId);
      if (onTargetAlertHandled) onTargetAlertHandled();
    }
  }, [targetAlertId]);

  const filteredAlerts = useMemo(() => {
    let result = [...alerts];
    if (filter === "严重异常") result = result.filter((a) => a.severity === "severe" && a.status === "pending");
    else if (filter === "轻微关注") result = result.filter((a) => a.severity === "mild" && a.status === "pending");
    else if (filter === "已处理") result = result.filter((a) => a.status === "processed");
    result.sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      if (a.severity !== b.severity) return a.severity === "severe" ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return result;
  }, [alerts, filter]);

  const openProcessModal = (alertId: string) => {
    setProcessingAlertId(alertId);
    setTreatment("换水");
    setTreatmentNote("");
    setHandler("");
  };

  const closeProcessModal = () => {
    setProcessingAlertId(null);
  };

  const handleProcessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!processingAlertId) return;
    if (!handler.trim()) {
      alert("请填写处理人");
      return;
    }
    onProcessAlert(processingAlertId, treatment, treatmentNote, handler.trim());
    closeProcessModal();
  };

  const processingAlert = processingAlertId
    ? alerts.find((a) => a.id === processingAlertId)
    : null;

  const getFilterCount = (f: AlertFilter): number => {
    if (f === "全部") return alerts.length;
    if (f === "严重异常") return alerts.filter((a) => a.severity === "severe" && a.status === "pending").length;
    if (f === "轻微关注") return alerts.filter((a) => a.severity === "mild" && a.status === "pending").length;
    if (f === "已处理") return alerts.filter((a) => a.status === "processed").length;
    return 0;
  };

  return (
    <section className="alert-center panel">
      <div className="section-heading">
        <div>
          <p>异常监控</p>
          <h2>
            指标提醒中心
            {pendingCount > 0 && (
              <span className="alert-badge">{pendingCount}</span>
            )}
          </h2>
        </div>
      </div>

      <div className="chips muted alert-filter-chips">
        {ALERT_FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            className={filter === f ? "chip-active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
            <span className="chip-count">{getFilterCount(f)}</span>
          </button>
        ))}
      </div>

      {filteredAlerts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔔</div>
          <h3>暂无异常提醒</h3>
          <p>
            {alerts.length === 0
              ? "水质记录录入后，系统将根据缸型安全阈值自动检测超标指标并生成提醒。"
              : `当前「${filter}」分类下暂无提醒，试试切换其他筛选分类。`}
          </p>
        </div>
      ) : (
        <div className="alert-grid">
          {filteredAlerts.map((alert) => (
            <article
              key={alert.id}
              className={`alert-card alert-card-${alert.severity} ${
                alert.status === "processed" ? "alert-card-processed" : ""
              }`}
            >
              <header className="alert-card-header">
                <div>
                  <span
                    className={`alert-severity alert-severity-${alert.severity}`}
                  >
                    {SEVERITY_LABELS[alert.severity]}
                  </span>
                  <h3>{alert.tankName}</h3>
                </div>
                <div className="alert-actions">
                  {alert.status === "pending" && (
                    <button
                      className="alert-action-btn alert-action-process"
                      onClick={() => openProcessModal(alert.id)}
                    >
                      处理
                    </button>
                  )}
                  <span
                    className={`alert-status alert-status-${alert.status}`}
                  >
                    {STATUS_LABELS[alert.status]}
                  </span>
                </div>
              </header>
              <dl className="alert-info-list">
                <div>
                  <dt>异常指标</dt>
                  <dd>
                    {alert.metricLabel}{" "}
                    <strong className="alert-value">{alert.value}</strong>
                    {alert.unit}
                  </dd>
                </div>
                <div>
                  <dt>安全阈值</dt>
                  <dd className="alert-threshold">{alert.thresholdRange}</dd>
                </div>
                <div>
                  <dt>缸型</dt>
                  <dd>{alert.tankType}</dd>
                </div>
                <div>
                  <dt>检测时间</dt>
                  <dd>{alert.recordedAt}</dd>
                </div>
              </dl>
              <p className="alert-description">{alert.description}</p>
              {alert.status === "processed" && (
                <div className="alert-treatment-result">
                  <div className="alert-treatment-divider" />
                  <dl className="alert-info-list">
                    <div>
                      <dt>处理措施</dt>
                      <dd>
                        <span className="alert-treatment-tag">
                          {alert.treatment}
                        </span>
                      </dd>
                    </div>
                    {alert.treatmentNote && (
                      <div>
                        <dt>处理备注</dt>
                        <dd>{alert.treatmentNote}</dd>
                      </div>
                    )}
                    <div>
                      <dt>处理人</dt>
                      <dd>{alert.handler}</dd>
                    </div>
                    <div>
                      <dt>处理时间</dt>
                      <dd>{alert.processedAt}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {processingAlert && (
        <div className="modal-overlay" onClick={closeProcessModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>处理异常提醒</h2>
              <button className="modal-close" onClick={closeProcessModal}>
                ×
              </button>
            </header>
            <div className="modal-alert-summary">
              <span className={`alert-severity alert-severity-${processingAlert.severity}`}>
                {SEVERITY_LABELS[processingAlert.severity]}
              </span>
              <strong>
                {processingAlert.tankName} — {processingAlert.metricLabel}{" "}
                {processingAlert.value}
                {processingAlert.unit}
              </strong>
              <p>{processingAlert.description}</p>
            </div>
            <form onSubmit={handleProcessSubmit} className="modal-form">
              <div className="form-grid">
                <label>
                  <span>处理措施 *</span>
                  <select
                    value={treatment}
                    onChange={(e) => setTreatment(e.target.value as TreatmentAction)}
                  >
                    {TREATMENT_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>处理人 *</span>
                  <input
                    type="text"
                    value={handler}
                    onChange={(e) => setHandler(e.target.value)}
                    placeholder="例如：张师傅"
                  />
                </label>
                <label className="form-full">
                  <span>处理备注</span>
                  <input
                    type="text"
                    value={treatmentNote}
                    onChange={(e) => setTreatmentNote(e.target.value)}
                    placeholder="例如：已换水30%，后续观察"
                  />
                </label>
              </div>
              <footer className="modal-footer">
                <button type="button" onClick={closeProcessModal}>
                  取消
                </button>
                <button type="submit" className="primary-action">
                  确认处理
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export function generateAlertsFromRecord(
  recordId: string,
  tankName: string,
  tankId: string | undefined,
  tankType: TankType | string,
  metrics: AlertMetricValues,
  recordedAt: string,
  customThresholds?: CustomThresholds
): AlertItem[] {
  const alerts: AlertItem[] = [];
  const metricKeys = getAlertMetricKeys();

  for (const key of metricKeys) {
    const rawValue = metrics[key];
    if (!rawValue.trim()) continue;

    const result = evaluateMetricValue(tankType, key, rawValue, customThresholds);
    if (!result || result.status === "ok") continue;

    const threshold = result.threshold;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    alerts.push({
      id: `${recordId}-${key}-${Date.now()}`,
      tankName,
      tankId,
      tankType,
      metric: key,
      metricLabel: threshold.label,
      value: rawValue,
      unit: threshold.unit,
      severity: result.status === "severe" ? "severe" : "mild",
      status: "pending",
      thresholdRange: formatThresholdRange(threshold),
      description: buildAlertDescription(
        threshold.label,
        rawValue,
        threshold.unit,
        result.status === "severe" ? "severe" : "mild",
        threshold
      ),
      recordId,
      recordedAt,
      createdAt,
    });
  }

  return alerts;
}

export { AlertCenter };
