import { useState, useEffect, useCallback } from "react";
import { auditLogStore } from "./auditLogStore";
import type {
  AuditLogEntry,
  AuditEntityType,
  AuditOperation,
  FieldChange,
} from "./types";
import {
  AUDIT_OPERATION_LABEL,
  AUDIT_OPERATION_ICON,
  AUDIT_ENTITY_LABEL,
  AUDIT_ENTITY_ICON,
} from "./types";
import type { TankProfile } from "../db/types";

interface AuditTimelinePanelProps {
  tanks: TankProfile[];
}

const ENTITY_TYPE_OPTIONS: { value: AuditEntityType | "all"; label: string }[] = [
  { value: "all", label: "全部类型" },
  { value: "tank", label: "🐠 鱼缸档案" },
  { value: "waterRecord", label: "💧 水质记录" },
  { value: "waterChangePlan", label: "📅 换水计划" },
  { value: "alert", label: "🚨 异常提醒" },
  { value: "retestTask", label: "🔬 复测任务" },
  { value: "maintenanceTask", label: "🛠️ 维护任务" },
];

const OPERATION_OPTIONS: { value: AuditOperation | "all"; label: string }[] = [
  { value: "all", label: "全部操作" },
  { value: "create", label: "➕ 新增" },
  { value: "update", label: "✏️ 编辑" },
  { value: "delete", label: "🗑️ 删除" },
  { value: "process", label: "🔧 处理" },
  { value: "complete", label: "✅ 完成" },
  { value: "sync_success", label: "🔄 同步成功" },
  { value: "sync_failure", label: "❌ 同步失败" },
  { value: "conflict_detected", label: "⚠️ 冲突检测" },
  { value: "conflict_resolved", label: "🤝 冲突解决" },
  { value: "import", label: "📋 批量导入" },
];

function formatFieldValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function FieldChangeRow({ change }: { change: FieldChange }) {
  return (
    <tr className="audit-diff-row">
      <td className="audit-diff-field">{change.fieldLabel}</td>
      <td className="audit-diff-old">{formatFieldValue(change.oldValue)}</td>
      <td className="audit-diff-new">{formatFieldValue(change.newValue)}</td>
    </tr>
  );
}

function AuditLogCard({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: AuditLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const opIcon = AUDIT_OPERATION_ICON[entry.operation];
  const opLabel = AUDIT_OPERATION_LABEL[entry.operation];
  const entityIcon = AUDIT_ENTITY_ICON[entry.entityType];
  const entityLabel = AUDIT_ENTITY_LABEL[entry.entityType];

  const operationClass = `audit-op audit-op-${entry.operation}`;

  return (
    <article className="audit-log-card">
      <div className="audit-log-header" onClick={onToggle}>
        <div className="audit-log-marker">
          <span className={operationClass}>{opIcon}</span>
        </div>
        <div className="audit-log-main">
          <div className="audit-log-title">
            <span className="audit-log-entity">
              {entityIcon} {entityLabel}
            </span>
            <span className={operationClass}>{opLabel}</span>
            {entry.entityName && (
              <span className="audit-log-entity-name">{entry.entityName}</span>
            )}
          </div>
          <div className="audit-log-meta">
            {entry.tankName && (
              <span className="audit-log-tank">{entry.tankName}</span>
            )}
            <span className="audit-log-time">{entry.createdAt}</span>
            {entry.operator && (
              <span className="audit-log-operator">操作人: {entry.operator}</span>
            )}
          </div>
          {entry.detail && (
            <p className="audit-log-detail">{entry.detail}</p>
          )}
          {entry.changedFields.length > 0 && !isExpanded && (
            <div className="audit-log-changes-preview">
              变更字段: {entry.changedFields.map((c) => c.fieldLabel).join("、")}
            </div>
          )}
        </div>
        <div className="audit-log-expand">
          {entry.changedFields.length > 0 && (
            <span className={`audit-expand-icon ${isExpanded ? "expanded" : ""}`}>
              ▸
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="audit-log-diff">
          {entry.changedFields.length > 0 && (
            <table className="audit-diff-table">
              <thead>
                <tr>
                  <th>字段</th>
                  <th>变更前</th>
                  <th>变更后</th>
                </tr>
              </thead>
              <tbody>
                {entry.changedFields.map((change, idx) => (
                  <FieldChangeRow key={`${change.field}-${idx}`} change={change} />
                ))}
              </tbody>
            </table>
          )}
          {entry.conflictReason && (
            <div className="audit-conflict-info">
              <strong>冲突原因:</strong> {entry.conflictReason}
            </div>
          )}
          {entry.mergeSource && (
            <div className="audit-merge-info">
              <strong>合并来源:</strong> {entry.mergeSource === "local" ? "本地版本" : entry.mergeSource === "server" ? "服务器版本" : "人工合并"}
            </div>
          )}
          {entry.beforeSnapshot && (
            <details className="audit-snapshot-details">
              <summary>变更前完整快照</summary>
              <pre className="audit-snapshot-pre">
                {JSON.stringify(entry.beforeSnapshot, null, 2)}
              </pre>
            </details>
          )}
          {entry.afterSnapshot && (
            <details className="audit-snapshot-details">
              <summary>变更后完整快照</summary>
              <pre className="audit-snapshot-pre">
                {JSON.stringify(entry.afterSnapshot, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </article>
  );
}

export function AuditTimelinePanel({ tanks }: AuditTimelinePanelProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [selectedTankId, setSelectedTankId] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<AuditEntityType | "all">("all");
  const [operationFilter, setOperationFilter] = useState<AuditOperation | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const loadLogs = useCallback(async () => {
    let result: AuditLogEntry[];
    if (selectedTankId === "all") {
      result = await auditLogStore.getAllLogs();
    } else {
      const tank = tanks.find((t) => t.id === selectedTankId);
      result = await auditLogStore.getTimelineForTank(
        selectedTankId,
        tank?.name
      );
    }

    if (entityTypeFilter !== "all") {
      result = result.filter((l) => l.entityType === entityTypeFilter);
    }
    if (operationFilter !== "all") {
      result = result.filter((l) => l.operation === operationFilter);
    }

    setLogs(result);
  }, [selectedTankId, entityTypeFilter, operationFilter, tanks]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    return auditLogStore.subscribe(loadLogs);
  }, [loadLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTankId, entityTypeFilter, operationFilter]);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
  const paginatedLogs = logs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const tankOptions = [
    { id: "all", name: "全部鱼缸" },
    ...tanks,
  ];

  return (
    <section className="audit-timeline panel">
      <div className="section-heading">
        <div>
          <p>数据审计</p>
          <h2>操作版本链</h2>
        </div>
        <div className="audit-heading-stats">
          <span className="audit-count-badge">{logs.length} 条日志</span>
        </div>
      </div>

      <div className="audit-filters">
        <div className="audit-filter-group">
          <label>
            <span>鱼缸</span>
            <select
              value={selectedTankId}
              onChange={(e) => setSelectedTankId(e.target.value)}
            >
              {tankOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>实体类型</span>
            <select
              value={entityTypeFilter}
              onChange={(e) =>
                setEntityTypeFilter(e.target.value as AuditEntityType | "all")
              }
            >
              {ENTITY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>操作类型</span>
            <select
              value={operationFilter}
              onChange={(e) =>
                setOperationFilter(e.target.value as AuditOperation | "all")
              }
            >
              {OPERATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {paginatedLogs.length === 0 ? (
        <div className="empty-state empty-state-compact">
          <div className="empty-icon">📋</div>
          <h3>暂无操作日志</h3>
          <p>对水质记录、鱼缸档案、换水计划等数据进行操作后，审计日志将自动记录在这里。</p>
        </div>
      ) : (
        <div className="audit-timeline-list">
          {paginatedLogs.map((entry) => (
            <AuditLogCard
              key={entry.id}
              entry={entry}
              isExpanded={expandedId === entry.id}
              onToggle={() => toggleExpand(entry.id)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="audit-pagination">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span className="audit-page-info">
            {currentPage} / {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </button>
        </div>
      )}
    </section>
  );
}
