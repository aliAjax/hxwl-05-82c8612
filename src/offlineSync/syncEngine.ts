import { offlineSyncStore, formatDate } from "./syncStore";
import type {
  SyncQueueItem,
  EntityType,
  SyncStatus,
  SyncMeta,
} from "./types";

type SyncProgressCallback = (
  processed: number,
  total: number,
  currentItem?: SyncQueueItem
) => void;

type ConflictResolution = "useLocal" | "useServer" | "manual";

class SyncEngine {
  private isSyncing = false;

  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  private simulateNetworkDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 600));
  }

  private simulateSyncOutcome(
    item: SyncQueueItem
  ): {
    success: boolean;
    error?: string;
    conflict?: {
      localSnapshot: unknown;
      serverSnapshot: unknown;
      conflictReason: string;
    };
  } {
    const roll = Math.random();

    if (item.status === "conflict") {
      return {
        success: false,
        error: "存在未解决的冲突，需人工确认",
      };
    }

    if (roll < 0.7) {
      return { success: true };
    }

    if (roll < 0.85) {
      return {
        success: false,
        error: `服务器返回错误: ${500 + Math.floor(Math.random() * 3)} (模拟)`,
      };
    }

    return {
      success: false,
      conflict: {
        localSnapshot: item.data,
        serverSnapshot: {
          ...(item.data as Record<string, unknown>),
          note: "[服务器版本] 此数据在服务器端有更新 (模拟冲突)",
          updatedAt: formatDate(new Date()),
        },
        conflictReason: "服务器数据较本地更新，或双方同时修改了同一记录 (模拟冲突)",
      },
    };
  }

  private updateEntitySyncStatus(
    entityType: EntityType,
    entityId: string,
    status: SyncStatus,
    error?: string,
    conflictData?: SyncMeta["conflictData"]
  ) {
    switch (entityType) {
      case "waterRecord":
        offlineSyncStore.updateRecordSyncStatus(entityId, status, error, conflictData);
        break;
      case "waterChangePlan":
        offlineSyncStore.updatePlanSyncStatus(entityId, status, error, conflictData);
        break;
      case "alert":
        offlineSyncStore.updateAlertSyncStatus(entityId, status, error, conflictData);
        break;
      case "maintenanceTask":
        offlineSyncStore.updateTaskSyncStatus(entityId, status, error, conflictData);
        break;
      case "retestTask":
        offlineSyncStore.updateRetestTaskSyncStatus(entityId, status, error, conflictData);
        break;
      case "tank":
        break;
    }
  }

  async syncAll(onProgress?: SyncProgressCallback): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    conflicts: number;
  }> {
    if (this.isSyncing) {
      return { total: 0, succeeded: 0, failed: 0, conflicts: 0 };
    }

    this.isSyncing = true;
    const queue = offlineSyncStore.getSyncQueue();
    const total = queue.length;
    let succeeded = 0;
    let failed = 0;
    let conflicts = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      onProgress?.(i, total, item);

      offlineSyncStore.updateQueueItem(item.id, {
        status: "syncing",
        lastAttemptAt: formatDate(new Date()),
      });

      await this.simulateNetworkDelay();

      const outcome = this.simulateSyncOutcome(item);

      if (outcome.success) {
        offlineSyncStore.removeFromQueue(item.id);
        this.updateEntitySyncStatus(
          item.entityType,
          item.entityId,
          "synced"
        );
        succeeded++;
      } else if (outcome.conflict) {
        offlineSyncStore.updateQueueItem(item.id, {
          status: "conflict",
          errorMessage: outcome.conflict.conflictReason,
          retryCount: item.retryCount + 1,
        });
        this.updateEntitySyncStatus(
          item.entityType,
          item.entityId,
          "conflict",
          undefined,
          outcome.conflict
        );
        conflicts++;
      } else {
        const newRetryCount = item.retryCount + 1;
        if (newRetryCount >= 3) {
          offlineSyncStore.updateQueueItem(item.id, {
            status: "failed",
            errorMessage: outcome.error,
            retryCount: newRetryCount,
          });
          this.updateEntitySyncStatus(
            item.entityType,
            item.entityId,
            "failed",
            outcome.error
          );
        } else {
          offlineSyncStore.updateQueueItem(item.id, {
            status: "queued",
            errorMessage: outcome.error,
            retryCount: newRetryCount,
          });
          this.updateEntitySyncStatus(
            item.entityType,
            item.entityId,
            "pending",
            outcome.error
          );
        }
        failed++;
      }
    }

    this.isSyncing = false;
    onProgress?.(total, total);
    return { total, succeeded, failed, conflicts };
  }

  async syncSingle(queueItemId: string): Promise<boolean> {
    const queue = offlineSyncStore.getSyncQueue();
    const item = queue.find((q) => q.id === queueItemId);
    if (!item) return false;

    this.isSyncing = true;
    offlineSyncStore.updateQueueItem(item.id, {
      status: "syncing",
      lastAttemptAt: formatDate(new Date()),
    });

    await this.simulateNetworkDelay();
    const outcome = this.simulateSyncOutcome(item);

    if (outcome.success) {
      offlineSyncStore.removeFromQueue(item.id);
      this.updateEntitySyncStatus(item.entityType, item.entityId, "synced");
      this.isSyncing = false;
      return true;
    }

    if (outcome.conflict) {
      offlineSyncStore.updateQueueItem(item.id, {
        status: "conflict",
        errorMessage: outcome.conflict.conflictReason,
        retryCount: item.retryCount + 1,
      });
      this.updateEntitySyncStatus(
        item.entityType,
        item.entityId,
        "conflict",
        undefined,
        outcome.conflict
      );
    } else {
      const newRetryCount = item.retryCount + 1;
      if (newRetryCount >= 3) {
        offlineSyncStore.updateQueueItem(item.id, {
          status: "failed",
          errorMessage: outcome.error,
          retryCount: newRetryCount,
        });
        this.updateEntitySyncStatus(
          item.entityType,
          item.entityId,
          "failed",
          outcome.error
        );
      } else {
        offlineSyncStore.updateQueueItem(item.id, {
          status: "queued",
          errorMessage: outcome.error,
          retryCount: newRetryCount,
        });
      }
    }

    this.isSyncing = false;
    return false;
  }

  resolveConflict(
    queueItemId: string,
    resolution: ConflictResolution
  ): boolean {
    const queue = offlineSyncStore.getSyncQueue();
    const item = queue.find((q) => q.id === queueItemId);
    if (!item) return false;

    if (resolution === "useLocal") {
      offlineSyncStore.updateQueueItem(item.id, {
        status: "queued",
        errorMessage: undefined,
        retryCount: 0,
      });
      this.updateEntitySyncStatus(
        item.entityType,
        item.entityId,
        "pending"
      );
      return true;
    }

    if (resolution === "useServer") {
      offlineSyncStore.removeFromQueue(item.id);
      this.updateEntitySyncStatus(
        item.entityType,
        item.entityId,
        "synced"
      );
      return true;
    }

    return false;
  }

  retryFailed(queueItemId: string): boolean {
    const queue = offlineSyncStore.getSyncQueue();
    const item = queue.find((q) => q.id === queueItemId);
    if (!item) return false;

    offlineSyncStore.updateQueueItem(item.id, {
      status: "queued",
      errorMessage: undefined,
      retryCount: 0,
    });
    this.updateEntitySyncStatus(
      item.entityType,
      item.entityId,
      "pending"
    );
    return true;
  }

  markAsDraft(
    entityType: EntityType,
    entityId: string
  ) {
    this.updateEntitySyncStatus(entityType, entityId, "draft");
  }
}

export const syncEngine = new SyncEngine();
export type { ConflictResolution };
