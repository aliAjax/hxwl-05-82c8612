import { useState, useEffect } from "react";
import {
  offlineSyncStore,
  syncEngine,
  createSyncMeta,
  type OfflineWaterRecord,
} from "../offlineSync";
import { SyncBadge } from "./SyncBadge";
import type { WaterTestFormData, RecordStatus } from "./types";
import { METRIC_RANGES } from "./types";

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

function evaluateMetric(
  key: keyof typeof METRIC_RANGES,
  raw: string
): RecordStatus {
  const value = parseFloat(raw);
  if (isNaN(value)) return "稳定";
  const range = METRIC_RANGES[key];
  if (value < range.watch[0] || value > range.watch[1]) return "异常";
  if (value < range.ok[0] || value > range.ok[1]) return "关注";
  return "稳定";
}

function evaluateRecord(form: WaterTestFormData): { status: RecordStatus; note: string } {
  const metricKeys = Object.keys(METRIC_RANGES) as (keyof typeof METRIC_RANGES)[];
  const issues: { key: keyof typeof METRIC_RANGES; status: RecordStatus }[] = [];
  let overall: RecordStatus = "稳定";

  for (const key of metricKeys) {
    const raw = form[key];
    if (!raw.trim()) continue;
    const st = evaluateMetric(key, raw);
    if (st !== "稳定") {
      issues.push({ key, status: st });
    }
    if (st === "异常") overall = "异常";
    else if (st === "关注" && overall !== "异常") overall = "关注";
  }

  let note = form.note.trim();
  if (issues.length === 0 && !note) {
    note = "各项指标正常，继续保持";
  } else if (issues.length > 0) {
    const dangerItems = issues.filter((i) => i.status === "异常");
    const watchItems = issues.filter((i) => i.status === "关注");
    const parts: string[] = [];
    if (dangerItems.length > 0) {
      parts.push(
        dangerItems
          .map((i) => {
            const r = METRIC_RANGES[i.key];
            return `${r.label}${form[i.key]}${r.unit}异常`;
          })
          .join("、")
      );
    }
    if (watchItems.length > 0) {
      parts.push(
        watchItems
          .map((i) => `${METRIC_RANGES[i.key].label}${form[i.key]}需关注`)
          .join("、")
      );
    }
    const issueStr = parts.join("；");
    note = note ? `${issueStr}；${note}` : issueStr;
    if (dangerItems.length > 0) {
      note += "，建议立即处理";
    }
  }
  return { status: overall, note };
}

interface WaterTestRecorderProps {
  onRecordCreated?: (record: OfflineWaterRecord) => void;
}

export function WaterTestRecorder({ onRecordCreated }: WaterTestRecorderProps) {
  const [formData, setFormData] = useState<WaterTestFormData>(emptyForm);
  const [records, setRecords] = useState<OfflineWaterRecord[]>(() =>
    offlineSyncStore.getWaterRecords()
  );
  const [statusFilter, setStatusFilter] = useState<string>("全部");

  const updateForm = (key: keyof WaterTestFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const refreshRecords = () => {
    setRecords(offlineSyncStore.getWaterRecords());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tankName.trim()) {
      alert("请填写鱼缸名称");
      return;
    }
    const hasAnyMetric = (Object.keys(METRIC_RANGES) as (keyof typeof METRIC_RANGES)[]).some(
      (k) => formData[k].trim() !== ""
    );
    if (!hasAnyMetric && !formData.waterChange.trim()) {
      alert("请至少填写一项水质指标或换水量");
      return;
    }

    const { status, note } = evaluateRecord(formData);
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
    (Object.keys(METRIC_RANGES) as (keyof typeof METRIC_RANGES)[]).forEach((k) => {
      if (metrics[k].trim()) {
        const r = METRIC_RANGES[k];
        parts.push(`${r.label} ${metrics[k]}${r.unit}`);
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
                  {(record.syncMeta.syncStatus === "draft" || record.syncMeta.syncStatus === "conflict") && (
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
