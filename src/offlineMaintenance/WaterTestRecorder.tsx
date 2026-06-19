import { useState, useEffect, useRef } from "react";
import {
  offlineSyncStore,
  syncEngine,
  createSyncMeta,
  type OfflineWaterRecord,
  type OfflineRetestTask,
  type OfflineAlert,
} from "../offlineSync";
import { SyncBadge } from "./SyncBadge";
import type { WaterTestFormData, RecordStatus } from "./types";
import {
  evaluateRecordStatus,
  RULE_METRICS,
  RULE_METRIC_LABELS,
  RULE_METRIC_UNITS,
  getMetricRule,
} from "../ruleConfig";
import type { RuleMetric } from "../ruleConfig";

const emptyForm: WaterTestFormData = {
  tankName: "",
  tankId: undefined,
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  hardness: "",
  temperature: "",
  waterChange: "",
  note: "",
};

interface WaterTestRecorderProps {
  onRecordCreated?: (record: OfflineWaterRecord) => void;
  onRetestCompleted?: (result: { completedTasks: OfflineRetestTask[]; updatedAlerts: OfflineAlert[] }) => void;
}

export function WaterTestRecorder({ onRecordCreated, onRetestCompleted }: WaterTestRecorderProps) {
  const [formData, setFormData] = useState<WaterTestFormData>(emptyForm);
  const [records, setRecords] = useState<OfflineWaterRecord[]>(() =>
    offlineSyncStore.getWaterRecords()
  );
  const [retestTasks, setRetestTasks] = useState<OfflineRetestTask[]>(() =>
    offlineSyncStore.getRetestTasks()
  );
  const [statusFilter, setStatusFilter] = useState<string>("全部");
  const [retestNotification, setRetestNotification] = useState<string | null>(null);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateForm = (key: keyof WaterTestFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const refreshRecords = () => {
    setRecords(offlineSyncStore.getWaterRecords());
    setRetestTasks(offlineSyncStore.getRetestTasks());
  };

  useEffect(() => {
    return offlineSyncStore.subscribe(refreshRecords);
  }, []);

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tankName.trim()) {
      alert("请填写鱼缸名称");
      return;
    }
    const hasAnyMetric = RULE_METRICS.some(
      (k) => formData[k as keyof typeof formData]?.trim() !== ""
    );
    if (!hasAnyMetric && !formData.waterChange.trim()) {
      alert("请至少填写一项水质指标或换水量");
      return;
    }

    const { status, note: baseNote } = evaluateRecordStatus({
      ph: formData.ph,
      ammonia: formData.ammonia,
      nitrite: formData.nitrite,
      nitrate: formData.nitrate,
      hardness: formData.hardness,
      temperature: formData.temperature,
      waterChange: formData.waterChange,
    });
    const userNote = formData.note.trim();
    const note = userNote ? `${baseNote}；${userNote}` : baseNote;
    const isOnline = offlineSyncStore.isNetworkOnline();

    const record = offlineSyncStore.saveWaterRecord({
      tankName: formData.tankName.trim(),
      tankId: formData.tankId,
      metrics: {
        ph: formData.ph,
        ammonia: formData.ammonia,
        nitrite: formData.nitrite,
        nitrate: formData.nitrate,
        hardness: formData.hardness,
        temperature: formData.temperature,
        waterChange: formData.waterChange,
      },
      status,
      note,
      syncMeta: isOnline
        ? { ...createSyncMeta("pending"), pendingOperation: "create" }
        : { ...createSyncMeta("draft"), pendingOperation: "create" },
    });

    if (isOnline) {
      offlineSyncStore.addToQueue("waterRecord", record.id, "create", record);
    }

    if (status === "异常" || status === "关注") {
      offlineSyncStore.saveAlert({
        recordId: record.id,
        tankName: record.tankName,
        tankType: "草缸",
        metric: "综合指标",
        value: status,
        threshold: "稳定",
        severity: status === "异常" ? "severe" : "mild",
        description: note,
        status: "pending",
        syncMeta: record.syncMeta,
      });

      offlineSyncStore.saveTask({
        type: "alertFollowUp",
        title: `${record.tankName} 水质异常跟进`,
        description: note,
        tankName: record.tankName,
        tankId: record.tankId,
        status: "pending",
        priority: status === "异常" ? "high" : "medium",
        relatedRecordId: record.id,
        syncMeta: record.syncMeta,
      });
    }

    const retestResult = offlineSyncStore.completeRetestTaskFromRecord(record);
    if (retestResult.completedTasks.length > 0) {
      const recoveredCount = retestResult.completedTasks.filter(
        (t) => t.retestResult === "recovered"
      ).length;
      const notRecoveredCount = retestResult.completedTasks.filter(
        (t) => t.retestResult === "not_recovered"
      ).length;
      const messageParts: string[] = [];
      if (recoveredCount > 0) {
        messageParts.push(`${recoveredCount} 项异常已恢复正常并闭环`);
      }
      if (notRecoveredCount > 0) {
        messageParts.push(`${notRecoveredCount} 项仍未恢复，持续关注`);
      }
      const notification = `📋 复测结果：${messageParts.join("；")}`;
      setRetestNotification(notification);
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
      notificationTimerRef.current = setTimeout(() => {
        setRetestNotification(null);
      }, 5000);
      onRetestCompleted?.(retestResult);
    }

    setFormData(emptyForm);
    refreshRecords();
    onRecordCreated?.(record);
  };

  const handleQueueSync = async (recordId: string) => {
    const queue = offlineSyncStore.getSyncQueue();
    const item = queue.find(
      (q) => q.entityType === "waterRecord" && q.entityId === recordId
    );
    if (item) {
      await syncEngine.syncSingle(item.id);
      refreshRecords();
    }
  };

  const handleMarkSynced = (recordId: string) => {
    offlineSyncStore.updateRecordSyncStatus(recordId, "synced");
    refreshRecords();
  };

  const handlePromoteDraft = (recordId: string) => {
    const record = offlineSyncStore.getWaterRecords().find((r) => r.id === recordId);
    if (!record) return;
    offlineSyncStore.updateRecordSyncStatus(recordId, "pending");
    const updated = offlineSyncStore.getWaterRecords().find((r) => r.id === recordId);
    if (updated) {
      offlineSyncStore.addToQueue("waterRecord", recordId, "create", updated);
    }
    refreshRecords();
  };

  const handleDelete = (recordId: string) => {
    if (!window.confirm("确定删除该检测记录？")) return;
    offlineSyncStore.deleteWaterRecord(recordId);
    refreshRecords();
  };

  const filteredRecords = records.filter((r) => {
    if (statusFilter === "全部") return true;
    const map: Record<string, string> = {
      本地草稿: "draft",
      待同步: "pending",
      已同步: "synced",
      同步失败: "failed",
      待人工确认: "conflict",
    };
    return r.syncMeta.syncStatus === map[statusFilter];
  });

  const filterOptions = ["全部", "本地草稿", "待同步", "已同步", "同步失败", "待人工确认"];

  const getStatusClass = (status: RecordStatus) => {
    switch (status) {
      case "稳定":
        return "record-status-稳定";
      case "关注":
        return "record-status-关注";
      case "异常":
        return "record-status-异常";
    }
  };

  const buildMetricSummary = (metrics: OfflineWaterRecord["metrics"]) => {
    const parts: string[] = [];
    RULE_METRICS.forEach((k) => {
      const val = metrics[k];
      if (val && val.trim()) {
        const label = RULE_METRIC_LABELS[k];
        const unit = RULE_METRIC_UNITS[k];
        parts.push(`${label} ${val}${unit}`);
      }
    });
    if (metrics.waterChange.trim()) {
      parts.push(`换水量 ${metrics.waterChange}`);
    }
    return parts.join(" · ");
  };

  return (
    <section className="panel offline-workflow-panel">
      <div className="section-heading">
        <div>
          <p className="offline-section-tag">💧 离线工作流</p>
          <h2>水质检测记录</h2>
        </div>
        <div className="offline-network-indicator">
          <NetworkIndicator />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="water-test-form">
        <div className="field-grid">
          <label>
            <span>鱼缸名称 *</span>
            <input
              type="text"
              value={formData.tankName}
              onChange={(e) => updateForm("tankName", e.target.value)}
              placeholder="例如：草缸A"
            />
          </label>
          <label>
            <span>pH</span>
            <input
              type="number"
              step="0.1"
              value={formData.ph}
              onChange={(e) => updateForm("ph", e.target.value)}
              placeholder="例如 6.8"
            />
          </label>
          <label>
            <span>氨氮 (ppm)</span>
            <input
              type="number"
              step="0.01"
              value={formData.ammonia}
              onChange={(e) => updateForm("ammonia", e.target.value)}
              placeholder="例如 0"
            />
          </label>
          <label>
            <span>亚硝酸盐 (ppm)</span>
            <input
              type="number"
              step="0.01"
              value={formData.nitrite}
              onChange={(e) => updateForm("nitrite", e.target.value)}
              placeholder="例如 0"
            />
          </label>
          <label>
            <span>硝酸盐 (ppm)</span>
            <input
              type="number"
              step="1"
              value={formData.nitrate}
              onChange={(e) => updateForm("nitrate", e.target.value)}
              placeholder="例如 20"
            />
          </label>
          <label>
            <span>硬度 (dGH)</span>
            <input
              type="number"
              step="1"
              value={formData.hardness}
              onChange={(e) => updateForm("hardness", e.target.value)}
              placeholder="例如 8"
            />
          </label>
          <label>
            <span>温度 (°C)</span>
            <input
              type="number"
              step="0.5"
              value={formData.temperature}
              onChange={(e) => updateForm("temperature", e.target.value)}
              placeholder="例如 26"
            />
          </label>
          <label>
            <span>换水量</span>
            <input
              type="text"
              value={formData.waterChange}
              onChange={(e) => updateForm("waterChange", e.target.value)}
              placeholder="例如 30%"
            />
          </label>
          <label className="field-full">
            <span>备注</span>
            <input
              type="text"
              value={formData.note}
              onChange={(e) => updateForm("note", e.target.value)}
              placeholder="例如：刚换完水，数据稳定"
            />
          </label>
        </div>
        <div className="form-actions-row">
          <button type="submit" className="primary-action">
            📝 保存记录（离线可用）
          </button>
        </div>
      </form>

      {retestNotification && (
        <div className="retest-notification">
          <div className="retest-notification-content">
            {retestNotification}
          </div>
          <button
            className="retest-notification-close"
            onClick={() => setRetestNotification(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="record-filter-bar">
        <span className="filter-label">同步状态筛选：</span>
        <div className="chips muted">
          {filterOptions.map((f) => (
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

      {filteredRecords.length === 0 ? (
        <div className="empty-state empty-state-compact">
          <div className="empty-icon">🧪</div>
          <h3>暂无检测记录</h3>
          <p>填写上方表单提交检测记录，数据将自动保存在本地。</p>
        </div>
      ) : (
        <div className="record-list">
          {filteredRecords.map((record, index) => (
            <article key={record.id} className="record-card offline-record-card">
              <div className={`record-index record-index-${record.status}`}>
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="record-main">
                <header className="record-header">
                  <div className="record-header-left">
                    <h3>{record.tankName}</h3>
                    <span className={`record-status ${getStatusClass(record.status)}`}>
                      {record.status}
                    </span>
                  </div>
                  <SyncBadge syncMeta={record.syncMeta} />
                </header>
                <p className="record-metrics">
                  {buildMetricSummary(record.metrics) || "未填写指标"}
                </p>
                <p className="record-note">{record.note}</p>
                <div className="record-footer">
                  <span className="record-time">{record.recordedAt}</span>
                  {record.syncMeta.lastSyncAt && (
                    <span className="record-sync-time">
                      最后同步: {record.syncMeta.lastSyncAt}
                    </span>
                  )}
                  {record.syncMeta.syncError && (
                    <span className="record-error" title={record.syncMeta.syncError}>
                      ❌ {record.syncMeta.syncError}
                    </span>
                  )}
                  {record.syncMeta.conflictData && (
                    <span className="record-conflict" title={record.syncMeta.conflictData.conflictReason}>
                      🔀 {record.syncMeta.conflictData.conflictReason}
                    </span>
                  )}
                </div>
                <div className="record-actions">
                  {record.syncMeta.syncStatus === "pending" && (
                    <button
                      className="secondary-action"
                      onClick={() => handleQueueSync(record.id)}
                    >
                      ⏫ 立即同步
                    </button>
                  )}
                  {record.syncMeta.syncStatus === "failed" && (
                    <button
                      className="secondary-action"
                      onClick={() => handleQueueSync(record.id)}
                    >
                      🔄 重试同步
                    </button>
                  )}
                  {record.syncMeta.syncStatus === "draft" && (
                    <button
                      className="secondary-action"
                      onClick={() => handlePromoteDraft(record.id)}
                    >
                      ⬆ 加入同步队列
                    </button>
                  )}
                  {record.syncMeta.syncStatus === "conflict" && (
                    <button
                      className="secondary-action"
                      onClick={() => handleMarkSynced(record.id)}
                    >
                      ✓ 标记已同步
                    </button>
                  )}
                  <button
                    className="tank-action-btn tank-action-delete"
                    onClick={() => handleDelete(record.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function NetworkIndicator() {
  const [online, setOnline] = useState(offlineSyncStore.isNetworkOnline());

  useEffect(() => {
    const unsub = offlineSyncStore.subscribe(() => {
      setOnline(offlineSyncStore.isNetworkOnline());
    });
    return unsub;
  }, []);

  return (
    <div className={`network-indicator ${online ? "online" : "offline"}`}>
      <span className="network-dot" />
      <span>{online ? "在线" : "离线模式"}</span>
    </div>
  );
}
