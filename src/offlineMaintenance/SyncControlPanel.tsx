import { useState, useEffect } from "react";
import {
  offlineSyncStore,
  syncEngine,
  type SyncStats,
  type SyncQueueItem,
  type EntityType,
} from "../offlineSync";
import { SYNC_STATUS_LABEL } from "../offlineSync";

const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  waterRecord: "水质记录",
  waterChangePlan: "换水计划",
  alert: "异常提醒",
  maintenanceTask: "维护任务",
  tank: "鱼缸档案",
};

export function SyncControlPanel() {
  const [stats, setStats] = useState<SyncStats>(() =>
    offlineSyncStore.getSyncStats()
  );
  const [queue, setQueue] = useState<SyncQueueItem[]>(() =>
    offlineSyncStore.getSyncQueue()
  );
  const [isOnline, setIsOnline] = useState(offlineSyncStore.isNetworkOnline());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<SyncQueueItem | null>(null);
  const [expandedQueue, setExpandedQueue] = useState(true);

  const refresh = () => {
    setStats(offlineSyncStore.getSyncStats());
    setQueue(offlineSyncStore.getSyncQueue());
    setIsOnline(offlineSyncStore.isNetworkOnline());
  };

  useEffect(() => {
    const unsub = offlineSyncStore.subscribe(refresh);
    return unsub;
  }, []);

  const handleToggleNetwork = () => {
    offlineSyncStore.setNetworkStatus(!isOnline);
  };

  const handleSyncAll = async () => {
    if (!isOnline) {
      if (!window.confirm("当前处于离线状态，是否仍模拟同步流程？")) {
        return;
      }
    }

    const promoted = offlineSyncStore.promoteDraftsToQueue();
    if (promoted > 0) {
      refresh();
    }

    setIsSyncing(true);
    setLastSyncResult(null);
    const currentQueue = offlineSyncStore.getSyncQueue();
    setSyncProgress({ processed: 0, total: currentQueue.length });

    const result = await syncEngine.syncAll((processed, total) => {
      setSyncProgress({ processed, total });
    });

    setIsSyncing(false);
    setSyncProgress(null);
    const promoteMsg = promoted > 0 ? `（含 ${promoted} 条草稿提升入队）` : "";
    setLastSyncResult(
      `同步完成：成功 ${result.succeeded} 项，失败 ${result.failed} 项，冲突 ${result.conflicts} 项${promoteMsg}`
    );
    refresh();
  };

  const handleRetryItem = async (itemId: string) => {
    setIsSyncing(true);
    await syncEngine.syncSingle(itemId);
    setIsSyncing(false);
    refresh();
  };

  const handleResolveConflict = (
    itemId: string,
    resolution: "useLocal" | "useServer"
  ) => {
    syncEngine.resolveConflict(itemId, resolution);
    setSelectedConflict(null);
    refresh();
  };

  const handleRetryAllFailed = () => {
    queue
      .filter((q) => q.status === "failed")
      .forEach((q) => syncEngine.retryFailed(q.id));
    refresh();
  };

  const handleLoadDemo = () => {
    if (window.confirm("加载离线演示数据将覆盖当前离线数据，是否继续？")) {
      offlineSyncStore.resetToDemoData();
      refresh();
    }
  };

  const handleClearOfflineData = () => {
    if (window.confirm("确定清空所有离线数据？此操作不可恢复。")) {
      offlineSyncStore.clearAllOfflineData();
      refresh();
    }
  };

  const getQueueItemStatusClass = (status: SyncQueueItem["status"]) => {
    switch (status) {
      case "queued":
        return "queue-status-queued";
      case "syncing":
        return "queue-status-syncing";
      case "failed":
        return "queue-status-failed";
      case "conflict":
        return "queue-status-conflict";
    }
  };

  const getQueueItemStatusText = (status: SyncQueueItem["status"]) => {
    switch (status) {
      case "queued":
        return "等待同步";
      case "syncing":
        return "同步中...";
      case "failed":
        return "同步失败";
      case "conflict":
        return "需要确认";
    }
  };

  const statsCards: {
    key: keyof SyncStats;
    label: string;
    color: string;
    icon: string;
  }[] = [
    { key: "draft", label: SYNC_STATUS_LABEL.draft, color: "var(--primary)", icon: "📝" },
    { key: "pending", label: SYNC_STATUS_LABEL.pending, color: "var(--warn)", icon: "⏳" },
    { key: "synced", label: SYNC_STATUS_LABEL.synced, color: "var(--accent)", icon: "✓" },
    { key: "failed", label: SYNC_STATUS_LABEL.failed, color: "var(--danger)", icon: "⚠️" },
    { key: "conflict", label: SYNC_STATUS_LABEL.conflict, color: "#8b5cf6", icon: "🔀" },
  ];

  return (
    <section className="panel sync-control-panel">
      <div className="section-heading">
        <div>
          <p className="offline-section-tag">🔗 同步管理</p>
          <h2>离线同步控制台</h2>
        </div>
        <div className="sync-header-actions">
          <button
            className={`network-toggle ${isOnline ? "online" : "offline"}`}
            onClick={handleToggleNetwork}
          >
            <span className="network-dot" />
            {isOnline ? "在线模式" : "离线模式"}
          </button>
        </div>
      </div>

      <div className="sync-status-bar">
        {statsCards.map((s) => (
          <div
            key={s.key}
            className="sync-stat-card"
            style={{ borderColor: s.color }}
          >
            <div className="sync-stat-icon" style={{ background: s.color }}>
              {s.icon}
            </div>
            <div className="sync-stat-info">
              <span className="sync-stat-value" style={{ color: s.color }}>
                {stats[s.key]}
              </span>
              <span className="sync-stat-label">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="sync-actions-bar">
        <button
          className="primary-action"
          onClick={handleSyncAll}
          disabled={isSyncing || queue.length === 0}
        >
          {isSyncing
            ? syncProgress
              ? `同步中 ${syncProgress.processed}/${syncProgress.total}...`
              : "同步中..."
            : `⬆ 立即同步全部 (${stats.totalQueued})`}
        </button>
        {queue.some((q) => q.status === "failed") && (
          <button className="secondary-action" onClick={handleRetryAllFailed}>
            🔄 重试全部失败
          </button>
        )}
        <button className="secondary-action" onClick={handleLoadDemo}>
          📦 加载演示数据
        </button>
        <button className="danger-action" onClick={handleClearOfflineData}>
          🗑️ 清空离线数据
        </button>
      </div>

      {lastSyncResult && (
        <div className="sync-result-banner">{lastSyncResult}</div>
      )}

      <div className="sync-queue-section">
        <div
          className="queue-section-header"
          onClick={() => setExpandedQueue(!expandedQueue)}
        >
          <h3>
            同步队列
            <span className="queue-count-badge">{queue.length}</span>
          </h3>
          <span className="queue-toggle-icon">{expandedQueue ? "▼" : "▶"}</span>
        </div>

        {expandedQueue && (
          <>
            {queue.length === 0 ? (
              <div className="empty-state empty-state-compact">
                <div className="empty-icon">📤</div>
                <h3>同步队列为空</h3>
                <p>所有本地数据已同步，或暂无可同步的内容。</p>
              </div>
            ) : (
              <div className="sync-queue-list">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className={`sync-queue-item ${getQueueItemStatusClass(
                      item.status
                    )}`}
                  >
                    <div className="queue-item-main">
                      <div className="queue-item-header">
                        <span className="queue-item-type">
                          {ENTITY_TYPE_LABEL[item.entityType]}
                        </span>
                        <span
                          className={`queue-item-status queue-item-status-${item.status}`}
                        >
                          {getQueueItemStatusText(item.status)}
                        </span>
                      </div>
                      <p className="queue-item-preview">
                        {formatEntityPreview(item)}
                      </p>
                      <div className="queue-item-meta">
                        <span>创建: {item.createdAt}</span>
                        <span>重试: {item.retryCount}/3</span>
                        {item.lastAttemptAt && (
                          <span>最后尝试: {item.lastAttemptAt}</span>
                        )}
                      </div>
                      {item.errorMessage && (
                        <p className="queue-item-error">❌ {item.errorMessage}</p>
                      )}
                    </div>
                    <div className="queue-item-actions">
                      {item.status === "conflict" && (
                        <button
                          className="secondary-action"
                          onClick={() => setSelectedConflict(item)}
                        >
                          🔀 解决冲突
                        </button>
                      )}
                      {(item.status === "queued" ||
                        item.status === "failed") && (
                        <button
                          className="secondary-action"
                          onClick={() => handleRetryItem(item.id)}
                          disabled={isSyncing}
                        >
                          ⏫ 同步
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selectedConflict && (
        <div className="modal-overlay" onClick={() => setSelectedConflict(null)}>
          <div
            className="modal-content conflict-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>🔀 解决数据冲突</h2>
              <button
                className="modal-close"
                onClick={() => setSelectedConflict(null)}
              >
                ×
              </button>
            </header>
            <div className="modal-body">
              <p className="modal-warning">
                该数据在本地和服务器端存在差异，请选择保留哪个版本：
              </p>
              <div className="conflict-compare">
                <div className="conflict-side">
                  <h4>📱 本地版本</h4>
                  <pre className="conflict-json">
                    {JSON.stringify(
                      selectedConflict.data,
                      null,
                      2
                    )}
                  </pre>
                </div>
                <div className="conflict-side">
                  <h4>☁️ 服务器版本 (模拟)</h4>
                  <pre className="conflict-json">
                    {selectedConflict.data
                      ? JSON.stringify(
                          {
                            ...(selectedConflict.data as Record<string, unknown>),
                            note: "[服务器版本] 数据可能与本地不同",
                            updatedAt: new Date().toLocaleString(),
                          },
                          null,
                          2
                        )
                      : "{}"}
                  </pre>
                </div>
              </div>
            </div>
            <footer className="modal-footer">
              <button
                className="secondary-action"
                onClick={() => setSelectedConflict(null)}
              >
                稍后处理
              </button>
              <button
                className="secondary-action"
                onClick={() =>
                  handleResolveConflict(selectedConflict.id, "useServer")
                }
              >
                ☁️ 使用服务器版本
              </button>
              <button
                className="primary-action"
                onClick={() =>
                  handleResolveConflict(selectedConflict.id, "useLocal")
                }
              >
                📱 保留本地版本
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

function formatEntityPreview(item: SyncQueueItem): string {
  const data = item.data as Record<string, unknown> | undefined;
  if (!data) return "无预览数据";
  const name =
    (data.tankName as string) ||
    (data.title as string) ||
    (data.name as string) ||
    "未命名";
  const op =
    item.operation === "create"
      ? "新增"
      : item.operation === "update"
      ? "更新"
      : "删除";
  return `[${op}] ${name}`;
}
