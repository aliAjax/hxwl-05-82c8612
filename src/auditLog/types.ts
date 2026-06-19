export type AuditEntityType =
  | "tank"
  | "waterRecord"
  | "waterChangePlan"
  | "alert"
  | "retestTask"
  | "maintenanceTask";

export type AuditOperation =
  | "create"
  | "update"
  | "delete"
  | "process"
  | "complete"
  | "sync_success"
  | "sync_failure"
  | "conflict_detected"
  | "conflict_resolved"
  | "import"
  | "clear_all"
  | "reset_seed";

export interface FieldChange {
  field: string;
  fieldLabel: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface AuditLogEntry {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  entityName?: string;
  operation: AuditOperation;
  tankId?: string;
  tankName?: string;
  operator?: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  changedFields: FieldChange[];
  detail?: string;
  syncQueueItemId?: string;
  conflictReason?: string;
  mergeSource?: string;
  createdAt: string;
  sequence: number;
}

export const AUDIT_OPERATION_LABEL: Record<AuditOperation, string> = {
  create: "新增",
  update: "编辑",
  delete: "删除",
  process: "处理",
  complete: "完成",
  sync_success: "同步成功",
  sync_failure: "同步失败",
  conflict_detected: "冲突检测",
  conflict_resolved: "冲突解决",
  import: "批量导入",
  clear_all: "清空数据",
  reset_seed: "重置演示",
};

export const AUDIT_OPERATION_ICON: Record<AuditOperation, string> = {
  create: "➕",
  update: "✏️",
  delete: "🗑️",
  process: "🔧",
  complete: "✅",
  sync_success: "🔄",
  sync_failure: "❌",
  conflict_detected: "⚠️",
  conflict_resolved: "🤝",
  import: "📋",
  clear_all: "🗑️",
  reset_seed: "🔁",
};

export const AUDIT_ENTITY_LABEL: Record<AuditEntityType, string> = {
  tank: "鱼缸档案",
  waterRecord: "水质记录",
  waterChangePlan: "换水计划",
  alert: "异常提醒",
  retestTask: "复测任务",
  maintenanceTask: "维护任务",
};

export const AUDIT_ENTITY_ICON: Record<AuditEntityType, string> = {
  tank: "🐠",
  waterRecord: "💧",
  waterChangePlan: "📅",
  alert: "🚨",
  retestTask: "🔬",
  maintenanceTask: "🛠️",
};
