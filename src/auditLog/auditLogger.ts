import { auditLogStore } from "./auditLogStore";
import type { AuditLogEntry, AuditEntityType, AuditOperation, FieldChange } from "./types";

const FIELD_LABELS: Record<string, string> = {
  name: "名称",
  tankType: "缸型",
  capacity: "容量",
  setupDate: "开缸日期",
  mainCreatures: "主要生物",
  maintainer: "维护负责人",
  customThresholds: "适养参数",
  customerId: "客户ID",
  tankName: "鱼缸",
  tankId: "鱼缸ID",
  recordedAt: "记录时间",
  metrics: "水质指标",
  status: "状态",
  note: "备注",
  cycleDays: "换水周期",
  waterRatio: "换水比例",
  nextDate: "下次维护日期",
  completedAt: "完成时间",
  createdAt: "创建时间",
  metric: "指标",
  metricLabel: "指标名称",
  value: "数值",
  unit: "单位",
  severity: "严重程度",
  threshold: "阈值",
  thresholdRange: "阈值范围",
  description: "描述",
  treatment: "处理方式",
  treatmentNote: "处理备注",
  handler: "处理人",
  processedAt: "处理时间",
  retestTaskId: "复测任务ID",
  retestResult: "复测结果",
  isClosed: "是否关闭",
  closedAt: "关闭时间",
  priority: "优先级",
  dueDate: "到期日期",
  assignee: "负责人",
  title: "标题",
  type: "类型",
  ph: "pH",
  ammonia: "氨氮",
  nitrite: "亚硝酸盐",
  nitrate: "硝酸盐",
  hardness: "硬度",
  temperature: "温度",
  waterChange: "换水量",
};

function computeChangedFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): FieldChange[] {
  if (!before && !after) return [];
  if (!before) {
    return Object.entries(after!).map(([key, val]) => ({
      field: key,
      fieldLabel: FIELD_LABELS[key] || key,
      oldValue: undefined,
      newValue: val,
    }));
  }
  if (!after) {
    return Object.entries(before).map(([key, val]) => ({
      field: key,
      fieldLabel: FIELD_LABELS[key] || key,
      oldValue: val,
      newValue: undefined,
    }));
  }

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: FieldChange[] = [];

  for (const key of allKeys) {
    const oldVal = before[key];
    const newVal = after[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        field: key,
        fieldLabel: FIELD_LABELS[key] || key,
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  return changes;
}

class AuditLogger {
  async logCreate(
    entityType: AuditEntityType,
    entity: Record<string, unknown>,
    options?: {
      tankId?: string;
      tankName?: string;
      operator?: string;
      detail?: string;
    }
  ): Promise<AuditLogEntry> {
    const entityId = String(entity.id || "");
    const entityName = String(entity.name || entity.tankName || entity.title || entityId);

    return auditLogStore.addLog({
      entityType,
      entityId,
      entityName,
      operation: "create",
      tankId: options?.tankId || (entity.tankId as string | undefined),
      tankName: options?.tankName || (entity.tankName as string | undefined),
      operator: options?.operator,
      beforeSnapshot: undefined,
      afterSnapshot: entity,
      changedFields: computeChangedFields(undefined, entity),
      detail: options?.detail,
    });
  }

  async logUpdate(
    entityType: AuditEntityType,
    entityId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    options?: {
      tankId?: string;
      tankName?: string;
      operator?: string;
      detail?: string;
    }
  ): Promise<AuditLogEntry> {
    const entityName = String(after.name || after.tankName || after.title || entityId);
    const changedFields = computeChangedFields(before, after);

    return auditLogStore.addLog({
      entityType,
      entityId,
      entityName,
      operation: "update",
      tankId: options?.tankId || (after.tankId as string | undefined) || (before.tankId as string | undefined),
      tankName: options?.tankName || (after.tankName as string | undefined) || (before.tankName as string | undefined),
      operator: options?.operator,
      beforeSnapshot: before,
      afterSnapshot: after,
      changedFields,
      detail: options?.detail,
    });
  }

  async logDelete(
    entityType: AuditEntityType,
    entity: Record<string, unknown>,
    options?: {
      tankId?: string;
      tankName?: string;
      operator?: string;
      detail?: string;
    }
  ): Promise<AuditLogEntry> {
    const entityId = String(entity.id || "");
    const entityName = String(entity.name || entity.tankName || entity.title || entityId);

    return auditLogStore.addLog({
      entityType,
      entityId,
      entityName,
      operation: "delete",
      tankId: options?.tankId || (entity.tankId as string | undefined),
      tankName: options?.tankName || (entity.tankName as string | undefined),
      operator: options?.operator,
      beforeSnapshot: entity,
      afterSnapshot: undefined,
      changedFields: computeChangedFields(entity, undefined),
      detail: options?.detail,
    });
  }

  async logProcess(
    entityType: AuditEntityType,
    entityId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    options?: {
      tankId?: string;
      tankName?: string;
      operator?: string;
      detail?: string;
    }
  ): Promise<AuditLogEntry> {
    const entityName = String(after.name || after.tankName || after.title || entityId);
    const changedFields = computeChangedFields(before, after);

    return auditLogStore.addLog({
      entityType,
      entityId,
      entityName,
      operation: "process",
      tankId: options?.tankId || (after.tankId as string | undefined),
      tankName: options?.tankName || (after.tankName as string | undefined),
      operator: options?.operator,
      beforeSnapshot: before,
      afterSnapshot: after,
      changedFields,
      detail: options?.detail,
    });
  }

  async logComplete(
    entityType: AuditEntityType,
    entityId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    options?: {
      tankId?: string;
      tankName?: string;
      operator?: string;
      detail?: string;
    }
  ): Promise<AuditLogEntry> {
    const entityName = String(after.name || after.tankName || after.title || entityId);
    const changedFields = computeChangedFields(before, after);

    return auditLogStore.addLog({
      entityType,
      entityId,
      entityName,
      operation: "complete",
      tankId: options?.tankId || (after.tankId as string | undefined),
      tankName: options?.tankName || (after.tankName as string | undefined),
      operator: options?.operator,
      beforeSnapshot: before,
      afterSnapshot: after,
      changedFields,
      detail: options?.detail,
    });
  }

  async logSyncSuccess(
    entityType: AuditEntityType,
    entityId: string,
    options?: {
      tankId?: string;
      tankName?: string;
      entityName?: string;
      syncQueueItemId?: string;
      detail?: string;
    }
  ): Promise<AuditLogEntry> {
    return auditLogStore.addLog({
      entityType,
      entityId,
      entityName: options?.entityName || entityId,
      operation: "sync_success",
      tankId: options?.tankId,
      tankName: options?.tankName,
      syncQueueItemId: options?.syncQueueItemId,
      changedFields: [],
      detail: options?.detail || "同步成功",
    });
  }

  async logSyncFailure(
    entityType: AuditEntityType,
    entityId: string,
    options?: {
      tankId?: string;
      tankName?: string;
      entityName?: string;
      syncQueueItemId?: string;
      detail?: string;
      conflictReason?: string;
    }
  ): Promise<AuditLogEntry> {
    return auditLogStore.addLog({
      entityType,
      entityId,
      entityName: options?.entityName || entityId,
      operation: "sync_failure",
      tankId: options?.tankId,
      tankName: options?.tankName,
      syncQueueItemId: options?.syncQueueItemId,
      conflictReason: options?.conflictReason,
      changedFields: [],
      detail: options?.detail || "同步失败",
    });
  }

  async logConflictDetected(
    entityType: AuditEntityType,
    entityId: string,
    options?: {
      tankId?: string;
      tankName?: string;
      entityName?: string;
      syncQueueItemId?: string;
      conflictReason?: string;
      beforeSnapshot?: Record<string, unknown>;
      afterSnapshot?: Record<string, unknown>;
    }
  ): Promise<AuditLogEntry> {
    return auditLogStore.addLog({
      entityType,
      entityId,
      entityName: options?.entityName || entityId,
      operation: "conflict_detected",
      tankId: options?.tankId,
      tankName: options?.tankName,
      syncQueueItemId: options?.syncQueueItemId,
      conflictReason: options?.conflictReason,
      beforeSnapshot: options?.beforeSnapshot,
      afterSnapshot: options?.afterSnapshot,
      changedFields: computeChangedFields(options?.beforeSnapshot, options?.afterSnapshot),
      detail: options?.conflictReason || "检测到数据冲突",
    });
  }

  async logConflictResolved(
    entityType: AuditEntityType,
    entityId: string,
    options?: {
      tankId?: string;
      tankName?: string;
      entityName?: string;
      syncQueueItemId?: string;
      mergeSource?: string;
      detail?: string;
    }
  ): Promise<AuditLogEntry> {
    return auditLogStore.addLog({
      entityType,
      entityId,
      entityName: options?.entityName || entityId,
      operation: "conflict_resolved",
      tankId: options?.tankId,
      tankName: options?.tankName,
      syncQueueItemId: options?.syncQueueItemId,
      mergeSource: options?.mergeSource,
      changedFields: [],
      detail: options?.detail || "冲突已解决",
    });
  }

  async logImport(
    entityType: AuditEntityType,
    count: number,
    options?: {
      tankId?: string;
      tankName?: string;
      operator?: string;
      detail?: string;
    }
  ): Promise<AuditLogEntry> {
    return auditLogStore.addLog({
      entityType,
      entityId: `import_${Date.now()}`,
      entityName: `批量导入${count}条`,
      operation: "import",
      tankId: options?.tankId,
      tankName: options?.tankName,
      operator: options?.operator,
      detail: options?.detail || `批量导入${count}条${entityType === "waterRecord" ? "水质记录" : "数据"}`,
      changedFields: [],
    });
  }

  async logClearAll(operator?: string): Promise<AuditLogEntry> {
    return auditLogStore.addLog({
      entityType: "tank",
      entityId: "all",
      entityName: "全部数据",
      operation: "clear_all",
      operator,
      detail: "清空所有数据",
      changedFields: [],
    });
  }

  async logResetSeed(operator?: string): Promise<AuditLogEntry> {
    return auditLogStore.addLog({
      entityType: "tank",
      entityId: "all",
      entityName: "全部数据",
      operation: "reset_seed",
      operator,
      detail: "重置为演示数据",
      changedFields: [],
    });
  }
}

export const auditLogger = new AuditLogger();
export { computeChangedFields };
