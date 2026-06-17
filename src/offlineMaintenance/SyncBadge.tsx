import type { SyncStatus, SyncMeta } from "../offlineSync";
import { SYNC_STATUS_LABEL } from "../offlineSync";

interface SyncBadgeProps {
  syncMeta: SyncMeta;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function SyncBadge({ syncMeta, showLabel = true, size = "md" }: SyncBadgeProps) {
  const status = syncMeta.syncStatus;

  return (
    <span
      className={`sync-badge sync-badge-${status} sync-badge-${size}`}
      title={syncMeta.syncError || syncMeta.conflictData?.conflictReason || SYNC_STATUS_LABEL[status]}
    >
      <span className="sync-badge-dot" />
      {showLabel && <span className="sync-badge-text">{SYNC_STATUS_LABEL[status]}</span>}
    </span>
  );
}

export function getStatusIcon(status: SyncStatus): string {
  switch (status) {
    case "draft":
      return "📝";
    case "synced":
      return "✓";
    case "pending":
      return "⏳";
    case "failed":
      return "⚠️";
    case "conflict":
      return "🔀";
  }
}
