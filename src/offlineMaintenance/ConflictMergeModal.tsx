import { useState, useMemo } from "react";
import type {
  SyncQueueItem,
  EntityType,
  MergeFieldChoice,
  OfflineWaterRecord,
  OfflineWaterChangePlan,
  OfflineAlert,
  MaintenanceTask,
} from "../offlineSync";
import { syncEngine } from "../offlineSync";

const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  waterRecord: "水质记录",
  waterChangePlan: "换水计划",
  alert: "异常提醒",
  maintenanceTask: "维护任务",
  retestTask: "复测任务",
  tank: "鱼缸档案",
};

interface FieldConfig {
  key: string;
  label: string;
  group?: string;
  format?: (value: unknown) => string;
}

const WATER_RECORD_FIELDS: FieldConfig[] = [
  { key: "tankName", label: "鱼缸名称" },
  { key: "recordedAt", label: "记录时间" },
  { key: "status", label: "状态" },
  { key: "note", label: "备注" },
  { key: "metrics.ph", label: "pH", group: "水质指标" },
  { key: "metrics.ammonia", label: "氨氮", group: "水质指标" },
  { key: "metrics.nitrite", label: "亚硝酸盐", group: "水质指标" },
  { key: "metrics.nitrate", label: "硝酸盐", group: "水质指标" },
  { key: "metrics.hardness", label: "硬度", group: "水质指标" },
  { key: "metrics.temperature", label: "温度", group: "水质指标" },
  { key: "metrics.waterChange", label: "换水量", group: "水质指标" },
];

const WATER_CHANGE_PLAN_FIELDS: FieldConfig[] = [
  { key: "tankName", label: "鱼缸名称" },
  { key: "cycleDays", label: "换水周期（天）" },
  { key: "waterRatio", label: "换水比例（%）" },
  { key: "nextDate", label: "下次维护日期" },
  { key: "note", label: "备注" },
  { key: "completedAt", label: "完成时间" },
];

const ALERT_FIELDS: FieldConfig[] = [
  { key: "tankName", label: "鱼缸名称" },
  { key: "tankType", label: "鱼缸类型" },
  { key: "metric", label: "指标" },
  { key: "value", label: "数值" },
  { key: "threshold", label: "阈值" },
  { key: "severity", label: "严重程度" },
  { key: "description", label: "描述" },
  { key: "status", label: "状态" },
  { key: "treatment", label: "处理方式" },
  { key: "treatmentNote", label: "处理备注" },
  { key: "handler", label: "处理人" },
  { key: "isClosed", label: "是否已关闭" },
];

const MAINTENANCE_TASK_FIELDS: FieldConfig[] = [
  { key: "title", label: "任务标题" },
  { key: "type", label: "任务类型" },
  { key: "description", label: "描述" },
  { key: "tankName", label: "鱼缸名称" },
  { key: "status", label: "状态" },
  { key: "priority", label: "优先级" },
  { key: "dueDate", label: "截止日期" },
  { key: "assignee", label: "负责人" },
  { key: "completedNote", label: "完成备注" },
];

const RETEST_TASK_FIELDS: FieldConfig[] = [
  { key: "tankName", label: "鱼缸名称" },
  { key: "sourceAlertMetricLabel", label: "复测指标" },
  { key: "triggerTreatment", label: "触发处理" },
  { key: "treatmentNote", label: "处理备注" },
  { key: "originalValue", label: "原始数值" },
  { key: "thresholdRange", label: "阈值范围" },
  { key: "dueDate", label: "截止日期" },
  { key: "status", label: "状态" },
  { key: "retestValue", label: "复测数值" },
  { key: "retestResult", label: "复测结果" },
  { key: "handler", label: "处理人" },
];

const getFieldsForEntity = (entityType: EntityType): FieldConfig[] => {
  switch (entityType) {
    case "waterRecord":
      return WATER_RECORD_FIELDS;
    case "waterChangePlan":
      return WATER_CHANGE_PLAN_FIELDS;
    case "alert":
      return ALERT_FIELDS;
    case "maintenanceTask":
      return MAINTENANCE_TASK_FIELDS;
    case "retestTask":
      return RETEST_TASK_FIELDS;
    default:
      return [];
  }
};

const getNestedValue = (obj: unknown, path: string): unknown => {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
};

const setNestedValue = (obj: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== "object" || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
};

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

interface ConflictMergeModalProps {
  item: SyncQueueItem;
  onClose: () => void;
  onResolved: () => void;
}

export function ConflictMergeModal({ item, onClose, onResolved }: ConflictMergeModalProps) {
  const fields = useMemo(() => getFieldsForEntity(item.entityType), [item.entityType]);

  const localData = useMemo(() => {
    if (item.conflictData?.localSnapshot) {
      return item.conflictData.localSnapshot as Record<string, unknown>;
    }
    return item.data as Record<string, unknown>;
  }, [item.data, item.conflictData]);

  const serverData = useMemo(() => {
    if (item.conflictData?.serverSnapshot) {
      return item.conflictData.serverSnapshot as Record<string, unknown>;
    }
    return {
      ...localData,
      note: "[服务器版本] 数据可能与本地不同",
      updatedAt: new Date().toLocaleString(),
    };
  }, [item.conflictData, localData]);

  const [fieldChoices, setFieldChoices] = useState<Record<string, "local" | "server">>(() => {
    const choices: Record<string, "local" | "server"> = {};
    fields.forEach((f) => {
      const localVal = getNestedValue(localData, f.key);
      const serverVal = getNestedValue(serverData, f.key);
      const localStr = JSON.stringify(localVal);
      const serverStr = JSON.stringify(serverVal);
      choices[f.key] = localStr === serverStr ? "local" : "local";
    });
    return choices;
  });

  const diffCount = useMemo(() => {
    let count = 0;
    fields.forEach((f) => {
      const localVal = getNestedValue(localData, f.key);
      const serverVal = getNestedValue(serverData, f.key);
      if (JSON.stringify(localVal) !== JSON.stringify(serverVal)) {
        count++;
      }
    });
    return count;
  }, [fields, localData, serverData]);

  const handleChooseAll = (source: "local" | "server") => {
    const choices: Record<string, "local" | "server"> = {};
    fields.forEach((f) => {
      choices[f.key] = source;
    });
    setFieldChoices(choices);
  };

  const handleFieldChoice = (fieldKey: string, source: "local" | "server") => {
    setFieldChoices((prev) => ({ ...prev, [fieldKey]: source }));
  };

  const handleConfirmMerge = () => {
    const mergedData: Record<string, unknown> = JSON.parse(JSON.stringify(localData));

    fields.forEach((f) => {
      if (fieldChoices[f.key] === "server") {
        const serverVal = getNestedValue(serverData, f.key);
        setNestedValue(mergedData, f.key, serverVal);
      }
    });

    const choices: MergeFieldChoice[] = fields.map((f) => ({
      field: f.key,
      source: fieldChoices[f.key],
    }));

    const success = syncEngine.resolveConflictWithMerge(item.id, mergedData, choices);
    if (success) {
      onResolved();
    } else {
      alert("合并失败，请重试。");
    }
  };

  const groupedFields = useMemo(() => {
    const groups: { name: string | null; fields: FieldConfig[] }[] = [];
    let currentGroup: string | null = null;
    let currentFields: FieldConfig[] = [];

    fields.forEach((f) => {
      const groupName = f.group || null;
      if (groupName !== currentGroup) {
        if (currentFields.length > 0) {
          groups.push({ name: currentGroup, fields: currentFields });
        }
        currentGroup = groupName;
        currentFields = [f];
      } else {
        currentFields.push(f);
      }
    });
    if (currentFields.length > 0) {
      groups.push({ name: currentGroup, fields: currentFields });
    }
    return groups;
  }, [fields]);

  const isFieldDifferent = (fieldKey: string): boolean => {
    const localVal = getNestedValue(localData, fieldKey);
    const serverVal = getNestedValue(serverData, fieldKey);
    return JSON.stringify(localVal) !== JSON.stringify(serverVal);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content merge-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="merge-modal-subtitle">🔀 人工合并冲突</p>
            <h2>
              {ENTITY_TYPE_LABEL[item.entityType]} - 字段级合并
            </h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="modal-body merge-modal-body">
          <div className="merge-summary-bar">
            <div className="merge-summary-info">
              <span className="merge-diff-badge">
                {diffCount} 个字段存在差异
              </span>
              <span className="merge-entity-preview">
                {formatEntityName(item)}
              </span>
            </div>
            <div className="merge-summary-actions">
              <button
                className="secondary-action merge-all-btn"
                onClick={() => handleChooseAll("local")}
              >
                📱 全部使用本地
              </button>
              <button
                className="secondary-action merge-all-btn"
                onClick={() => handleChooseAll("server")}
              >
                ☁️ 全部使用服务器
              </button>
            </div>
          </div>

          <div className="merge-table-header">
            <div className="merge-field-col">字段</div>
            <div className="merge-local-col">
              <span className="merge-col-icon">📱</span> 本地版本
            </div>
            <div className="merge-server-col">
              <span className="merge-col-icon">☁️</span> 服务器版本
            </div>
          </div>

          <div className="merge-field-list">
            {groupedFields.map((group) => (
              <div key={group.name || "default"} className="merge-field-group">
                {group.name && (
                  <div className="merge-group-title">{group.name}</div>
                )}
                {group.fields.map((field) => {
                  const isDiff = isFieldDifferent(field.key);
                  const choice = fieldChoices[field.key];
                  const localVal = getNestedValue(localData, field.key);
                  const serverVal = getNestedValue(serverData, field.key);

                  return (
                    <div
                      key={field.key}
                      className={`merge-field-row ${isDiff ? "has-diff" : "no-diff"} ${choice === "local" ? "choice-local" : "choice-server"}`}
                    >
                      <div className="merge-field-label">
                        {field.label}
                        {isDiff && <span className="diff-indicator">●</span>}
                      </div>
                      <div
                        className={`merge-value-cell merge-value-local ${choice === "local" ? "selected" : ""}`}
                        onClick={() => handleFieldChoice(field.key, "local")}
                      >
                        <div className="merge-value-content">
                          {formatValue(localVal)}
                        </div>
                        <div className="merge-value-check">
                          {choice === "local" && "✓"}
                        </div>
                      </div>
                      <div
                        className={`merge-value-cell merge-value-server ${choice === "server" ? "selected" : ""}`}
                        onClick={() => handleFieldChoice(field.key, "server")}
                      >
                        <div className="merge-value-content">
                          {formatValue(serverVal)}
                        </div>
                        <div className="merge-value-check">
                          {choice === "server" && "✓"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <footer className="modal-footer merge-modal-footer">
          <button className="secondary-action" onClick={onClose}>
            取消
          </button>
          <button className="primary-action" onClick={handleConfirmMerge}>
            ✓ 确认合并并重试同步
          </button>
        </footer>
      </div>
    </div>
  );
}

function formatEntityName(item: SyncQueueItem): string {
  const data = item.data as Record<string, unknown> | undefined;
  if (!data) return "未知数据";
  const name =
    (data.tankName as string) ||
    (data.title as string) ||
    (data.name as string) ||
    "未命名";
  return name;
}
