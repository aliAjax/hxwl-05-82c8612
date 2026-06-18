import { useState, useMemo } from "react";
import type { RetestTask, RetestTaskStatus } from "../alertCenter/types";

interface RetestTaskPanelProps {
  retestTasks: RetestTask[];
  onJumpToRecord?: () => void;
}

const STATUS_LABELS: Record<RetestTaskStatus, string> = {
  pending: "待复测",
  overdue: "已逾期",
  completed: "已完成",
};

const STATUS_COLORS: Record<RetestTaskStatus, string> = {
  pending: "retest-status-pending",
  overdue: "retest-status-overdue",
  completed: "retest-status-completed",
};

type RetestFilter = "全部" | "已逾期" | "待复测" | "已完成";

const RETEST_FILTER_OPTIONS: RetestFilter[] = ["全部", "已逾期", "待复测", "已完成"];

export function RetestTaskPanel({ retestTasks, onJumpToRecord }: RetestTaskPanelProps) {
  const [filter, setFilter] = useState<RetestFilter>("全部");

  const filteredTasks = useMemo(() => {
    let result = [...retestTasks];
    if (filter === "已逾期") result = result.filter((t) => t.status === "overdue");
    else if (filter === "待复测") result = result.filter((t) => t.status === "pending");
    else if (filter === "已完成") result = result.filter((t) => t.status === "completed");
    return result;
  }, [retestTasks, filter]);

  const pendingCount = retestTasks.filter((t) => t.status === "pending" || t.status === "overdue").length;

  const getFilterCount = (f: RetestFilter): number => {
    if (f === "全部") return retestTasks.length;
    if (f === "已逾期") return retestTasks.filter((t) => t.status === "overdue").length;
    if (f === "待复测") return retestTasks.filter((t) => t.status === "pending").length;
    if (f === "已完成") return retestTasks.filter((t) => t.status === "completed").length;
    return 0;
  };

  const getDaysUntilDue = (dueDate: string): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "明天";
    if (diffDays > 0) return `${diffDays}天后`;
    return `逾期${Math.abs(diffDays)}天`;
  };

  return (
    <section className="panel retest-task-panel">
      <div className="section-heading">
        <div>
          <p>复测闭环</p>
          <h2>
            复测任务管理
            {pendingCount > 0 && (
              <span className="alert-badge retest-pending-badge">{pendingCount}</span>
            )}
          </h2>
        </div>
        {onJumpToRecord && (
          <button className="secondary-action" onClick={onJumpToRecord}>
            📝 前往录入水质
          </button>
        )}
      </div>

      <div className="chips muted retest-filter-chips">
        {RETEST_FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            className={filter === f ? "chip-active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
            <span className="chip-count">{getFilterCount(f)}</span>
          </button>
        ))}
      </div>

      {filteredTasks.length === 0 ? (
        <div className="empty-state empty-state-compact">
          <div className="empty-icon">🔄</div>
          <h3>暂无复测任务</h3>
          <p>
            处理异常时选择「复测」「换水」或「停喂」后，系统会自动生成复测任务。
          </p>
        </div>
      ) : (
        <div className="retest-task-grid">
          {filteredTasks.map((task) => {
            const isRecovered = task.retestResult === "recovered";
            const isNotRecovered = task.retestResult === "not_recovered";
            return (
              <article
                key={task.id}
                className={`retest-task-card retest-task-${task.status}`}
              >
                <header className="retest-task-header">
                  <div>
                    <span className={`retest-task-status ${STATUS_COLORS[task.status]}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                    <h3>{task.tankName}</h3>
                  </div>
                  <div className="retest-task-due">
                    <span className="retest-due-label">复测日期</span>
                    <span className="retest-due-value">{task.dueDate}</span>
                    {(task.status === "pending" || task.status === "overdue") && (
                      <span className={`retest-due-days ${task.status === "overdue" ? "overdue" : ""}`}>
                        {getDaysUntilDue(task.dueDate)}
                      </span>
                    )}
                  </div>
                </header>

                <dl className="retest-task-info-list">
                  <div>
                    <dt>复测指标</dt>
                    <dd>
                      <strong>{task.sourceAlertMetricLabel}</strong>
                    </dd>
                  </div>
                  <div>
                    <dt>原始值</dt>
                    <dd className="retest-original-value">
                      {task.originalValue}{task.originalUnit}
                    </dd>
                  </div>
                  <div>
                    <dt>安全阈值</dt>
                    <dd>{task.thresholdRange}</dd>
                  </div>
                  <div>
                    <dt>触发措施</dt>
                    <dd>
                      <span className="retest-treatment-tag">{task.triggerTreatment}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>缸型</dt>
                    <dd>{task.tankType}</dd>
                  </div>
                  {task.handler && (
                    <div>
                      <dt>处理人</dt>
                      <dd>{task.handler}</dd>
                    </div>
                  )}
                </dl>

                {task.treatmentNote && (
                  <p className="retest-task-note">📝 处理备注：{task.treatmentNote}</p>
                )}

                {task.status === "completed" && (
                  <div className="retest-task-result">
                    <div className="retest-result-divider" />
                    <dl className="retest-task-info-list">
                      {task.retestValue && (
                        <div>
                          <dt>复测值</dt>
                          <dd className={isRecovered ? "retest-value-recovered" : isNotRecovered ? "retest-value-not-recovered" : ""}>
                            <strong>{task.retestValue}{task.originalUnit}</strong>
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>复测结论</dt>
                        <dd>
                          {isRecovered && (
                            <span className="retest-result-recovered">✓ 已恢复正常，异常闭环</span>
                          )}
                          {isNotRecovered && (
                            <span className="retest-result-not-recovered">⚠ 仍未恢复，持续保留风险</span>
                          )}
                        </dd>
                      </div>
                      {task.completedAt && (
                        <div>
                          <dt>完成时间</dt>
                          <dd>{task.completedAt}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}

                {(task.status === "pending" || task.status === "overdue") && (
                  <div className="retest-task-actions">
                    {onJumpToRecord && (
                      <button
                        className="primary-action"
                        onClick={onJumpToRecord}
                      >
                        📋 录入水质完成复测
                      </button>
                    )}
                    <p className="retest-task-hint">
                      录入该鱼缸水质后，系统将自动判断是否恢复并更新此任务。
                    </p>
                  </div>
                )}

                <footer className="retest-task-footer">
                  <span>创建时间：{task.createdAt}</span>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
