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
  | "tank";

export type SyncOperation = "create" | "update" | "delete";

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
  value: string;
  threshold: string;
  severity: "severe" | "mild";
  description: string;
  status: "pending" | "processed";
  treatment?: "waterChange" | "medication" | "temperatureAdjust" | "other";
  treatmentNote?: string;
  handler?: string;
  createdAt: string;
  processedAt?: string;
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
