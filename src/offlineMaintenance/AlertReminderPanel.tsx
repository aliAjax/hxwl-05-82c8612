import { useEffect, useState } from "react";
import {
  offlineSyncStore,
  type OfflineAlert,
  type OfflineRetestTask,
  type OfflineTreatmentAction,
} from "../offlineSync";
import { SyncBadge } from "./SyncBadge";

const OFFLINE_TREATMENT_OPTIONS: OfflineTreatmentAction[] = [
  "复测",
  "换水",
  "停喂",
  "补菌",
  "温度调整",
  "其他",
];

const RETEST_TRIGGER_TREATMENTS: OfflineTreatmentAction[] = ["复测", "换水", "停喂"];

export function AlertReminderPanel() {
  const [alerts, setAlerts] = useState<OfflineAlert[]>(() =>
    offlineSyncStore.getAlerts()
  );
  const [retestTasks, setRetestTasks] = useState<OfflineRetestTask[]>(() =>
    offlineSyncStore.getRetestTasks()
  );
  const [statusFilter, setStatusFilter] = useState<string>("全部");
  const [selectedAlert, setSelectedAlert] = useState<OfflineAlert | null>(null);
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [treatment, setTreatment] = useState<OfflineTreatmentAction>("其他");
  const [treatmentNote, setTreatmentNote] = useState("");
  const [handler, setHandler] = useState("店员");

  const refresh = () => {
    setAlerts(offlineSyncStore.getAlerts());
    setRetestTasks(offlineSyncStore.getRetestTasks());
  };

  useEffect(() => {
    return offlineSyncStore.subscribe(refresh);
  }, []);

  const handleOpenProcess = (alert: OfflineAlert) => {
    setSelectedAlert(alert);
    setTreatment("其他");
    setTreatmentNote("");
    setHandler("店员");
    setShowProcessDialog(true);
  };

  const handleProcess = () => {
    if (!selectedAlert) return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const processedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const updatedSyncMeta =
      selectedAlert.syncMeta.syncStatus === "synced"
        ? {
            ...selectedAlert.syncMeta,
            syncStatus: "pending" as const,
            pendingOperation: "update" as const,
          }
        : { ...selectedAlert.syncMeta, syncStatus: "pending" as const };

    const updatedAlert = offlineSyncStore.saveAlert({
      ...selectedAlert,
      status: "processed",
      treatment,
      treatmentNote: treatmentNote || undefined,
      handler,
      processedAt,
      syncMeta: updatedSyncMeta,
    });

    offlineSyncStore.addToQueue("alert", selectedAlert.id, "update", updatedAlert);

    if (RETEST_TRIGGER_TREATMENTS.includes(treatment)) {
      const { retestTask } = offlineSyncStore.createRetestTaskFromAlert(
        updatedAlert,
        treatment,
        treatmentNote,
        handler
      );
      offlineSyncStore.addToQueue("retestTask", retestTask.id, "create", retestTask);
    }

    setShowProcessDialog(false);
    setSelectedAlert(null);
    refresh();
  };

  const pendingCount = alerts.filter((a) => a.status === "pending").length;

  const filteredAlerts = alerts.filter((a) => {
    if (statusFilter === "全部") return true;
    if (statusFilter === "待处理") return a.status === "pending";
    if (statusFilter === "已处理") return a.status === "processed";
    return true;
  });

  const getRetestTaskForAlert = (alertId: string): OfflineRetestTask | undefined => {
    return retestTasks.find((t) => t.sourceAlertId === alertId);
  };

  const getRetestStatusLabel = (status: OfflineRetestTask["status"]): string => {
    const labels: Record<OfflineRetestTask["status"], string> = {
      pending: "待复测",
      overdue: "已逾期",
      completed: "已复测",
    };
    return labels[status];
  };

  const getRetestStatusClass = (status: OfflineRetestTask["status"]): string => {
    const classes: Record<OfflineRetestTask["status"], string> = {
      pending: "retest-status-pending",
      overdue: "retest-status-overdue",
      completed: "retest-status-completed",
    };
    return classes[status];
  };

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
          {filteredAlerts.map((alert) => {
            const retestTask = getRetestTaskForAlert(alert.id);
            return (
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
                    <h3>
                      {alert.tankName} · {alert.metricLabel || alert.metric}
                    </h3>
                  </div>
                  <SyncBadge syncMeta={alert.syncMeta} size="sm" />
                </header>
                <div className="offline-alert-values">
                  <span className="alert-value-display">
                    当前值: <strong>{alert.value}{alert.unit || ""}</strong>
                  </span>
                  <span className="alert-threshold-display">
                    阈值: {alert.thresholdRange || alert.threshold}
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
                      onClick={() => handleOpenProcess(alert)}
                    >
                      ✓ 处理异常（离线）
                    </button>
                  </div>
                )}

                {alert.status === "processed" && alert.treatment && (
                  <div className="offline-alert-treatment">
                    <p>
                      <strong>处理措施：</strong>
                      <span className="alert-treatment-tag">{alert.treatment}</span>
                    </p>
                    {alert.treatmentNote && (
                      <p className="treatment-note">
                        <strong>备注：</strong>{alert.treatmentNote}
                      </p>
                    )}
                    <p className="alert-treatment-meta">
                      处理人: {alert.handler} · {alert.processedAt}
                    </p>
                  </div>
                )}

                {retestTask && (
                  <div className="offline-alert-retest">
                    <div className="offline-alert-retest-header">
                      <span
                        className={`offline-retest-status ${getRetestStatusClass(
                          retestTask.status
                        )}`}
                      >
                        {getRetestStatusLabel(retestTask.status)}
                      </span>
                      {alert.isClosed && (
                        <span className="alert-closed-tag">✓ 已闭环</span>
                      )}
                    </div>
                    <dl className="retest-mini-info">
                      <div>
                        <dt>复测日期</dt>
                        <dd>{retestTask.dueDate}</dd>
                      </div>
                      <div>
                        <dt>原始值</dt>
                        <dd className="retest-original">
                          {retestTask.originalValue}{retestTask.originalUnit}
                        </dd>
                      </div>
                      {retestTask.retestValue && (
                        <div>
                          <dt>复测值</dt>
                          <dd
                            className={
                              retestTask.retestResult === "recovered"
                                ? "retest-recovered"
                                : "retest-not-recovered"
                            }
                          >
                            {retestTask.retestValue}{retestTask.originalUnit}
                          </dd>
                        </div>
                      )}
                      {retestTask.retestResult && (
                        <div>
                          <dt>结论</dt>
                          <dd>
                            {retestTask.retestResult === "recovered"
                              ? "✓ 已恢复"
                              : "⚠ 未恢复"}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {showProcessDialog && selectedAlert && (
        <div className="modal-overlay" onClick={() => setShowProcessDialog(false)}>
          <div
            className="modal-content alert-process-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h3>处理异常提醒</h3>
              <button
                className="modal-close-btn"
                onClick={() => setShowProcessDialog(false)}
              >
                ✕
              </button>
            </header>

            <div className="modal-body">
              <div className="alert-process-summary">
                <p>
                  <strong>{selectedAlert.tankName}</strong> ·{" "}
                  {selectedAlert.metricLabel || selectedAlert.metric}
                </p>
                <p className="alert-process-value">
                  当前值: <strong>{selectedAlert.value}{selectedAlert.unit || ""}</strong>
                  <span className="alert-process-threshold">
                    （阈值: {selectedAlert.thresholdRange || selectedAlert.threshold}）
                  </span>
                </p>
                <p className="alert-process-desc">{selectedAlert.description}</p>
              </div>

              <div className="alert-process-form">
                <label className="form-full">
                  <span>处理措施 *</span>
                  <div className="treatment-options">
                    {OFFLINE_TREATMENT_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={`treatment-option ${
                          treatment === opt ? "treatment-option-active" : ""
                        }`}
                        onClick={() => setTreatment(opt)}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
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

                <label className="form-full">
                  <span>处理人</span>
                  <input
                    type="text"
                    value={handler}
                    onChange={(e) => setHandler(e.target.value)}
                    placeholder="请输入处理人姓名"
                  />
                </label>
              </div>

              {RETEST_TRIGGER_TREATMENTS.includes(treatment) && (
                <div className="retest-notice">
                  <span className="retest-notice-icon">📋</span>
                  <div>
                    <strong>系统将自动创建复测任务</strong>
                    <p>
                      选择「{treatment}」后，将在
                      {treatment === "复测"
                        ? "1天"
                        : treatment === "停喂"
                          ? "2天"
                          : "3天"}
                      后生成待办复测提醒，请届时对该鱼缸再次进行水质检测。
                    </p>
                  </div>
                </div>
              )}
            </div>

            <footer className="modal-footer">
              <button
                className="secondary-action"
                onClick={() => setShowProcessDialog(false)}
              >
                取消
              </button>
              <button className="primary-action" onClick={handleProcess}>
                确认处理
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
