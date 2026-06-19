export type SyncStatus =
  | "draft"
  | "synced"
  | "pending"
  | "failed"
  | "conflict";

export type EntityType =
  | "waterRecord"
  | "waterChangePlan"
  | "alert"
  | "maintenanceTask"
  | "retestTask"
  | "tank";

export type SyncOperation = "create" | "update" | "delete";

export type MergeSource = "local" | "server" | "manual";

export interface MergeFieldChoice {
  field: string;
  source: "local" | "server";
}

export interface MergeHistoryEntry {
  id: string;
  entityType: EntityType;
  entityId: string;
  mergeSource: MergeSource;
  fieldChoices?: MergeFieldChoice[];
  mergedAt: string;
  conflictReason: string;
}

export interface SyncMeta {
  syncStatus: SyncStatus;
  syncError?: string;
  syncAttempts: number;
  lastSyncAt?: string;
  pendingOperation?: SyncOperation;
  conflictData?: {
    localSnapshot: unknown;
    serverSnapshot?: unknown;
    conflictReason: string;
  };
  lastMergeSource?: MergeSource;
  lastMergeAt?: string;
}

export interface SyncQueueItem {
  id: string;
  entityType: EntityType;
  entityId: string;
  operation: SyncOperation;
  data: unknown;
  createdAt: string;
  status: "queued" | "syncing" | "failed" | "conflict";
  errorMessage?: string;
  retryCount: number;
  lastAttemptAt?: string;
  lastMergeSource?: MergeSource;
  lastMergeAt?: string;
  conflictData?: {
    localSnapshot: unknown;
    serverSnapshot?: unknown;
    conflictReason: string;
  };
}

export interface OfflineWaterRecord {
  id: string;
  tankName: string;
  tankId?: string;
  recordedAt: string;
  metrics: {
    ph: string;
    ammonia: string;
    nitrite: string;
    nitrate: string;
    hardness: string;
    temperature: string;
    waterChange: string;
  };
  status: "稳定" | "关注" | "异常";
  note: string;
  syncMeta: SyncMeta;
}

export interface OfflineWaterChangePlan {
  id: string;
  tankName: string;
  tankId?: string;
  cycleDays: string;
  waterRatio: string;
  nextDate: string;
  note: string;
  completedAt?: string;
  createdAt: string;
  syncMeta: SyncMeta;
}

export interface OfflineAlert {
  id: string;
  recordId: string;
  tankName: string;
  tankId?: string;
  tankType: string;
  metric: string;
  metricLabel?: string;
  value: string;
  unit?: string;
  threshold: string;
  thresholdRange?: string;
  severity: "severe" | "mild";
  description: string;
  status: "pending" | "processed";
  treatment?: OfflineTreatmentAction;
  treatmentNote?: string;
  handler?: string;
  createdAt: string;
  processedAt?: string;
  retestTaskId?: string;
  retestResult?: OfflineRetestResult;
  isClosed?: boolean;
  closedAt?: string;
  syncMeta: SyncMeta;
}

export type OfflineRetestTaskStatus = "pending" | "completed" | "overdue";

export type OfflineRetestResult = "recovered" | "not_recovered" | null;

export type OfflineTreatmentAction =
  | "复测"
  | "换水"
  | "停喂"
  | "补菌"
  | "温度调整"
  | "其他";

export interface OfflineRetestTask {
  id: string;
  sourceAlertId: string;
  sourceAlertMetric: string;
  sourceAlertMetricLabel: string;
  tankName: string;
  tankId?: string;
  tankType: string;
  triggerTreatment: OfflineTreatmentAction;
  treatmentNote?: string;
  originalValue: string;
  originalUnit: string;
  thresholdRange: string;
  dueDate: string;
  status: OfflineRetestTaskStatus;
  retestRecordId?: string;
  retestValue?: string;
  retestResult: OfflineRetestResult;
  createdAt: string;
  completedAt?: string;
  handler?: string;
  syncMeta: SyncMeta;
}

export interface MaintenanceTask {
  id: string;
  type: "waterChange" | "waterTest" | "alertFollowUp";
  title: string;
  description: string;
  tankName: string;
  tankId?: string;
  status: "pending" | "inProgress" | "completed";
  priority: "low" | "medium" | "high";
  dueDate?: string;
  completedAt?: string;
  completedNote?: string;
  assignee?: string;
  relatedRecordId?: string;
  relatedAlertId?: string;
  createdAt: string;
  syncMeta: SyncMeta;
}

export interface SyncStats {
  draft: number;
  pending: number;
  synced: number;
  failed: number;
  conflict: number;
  totalQueued: number;
}

export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  draft: "本地草稿",
  synced: "已同步",
  pending: "待同步",
  failed: "同步失败",
  conflict: "待人工确认",
};

export const SYNC_STATUS_COLOR: Record<SyncStatus, string> = {
  draft: "draft",
  synced: "synced",
  pending: "pending",
  failed: "failed",
  conflict: "conflict",
};

export const MERGE_SOURCE_LABEL: Record<MergeSource, string> = {
  local: "本地版本",
  server: "服务器版本",
  manual: "人工合并",
};

export const MERGE_SOURCE_COLOR: Record<MergeSource, string> = {
  local: "#0891b2",
  server: "#16a34a",
  manual: "#8b5cf6",
};
