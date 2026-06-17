import { useState } from "react";
import {
  offlineSyncStore,
  type OfflineAlert,
} from "../offlineSync";
import { SyncBadge } from "./SyncBadge";

export function AlertReminderPanel() {
  const [alerts, setAlerts] = useState<OfflineAlert[]>(() =>
    offlineSyncStore.getAlerts()
  );
  const [statusFilter, setStatusFilter] = useState<string>("全部");

  const refresh = () => {
    setAlerts(offlineSyncStore.getAlerts());
  };

  const handleProcess = (alertId: string) => {
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const processedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const updatedSyncMeta = alert.syncMeta.syncStatus === "synced"
      ? { ...alert.syncMeta, syncStatus: "pending" as const, pendingOperation: "update" as const }
      : { ...alert.syncMeta, syncStatus: "pending" as const };

    offlineSyncStore.saveAlert({
      ...alert,
      status: "processed",
      treatment: "other",
      treatmentNote: "已跟进处理（离线记录）",
      handler: "店员",
      processedAt,
      syncMeta: updatedSyncMeta,
    });
    offlineSyncStore.addToQueue("alert", alertId, "update", {
      ...alert,
      status: "processed",
      treatment: "other",
      treatmentNote: "已跟进处理（离线记录）",
      handler: "店员",
      processedAt,
      syncMeta: updatedSyncMeta,
    });
    refresh();
  };

  const filteredAlerts = alerts.filter((a) => {
    if (statusFilter === "全部") return true;
    if (statusFilter === "待处理") return a.status === "pending";
    if (statusFilter === "已处理") return a.status === "processed";
    return true;
  });

  const pendingCount = alerts.filter((a) => a.status === "pending").length;

  return (
    <section className="panel offline-workflow-panel">
      <div className="section-heading">
        <div>
          <p className="offline-section-tag">🚨 离线工作流</p>
          <h2>
            异常提醒
            {pendingCount > 0 && (
              <span className="alert-pending-badge">{pendingCount}</span>
            )}
          </h2>
        </div>
      </div>

      <div className="record-filter-bar">
        <span className="filter-label">处理状态：</span>
        <div className="chips muted">
          {["全部", "待处理", "已处理"].map((f) => (
            <button
              key={f}
              className={statusFilter === f ? "chip-active" : ""}
              onClick={() => setStatusFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filteredAlerts.length === 0 ? (
        <div className="empty-state empty-state-compact">
          <div className="empty-icon">✅</div>
          <h3>暂无异常提醒</h3>
          <p>系统会在检测到水质异常时自动生成提醒。</p>
        </div>
      ) : (
        <div className="alert-grid">
          {filteredAlerts.map((alert) => (
            <article
              key={alert.id}
              className={`offline-alert-card offline-alert-${alert.severity} ${
                alert.status === "processed" ? "offline-alert-processed" : ""
              }`}
            >
              <header className="offline-alert-header">
                <div>
                  <span
                    className={`offline-alert-severity offline-alert-severity-${alert.severity}`}
                  >
                    {alert.severity === "severe" ? "严重" : "轻微"}
                  </span>
                  <h3>{alert.tankName} · {alert.metric}</h3>
                </div>
                <SyncBadge syncMeta={alert.syncMeta} size="sm" />
              </header>
              <div className="offline-alert-values">
                <span className="alert-value-display">
                  当前值: <strong>{alert.value}</strong>
                </span>
                <span className="alert-threshold-display">
                  阈值: {alert.threshold}
                </span>
              </div>
              <p className="offline-alert-desc">{alert.description}</p>
              <div className="offline-alert-footer">
                <span className="offline-alert-status">
                  {alert.status === "pending" ? "待处理" : "已处理"}
                </span>
                <span className="offline-alert-time">{alert.createdAt}</span>
              </div>
              {alert.status === "pending" && (
                <div className="offline-alert-actions">
                  <button
                    className="primary-action"
                    onClick={() => handleProcess(alert.id)}
                  >
                    ✓ 标记已跟进（离线）
                  </button>
                </div>
              )}
              {alert.status === "processed" && alert.treatmentNote && (
                <div className="offline-alert-treatment">
                  <p>
                    <strong>处理方式：</strong>
                    {alert.treatmentNote}
                  </p>
                  <p className="alert-treatment-meta">
                    处理人: {alert.handler} · {alert.processedAt}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
