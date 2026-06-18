import type {
  SyncQueueItem,
  SyncStatus,
  EntityType,
  SyncOperation,
  SyncMeta,
  SyncStats,
  OfflineWaterRecord,
  OfflineWaterChangePlan,
  OfflineAlert,
  MaintenanceTask,
  OfflineRetestTask,
  OfflineRetestTaskStatus,
  OfflineRetestResult,
  OfflineTreatmentAction,
} from "./types";

const STORAGE_KEYS = {
  QUEUE: "hxwl_offline_sync_queue",
  WATER_RECORDS: "hxwl_offline_water_records",
  WATER_PLANS: "hxwl_offline_water_plans",
  ALERTS: "hxwl_offline_alerts",
  TASKS: "hxwl_offline_tasks",
  RETEST_TASKS: "hxwl_offline_retest_tasks",
  NETWORK_STATUS: "hxwl_offline_network_status",
};

const createSyncMeta = (status: SyncStatus = "draft"): SyncMeta => ({
  syncStatus: status,
  syncAttempts: 0,
});

const generateId = (): string =>
  `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const formatDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

class OfflineSyncStore {
  private isOnline = true;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.initNetworkStatus();
  }

  private initNetworkStatus() {
    if (typeof window !== "undefined") {
      this.isOnline = navigator.onLine;
      window.addEventListener("online", () => {
        const wasOffline = !this.isOnline;
        this.isOnline = true;
        if (wasOffline) {
          this.promoteDraftsToQueue();
        }
        this.notifyListeners();
      });
      window.addEventListener("offline", () => {
        this.isOnline = false;
        this.notifyListeners();
      });
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((l) => l());
  }

  isNetworkOnline(): boolean {
    return this.isOnline;
  }

  setNetworkStatus(online: boolean) {
    const wasOffline = !this.isOnline;
    this.isOnline = online;
    this.saveToStorage(STORAGE_KEYS.NETWORK_STATUS, JSON.stringify(online));
    if (online && wasOffline) {
      this.promoteDraftsToQueue();
    }
    this.notifyListeners();
  }

  private saveToStorage(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error("Failed to save to localStorage:", e);
    }
  }

  private loadFromStorage<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaultValue;
      return JSON.parse(raw) as T;
    } catch (e) {
      console.error("Failed to load from localStorage:", e);
      return defaultValue;
    }
  }

  getSyncQueue(): SyncQueueItem[] {
    return this.loadFromStorage<SyncQueueItem[]>(STORAGE_KEYS.QUEUE, []);
  }

  private saveSyncQueue(queue: SyncQueueItem[]) {
    this.saveToStorage(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
    this.notifyListeners();
  }

  addToQueue(
    entityType: EntityType,
    entityId: string,
    operation: SyncOperation,
    data: unknown
  ): SyncQueueItem {
    const queue = this.getSyncQueue();
    const existingIndex = queue.findIndex(
      (q) => q.entityType === entityType && q.entityId === entityId && q.status !== "conflict"
    );

    if (existingIndex !== -1) {
      const existing = queue[existingIndex];
      const item: SyncQueueItem = {
        ...existing,
        operation: existing.operation === "create" ? "create" : operation,
        data,
        status: existing.status === "failed" ? "queued" : existing.status,
        errorMessage: existing.status === "failed" ? undefined : existing.errorMessage,
      };
      queue.splice(existingIndex, 1);
      queue.unshift(item);
      this.saveSyncQueue(queue);
      return item;
    }

    const item: SyncQueueItem = {
      id: generateId(),
      entityType,
      entityId,
      operation,
      data,
      createdAt: formatDate(new Date()),
      status: "queued",
      retryCount: 0,
    };
    queue.unshift(item);
    this.saveSyncQueue(queue);
    return item;
  }

  updateQueueItem(id: string, updates: Partial<SyncQueueItem>) {
    const queue = this.getSyncQueue();
    const idx = queue.findIndex((q) => q.id === id);
    if (idx !== -1) {
      queue[idx] = { ...queue[idx], ...updates };
      this.saveSyncQueue(queue);
    }
  }

  removeFromQueue(id: string) {
    const queue = this.getSyncQueue().filter((q) => q.id !== id);
    this.saveSyncQueue(queue);
  }

  clearQueue() {
    this.saveSyncQueue([]);
  }

  getWaterRecords(): OfflineWaterRecord[] {
    return this.loadFromStorage<OfflineWaterRecord[]>(
      STORAGE_KEYS.WATER_RECORDS,
      []
    );
  }

  saveWaterRecord(
    record: Omit<OfflineWaterRecord, "id" | "syncMeta" | "recordedAt"> & {
      recordedAt?: string;
    } & Partial<Pick<OfflineWaterRecord, "id" | "syncMeta">>
  ): OfflineWaterRecord {
    const records = this.getWaterRecords();
    const now = formatDate(new Date());

    let existing: OfflineWaterRecord | undefined;
    if (record.id) {
      existing = records.find((r) => r.id === record.id);
    }

    const result: OfflineWaterRecord = {
      id: record.id || existing?.id || generateId(),
      tankName: record.tankName,
      tankId: record.tankId,
      recordedAt: record.recordedAt || existing?.recordedAt || now,
      metrics: record.metrics,
      status: record.status,
      note: record.note,
      syncMeta: record.syncMeta || existing?.syncMeta || createSyncMeta("draft"),
    };

    if (existing) {
      const idx = records.findIndex((r) => r.id === existing!.id);
      records[idx] = result;
    } else {
      records.unshift(result);
    }

    this.saveToStorage(
      STORAGE_KEYS.WATER_RECORDS,
      JSON.stringify(records)
    );
    this.notifyListeners();
    return result;
  }

  updateRecordSyncStatus(
    id: string,
    status: SyncStatus,
    error?: string,
    conflictData?: SyncMeta["conflictData"]
  ) {
    const records = this.getWaterRecords();
    const idx = records.findIndex((r) => r.id === id);
    if (idx !== -1) {
      records[idx].syncMeta = {
        ...records[idx].syncMeta,
        syncStatus: status,
        syncError: error,
        lastSyncAt: status === "synced" ? formatDate(new Date()) : records[idx].syncMeta.lastSyncAt,
        syncAttempts: records[idx].syncMeta.syncAttempts + 1,
        conflictData,
      };
      this.saveToStorage(
        STORAGE_KEYS.WATER_RECORDS,
        JSON.stringify(records)
      );
      this.notifyListeners();
    }
  }

  deleteWaterRecord(id: string) {
    const records = this.getWaterRecords().filter((r) => r.id !== id);
    this.saveToStorage(
      STORAGE_KEYS.WATER_RECORDS,
      JSON.stringify(records)
    );
    this.notifyListeners();
  }

  getWaterPlans(): OfflineWaterChangePlan[] {
    return this.loadFromStorage<OfflineWaterChangePlan[]>(
      STORAGE_KEYS.WATER_PLANS,
      []
    );
  }

  saveWaterPlan(
    plan: Omit<OfflineWaterChangePlan, "id" | "syncMeta" | "createdAt"> & {
      createdAt?: string;
    } & Partial<Pick<OfflineWaterChangePlan, "id" | "syncMeta">>
  ): OfflineWaterChangePlan {
    const plans = this.getWaterPlans();
    const now = formatDate(new Date());

    let existing: OfflineWaterChangePlan | undefined;
    if (plan.id) {
      existing = plans.find((p) => p.id === plan.id);
    }

    const result: OfflineWaterChangePlan = {
      id: plan.id || existing?.id || generateId(),
      tankName: plan.tankName,
      tankId: plan.tankId,
      cycleDays: plan.cycleDays,
      waterRatio: plan.waterRatio,
      nextDate: plan.nextDate,
      note: plan.note,
      completedAt: plan.completedAt,
      createdAt: plan.createdAt || existing?.createdAt || now,
      syncMeta: plan.syncMeta || existing?.syncMeta || createSyncMeta("draft"),
    };

    if (existing) {
      const idx = plans.findIndex((p) => p.id === existing!.id);
      plans[idx] = result;
    } else {
      plans.unshift(result);
    }

    this.saveToStorage(STORAGE_KEYS.WATER_PLANS, JSON.stringify(plans));
    this.notifyListeners();
    return result;
  }

  updatePlanSyncStatus(
    id: string,
    status: SyncStatus,
    error?: string,
    conflictData?: SyncMeta["conflictData"]
  ) {
    const plans = this.getWaterPlans();
    const idx = plans.findIndex((p) => p.id === id);
    if (idx !== -1) {
      plans[idx].syncMeta = {
        ...plans[idx].syncMeta,
        syncStatus: status,
        syncError: error,
        lastSyncAt: status === "synced" ? formatDate(new Date()) : plans[idx].syncMeta.lastSyncAt,
        syncAttempts: plans[idx].syncMeta.syncAttempts + 1,
        conflictData,
      };
      this.saveToStorage(STORAGE_KEYS.WATER_PLANS, JSON.stringify(plans));
      this.notifyListeners();
    }
  }

  deleteWaterPlan(id: string) {
    const plans = this.getWaterPlans().filter((p) => p.id !== id);
    this.saveToStorage(STORAGE_KEYS.WATER_PLANS, JSON.stringify(plans));
    this.notifyListeners();
  }

  getAlerts(): OfflineAlert[] {
    return this.loadFromStorage<OfflineAlert[]>(STORAGE_KEYS.ALERTS, []);
  }

  saveAlert(
    alert: Omit<OfflineAlert, "id" | "syncMeta" | "createdAt"> & {
      createdAt?: string;
    } & Partial<Pick<OfflineAlert, "id" | "syncMeta">>
  ): OfflineAlert {
    const alerts = this.getAlerts();
    const now = formatDate(new Date());

    let existing: OfflineAlert | undefined;
    if (alert.id) {
      existing = alerts.find((a) => a.id === alert.id);
    }

    const result: OfflineAlert = {
      id: alert.id || existing?.id || generateId(),
      recordId: alert.recordId,
      tankName: alert.tankName,
      tankId: alert.tankId,
      tankType: alert.tankType,
      metric: alert.metric,
      value: alert.value,
      threshold: alert.threshold,
      severity: alert.severity,
      description: alert.description,
      status: alert.status,
      treatment: alert.treatment,
      treatmentNote: alert.treatmentNote,
      handler: alert.handler,
      createdAt: alert.createdAt || existing?.createdAt || now,
      processedAt: alert.processedAt,
      syncMeta: alert.syncMeta || existing?.syncMeta || createSyncMeta("draft"),
    };

    if (existing) {
      const idx = alerts.findIndex((a) => a.id === existing!.id);
      alerts[idx] = result;
    } else {
      alerts.unshift(result);
    }

    this.saveToStorage(STORAGE_KEYS.ALERTS, JSON.stringify(alerts));
    this.notifyListeners();
    return result;
  }

  updateAlertSyncStatus(
    id: string,
    status: SyncStatus,
    error?: string,
    conflictData?: SyncMeta["conflictData"]
  ) {
    const alerts = this.getAlerts();
    const idx = alerts.findIndex((a) => a.id === id);
    if (idx !== -1) {
      alerts[idx].syncMeta = {
        ...alerts[idx].syncMeta,
        syncStatus: status,
        syncError: error,
        lastSyncAt: status === "synced" ? formatDate(new Date()) : alerts[idx].syncMeta.lastSyncAt,
        syncAttempts: alerts[idx].syncMeta.syncAttempts + 1,
        conflictData,
      };
      this.saveToStorage(STORAGE_KEYS.ALERTS, JSON.stringify(alerts));
      this.notifyListeners();
    }
  }

  getTasks(): MaintenanceTask[] {
    return this.loadFromStorage<MaintenanceTask[]>(STORAGE_KEYS.TASKS, []);
  }

  saveTask(
    task: Omit<MaintenanceTask, "id" | "syncMeta" | "createdAt"> & {
      createdAt?: string;
    } & Partial<Pick<MaintenanceTask, "id" | "syncMeta">>
  ): MaintenanceTask {
    const tasks = this.getTasks();
    const now = formatDate(new Date());

    let existing: MaintenanceTask | undefined;
    if (task.id) {
      existing = tasks.find((t) => t.id === task.id);
    }

    const result: MaintenanceTask = {
      id: task.id || existing?.id || generateId(),
      type: task.type,
      title: task.title,
      description: task.description,
      tankName: task.tankName,
      tankId: task.tankId,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      completedNote: task.completedNote,
      assignee: task.assignee,
      relatedRecordId: task.relatedRecordId,
      relatedAlertId: task.relatedAlertId,
      createdAt: task.createdAt || existing?.createdAt || now,
      syncMeta: task.syncMeta || existing?.syncMeta || createSyncMeta("draft"),
    };

    if (existing) {
      const idx = tasks.findIndex((t) => t.id === existing!.id);
      tasks[idx] = result;
    } else {
      tasks.unshift(result);
    }

    this.saveToStorage(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    this.notifyListeners();
    return result;
  }

  updateTaskSyncStatus(
    id: string,
    status: SyncStatus,
    error?: string,
    conflictData?: SyncMeta["conflictData"]
  ) {
    const tasks = this.getTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx !== -1) {
      tasks[idx].syncMeta = {
        ...tasks[idx].syncMeta,
        syncStatus: status,
        syncError: error,
        lastSyncAt: status === "synced" ? formatDate(new Date()) : tasks[idx].syncMeta.lastSyncAt,
        syncAttempts: tasks[idx].syncMeta.syncAttempts + 1,
        conflictData,
      };
      this.saveToStorage(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
      this.notifyListeners();
    }
  }

  deleteTask(id: string) {
    const tasks = this.getTasks().filter((t) => t.id !== id);
    this.saveToStorage(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    this.notifyListeners();
  }

  getRetestTasks(): OfflineRetestTask[] {
    const tasks = this.loadFromStorage<OfflineRetestTask[]>(
      STORAGE_KEYS.RETEST_TASKS,
      []
    );
    return this.checkAndUpdateOverdueRetestTasks(tasks);
  }

  private checkAndUpdateOverdueRetestTasks(
    tasks: OfflineRetestTask[]
  ): OfflineRetestTask[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let hasUpdates = false;
    const updated = tasks.map((task) => {
      if (task.status === "pending") {
        const dueDate = new Date(task.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        if (dueDate.getTime() < today.getTime()) {
          hasUpdates = true;
          return { ...task, status: "overdue" as OfflineRetestTaskStatus };
        }
      }
      return task;
    });
    if (hasUpdates) {
      this.saveToStorage(STORAGE_KEYS.RETEST_TASKS, JSON.stringify(updated));
      this.notifyListeners();
    }
    return updated.sort((a, b) => {
      const statusRank: Record<string, number> = {
        overdue: 0,
        pending: 1,
        completed: 2,
      };
      const rankA = statusRank[a.status] ?? 3;
      const rankB = statusRank[b.status] ?? 3;
      if (rankA !== rankB) return rankA - rankB;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }

  saveRetestTask(
    task: Omit<OfflineRetestTask, "id" | "syncMeta" | "createdAt" | "status" | "retestResult"> & {
      createdAt?: string;
      status?: OfflineRetestTaskStatus;
      retestResult?: OfflineRetestResult;
    } & Partial<Pick<OfflineRetestTask, "id" | "syncMeta">>
  ): OfflineRetestTask {
    const tasks = this.getRetestTasks();
    const now = formatDate(new Date());

    let existing: OfflineRetestTask | undefined;
    if (task.id) {
      existing = tasks.find((t) => t.id === task.id);
    }

    const result: OfflineRetestTask = {
      id: task.id || existing?.id || generateId(),
      sourceAlertId: task.sourceAlertId,
      sourceAlertMetric: task.sourceAlertMetric,
      sourceAlertMetricLabel: task.sourceAlertMetricLabel,
      tankName: task.tankName,
      tankId: task.tankId,
      tankType: task.tankType,
      triggerTreatment: task.triggerTreatment,
      treatmentNote: task.treatmentNote,
      originalValue: task.originalValue,
      originalUnit: task.originalUnit,
      thresholdRange: task.thresholdRange,
      dueDate: task.dueDate,
      status: task.status ?? existing?.status ?? "pending",
      retestRecordId: task.retestRecordId ?? existing?.retestRecordId,
      retestValue: task.retestValue ?? existing?.retestValue,
      retestResult: task.retestResult ?? existing?.retestResult ?? null,
      createdAt: task.createdAt || existing?.createdAt || now,
      completedAt: task.completedAt ?? existing?.completedAt,
      handler: task.handler ?? existing?.handler,
      syncMeta: task.syncMeta || existing?.syncMeta || createSyncMeta("draft"),
    };

    const allTasks = tasks.filter((t) => t.id !== result.id);
    allTasks.unshift(result);

    this.saveToStorage(STORAGE_KEYS.RETEST_TASKS, JSON.stringify(allTasks));
    this.notifyListeners();
    return result;
  }

  updateRetestTaskSyncStatus(
    id: string,
    status: SyncStatus,
    error?: string,
    conflictData?: SyncMeta["conflictData"]
  ) {
    const tasks = this.getRetestTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx !== -1) {
      tasks[idx].syncMeta = {
        ...tasks[idx].syncMeta,
        syncStatus: status,
        syncError: error,
        lastSyncAt:
          status === "synced" ? formatDate(new Date()) : tasks[idx].syncMeta.lastSyncAt,
        syncAttempts: tasks[idx].syncMeta.syncAttempts + 1,
        conflictData,
      };
      this.saveToStorage(STORAGE_KEYS.RETEST_TASKS, JSON.stringify(tasks));
      this.notifyListeners();
    }
  }

  deleteRetestTask(id: string) {
    const tasks = this.getRetestTasks().filter((t) => t.id !== id);
    this.saveToStorage(STORAGE_KEYS.RETEST_TASKS, JSON.stringify(tasks));
    this.notifyListeners();
  }

  createRetestTaskFromAlert(
    alert: OfflineAlert,
    treatment: OfflineTreatmentAction,
    treatmentNote: string,
    handler: string
  ): { retestTask: OfflineRetestTask; updatedAlert: OfflineAlert } {
    const dueDaysMap: Record<OfflineTreatmentAction, number> = {
      "复测": 1,
      "换水": 3,
      "停喂": 2,
      "补菌": 3,
      "温度调整": 2,
      "其他": 2,
    };
    const dueDays = dueDaysMap[treatment] ?? 2;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dueDateStr = `${dueDate.getFullYear()}-${pad(dueDate.getMonth() + 1)}-${pad(dueDate.getDate())}`;

    const retestTask = this.saveRetestTask({
      sourceAlertId: alert.id,
      sourceAlertMetric: alert.metric,
      sourceAlertMetricLabel: alert.metricLabel || alert.metric,
      tankName: alert.tankName,
      tankId: alert.tankId,
      tankType: alert.tankType,
      triggerTreatment: treatment,
      treatmentNote,
      originalValue: alert.value,
      originalUnit: alert.unit || "",
      thresholdRange: alert.thresholdRange || alert.threshold,
      dueDate: dueDateStr,
      handler,
    });

    const updatedAlert = this.saveAlert({
      ...alert,
      retestTaskId: retestTask.id,
    });

    return { retestTask, updatedAlert };
  }

  completeRetestTaskFromRecord(
    record: OfflineWaterRecord
  ): { completedTasks: OfflineRetestTask[]; updatedAlerts: OfflineAlert[] } {
    const tasks = this.getRetestTasks();
    const alerts = this.getAlerts();
    const completedTasks: OfflineRetestTask[] = [];
    const updatedAlerts: OfflineAlert[] = [];

    const pendingTasks = tasks.filter(
      (t) =>
        (t.status === "pending" || t.status === "overdue") &&
        (t.tankId === record.tankId ||
          (t.tankId === undefined && t.tankName === record.tankName))
    );

    for (const task of pendingTasks) {
      const metricKey = task.sourceAlertMetric as keyof typeof record.metrics;
      const retestValue = record.metrics[metricKey];
      if (retestValue && retestValue.trim()) {
        const isRecovered = this.evaluateMetricForRetest(
          task.sourceAlertMetric,
          retestValue,
          task.tankType
        );
        const now = formatDate(new Date());

        const completedTask = this.saveRetestTask({
          ...task,
          status: "completed",
          retestRecordId: record.id,
          retestValue,
          retestResult: isRecovered ? "recovered" : "not_recovered",
          completedAt: now,
        });
        completedTasks.push(completedTask);

        const alert = alerts.find((a) => a.id === task.sourceAlertId);
        if (alert) {
          const updatedAlert = this.saveAlert({
            ...alert,
            retestResult: isRecovered ? "recovered" : "not_recovered",
            isClosed: isRecovered,
            closedAt: isRecovered ? now : undefined,
          });
          updatedAlerts.push(updatedAlert);
        }
      }
    }

    return { completedTasks, updatedAlerts };
  }

  private evaluateMetricForRetest(
    metric: string,
    value: string,
    tankType: string
  ): boolean {
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return false;

    const isSaltwater = tankType.includes("海") || tankType.includes("海水");
    const isBreeding = tankType.includes("繁殖");

    const thresholds: Record<string, { min?: number; max?: number }> = {
      ph: { min: 6.5, max: 8.5 },
      ammonia: { max: 0.25 },
      nitrite: { max: 0.3 },
      nitrate: { max: isBreeding ? 20 : 40 },
      hardness: { min: 4, max: isSaltwater ? 12 : 10 },
      temperature: { min: 22, max: isSaltwater ? 27 : 28 },
    };

    const t = thresholds[metric];
    if (!t) return true;
    if (t.min !== undefined && numVal < t.min) return false;
    if (t.max !== undefined && numVal > t.max) return false;
    return true;
  }

  getSyncStats(): SyncStats {
    const records = this.getWaterRecords();
    const plans = this.getWaterPlans();
    const alerts = this.getAlerts();
    const tasks = this.getTasks();
    const retestTasks = this.getRetestTasks();
    const allEntities = [...records, ...plans, ...alerts, ...tasks, ...retestTasks];
    const queue = this.getSyncQueue();

    const stats: SyncStats = {
      draft: 0,
      pending: 0,
      synced: 0,
      failed: 0,
      conflict: 0,
      totalQueued: queue.filter((q) => q.status === "queued" || q.status === "syncing").length,
    };

    for (const entity of allEntities) {
      const s = entity.syncMeta.syncStatus;
      if (s === "draft") stats.draft++;
      else if (s === "pending") stats.pending++;
      else if (s === "synced") stats.synced++;
      else if (s === "failed") stats.failed++;
      else if (s === "conflict") stats.conflict++;
    }

    return stats;
  }

  promoteDraftsToQueue(): number {
    let promoted = 0;
    const queue = this.getSyncQueue();
    const queuedEntityIds = new Set(queue.map((q) => q.entityId));

    const promoteList = <T extends { id: string; syncMeta: SyncMeta }>(
      entities: T[],
      entityType: EntityType
    ): T[] => {
      const updated: T[] = [];
      for (const entity of entities) {
        if (
          entity.syncMeta.syncStatus === "draft" &&
          entity.syncMeta.pendingOperation &&
          !queuedEntityIds.has(entity.id)
        ) {
          entity.syncMeta = {
            ...entity.syncMeta,
            syncStatus: "pending",
          };
          this.addToQueue(
            entityType,
            entity.id,
            entity.syncMeta.pendingOperation!,
            entity
          );
          promoted++;
        }
        updated.push(entity);
      }
      return updated;
    };

    const records = promoteList(this.getWaterRecords(), "waterRecord");
    this.saveToStorage(STORAGE_KEYS.WATER_RECORDS, JSON.stringify(records));

    const plans = promoteList(this.getWaterPlans(), "waterChangePlan");
    this.saveToStorage(STORAGE_KEYS.WATER_PLANS, JSON.stringify(plans));

    const alerts = promoteList(this.getAlerts(), "alert");
    this.saveToStorage(STORAGE_KEYS.ALERTS, JSON.stringify(alerts));

    const tasks = promoteList(this.getTasks(), "maintenanceTask");
    this.saveToStorage(STORAGE_KEYS.TASKS, JSON.stringify(tasks));

    const retestTasks = promoteList(this.getRetestTasks(), "retestTask");
    this.saveToStorage(STORAGE_KEYS.RETEST_TASKS, JSON.stringify(retestTasks));

    if (promoted > 0) {
      this.notifyListeners();
    }
    return promoted;
  }

  clearAllOfflineData() {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    this.notifyListeners();
  }

  resetToDemoData() {
    this.clearAllOfflineData();
    const now = new Date();
    const nowStr = formatDate(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = formatDate(twoDaysAgo);

    this.saveWaterRecord({
      tankName: "草缸A",
      tankId: undefined,
      recordedAt: twoDaysAgoStr,
      metrics: {
        ph: "6.8",
        ammonia: "0",
        nitrite: "0",
        nitrate: "18",
        hardness: "8",
        temperature: "26",
        waterChange: "",
      },
      status: "关注",
      note: "硝酸盐略高，计划周末换水30%",
      syncMeta: { ...createSyncMeta("synced"), lastSyncAt: twoDaysAgoStr },
    });

    this.saveWaterRecord({
      tankName: "海缸B",
      tankId: undefined,
      recordedAt: yesterdayStr,
      metrics: {
        ph: "8.1",
        ammonia: "0",
        nitrite: "0",
        nitrate: "5",
        hardness: "10",
        temperature: "25.5",
        waterChange: "",
      },
      status: "关注",
      note: "钙硬度偏低，需复测",
      syncMeta: { ...createSyncMeta("pending"), pendingOperation: "create" },
    });

    this.saveWaterRecord({
      tankName: "繁殖缸C",
      tankId: undefined,
      recordedAt: nowStr,
      metrics: {
        ph: "7.2",
        ammonia: "0.2",
        nitrite: "0.8",
        nitrate: "30",
        hardness: "6",
        temperature: "28",
        waterChange: "",
      },
      status: "异常",
      note: "亚硝酸盐升高，立即停止投喂并换水",
      syncMeta: {
        ...createSyncMeta("failed"),
        syncAttempts: 3,
        syncError: "服务器连接超时（模拟）",
        pendingOperation: "create",
      },
    });

    this.saveWaterPlan({
      tankName: "草缸A",
      cycleDays: "7",
      waterRatio: "30",
      nextDate: formatDate(new Date(now.getTime() + 2 * 86400000)).slice(0, 10),
      note: "周日上午换水，注意水温",
      createdAt: twoDaysAgoStr,
      syncMeta: { ...createSyncMeta("synced"), lastSyncAt: twoDaysAgoStr },
    });

    this.saveWaterPlan({
      tankName: "繁殖缸C",
      cycleDays: "3",
      waterRatio: "20",
      nextDate: formatDate(now).slice(0, 10),
      note: "亚硝酸盐异常期，每日少量换水",
      createdAt: yesterdayStr,
      syncMeta: {
        ...createSyncMeta("conflict"),
        syncAttempts: 2,
        conflictData: {
          localSnapshot: { waterRatio: "20", cycleDays: "3" },
          serverSnapshot: { waterRatio: "30", cycleDays: "7" },
          conflictReason: "服务器版本与本地修改不一致（模拟冲突）",
        },
      },
    });

    this.saveAlert({
      recordId: "offline_demo_1",
      tankName: "繁殖缸C",
      tankType: "繁殖缸",
      metric: "亚硝酸盐",
      value: "0.8",
      threshold: "≤ 0.5",
      severity: "severe",
      description: "亚硝酸盐浓度超过安全阈值，可能导致鱼类中毒",
      status: "pending",
      createdAt: nowStr,
      syncMeta: { ...createSyncMeta("draft") },
    });

    this.saveTask({
      type: "waterTest",
      title: "每日水质检测",
      description: "检测所有鱼缸 pH、氨氮、亚硝酸盐、硝酸盐指标",
      tankName: "全部鱼缸",
      status: "pending",
      priority: "high",
      createdAt: nowStr,
      syncMeta: { ...createSyncMeta("draft") },
    });

    this.saveTask({
      type: "waterChange",
      title: "繁殖缸C紧急换水",
      description: "亚硝酸盐超标，立即换水20%并持续监测",
      tankName: "繁殖缸C",
      status: "inProgress",
      priority: "high",
      createdAt: nowStr,
      syncMeta: { ...createSyncMeta("pending"), pendingOperation: "create" },
    });

    this.saveTask({
      type: "alertFollowUp",
      title: "海缸B钙硬度复测",
      description: "昨日检测钙硬度偏低，今日复测确认",
      tankName: "海缸B",
      status: "pending",
      priority: "medium",
      createdAt: yesterdayStr,
      syncMeta: { ...createSyncMeta("synced"), lastSyncAt: yesterdayStr },
    });

    this.saveAlert({
      id: "offline_demo_alert_retest_1",
      recordId: "offline_demo_record_3",
      tankName: "繁殖缸C",
      tankType: "繁殖缸",
      metric: "nitrite",
      metricLabel: "亚硝酸盐",
      value: "0.8",
      unit: "mg/L",
      threshold: "≤ 0.5",
      thresholdRange: "≤ 0.5 mg/L",
      severity: "severe",
      description: "亚硝酸盐浓度超过安全阈值，可能导致鱼类中毒",
      status: "processed",
      treatment: "换水",
      treatmentNote: "已换水30%，计划3天后复测",
      handler: "张技师",
      createdAt: twoDaysAgoStr,
      processedAt: twoDaysAgoStr,
      retestTaskId: "offline_demo_retest_1",
      retestResult: null,
      isClosed: false,
      syncMeta: { ...createSyncMeta("draft"), pendingOperation: "update" },
    });

    this.saveRetestTask({
      id: "offline_demo_retest_1",
      sourceAlertId: "offline_demo_alert_retest_1",
      sourceAlertMetric: "nitrite",
      sourceAlertMetricLabel: "亚硝酸盐",
      tankName: "繁殖缸C",
      tankType: "繁殖缸",
      triggerTreatment: "换水",
      treatmentNote: "已换水30%，计划3天后复测",
      originalValue: "0.8",
      originalUnit: "mg/L",
      thresholdRange: "≤ 0.5 mg/L",
      dueDate: formatDate(new Date(now.getTime() + 1 * 86400000)).slice(0, 10),
      status: "pending",
      retestResult: null,
      createdAt: twoDaysAgoStr,
      handler: "张技师",
      syncMeta: { ...createSyncMeta("draft"), pendingOperation: "create" },
    });

    this.saveAlert({
      id: "offline_demo_alert_retest_2",
      recordId: "offline_demo_record_2",
      tankName: "海缸B",
      tankType: "海水缸",
      metric: "hardness",
      metricLabel: "钙硬度",
      value: "7",
      unit: "dH",
      threshold: "8-12",
      thresholdRange: "8-12 dH",
      severity: "mild",
      description: "钙硬度偏低，可能影响珊瑚生长",
      status: "processed",
      treatment: "补菌",
      treatmentNote: "已添加钙镁补充剂",
      handler: "李工",
      createdAt: yesterdayStr,
      processedAt: yesterdayStr,
      retestTaskId: "offline_demo_retest_2",
      retestResult: null,
      isClosed: false,
      syncMeta: { ...createSyncMeta("synced"), lastSyncAt: yesterdayStr },
    });

    this.saveRetestTask({
      id: "offline_demo_retest_2",
      sourceAlertId: "offline_demo_alert_retest_2",
      sourceAlertMetric: "hardness",
      sourceAlertMetricLabel: "钙硬度",
      tankName: "海缸B",
      tankType: "海水缸",
      triggerTreatment: "补菌",
      treatmentNote: "已添加钙镁补充剂",
      originalValue: "7",
      originalUnit: "dH",
      thresholdRange: "8-12 dH",
      dueDate: formatDate(new Date(now.getTime() - 1 * 86400000)).slice(0, 10),
      status: "overdue",
      retestResult: null,
      createdAt: yesterdayStr,
      handler: "李工",
      syncMeta: { ...createSyncMeta("synced"), lastSyncAt: yesterdayStr, pendingOperation: "update" },
    });

    this.saveRetestTask({
      id: "offline_demo_retest_3",
      sourceAlertId: "offline_demo_alert_completed_1",
      sourceAlertMetric: "ammonia",
      sourceAlertMetricLabel: "氨氮",
      tankName: "草缸A",
      tankType: "草缸",
      triggerTreatment: "停喂",
      treatmentNote: "停喂2天，加强过滤",
      originalValue: "0.3",
      originalUnit: "mg/L",
      thresholdRange: "≤ 0.25 mg/L",
      dueDate: formatDate(new Date(now.getTime() - 2 * 86400000)).slice(0, 10),
      status: "completed",
      retestRecordId: "offline_demo_record_4",
      retestValue: "0.2",
      retestResult: "recovered",
      createdAt: twoDaysAgoStr,
      completedAt: formatDate(new Date(now.getTime() - 1 * 86400000)),
      handler: "王师傅",
      syncMeta: { ...createSyncMeta("synced"), lastSyncAt: yesterdayStr },
    });

    this.notifyListeners();
  }
}

export const offlineSyncStore = new OfflineSyncStore();
export { createSyncMeta, generateId, formatDate };
