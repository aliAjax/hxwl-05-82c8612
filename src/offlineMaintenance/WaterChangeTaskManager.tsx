import { useState } from "react";
import {
  offlineSyncStore,
  syncEngine,
  createSyncMeta,
  type MaintenanceTask,
  type OfflineWaterChangePlan,
} from "../offlineSync";
import { SyncBadge } from "./SyncBadge";

interface WaterChangeTaskManagerProps {
  onTaskCreated?: (task: MaintenanceTask) => void;
}

export function WaterChangeTaskManager({ onTaskCreated }: WaterChangeTaskManagerProps) {
  const [tasks, setTasks] = useState<MaintenanceTask[]>(() =>
    offlineSyncStore.getTasks()
  );
  const [plans, setPlans] = useState<OfflineWaterChangePlan[]>(() =>
    offlineSyncStore.getWaterPlans()
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("全部");

  const [formData, setFormData] = useState({
    tankName: "",
    waterRatio: "30",
    note: "",
    addDechlorinator: true,
    checkTemperature: true,
    checkPH: true,
  });

  const refreshData = () => {
    setTasks(offlineSyncStore.getTasks());
    setPlans(offlineSyncStore.getWaterPlans());
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tankName.trim()) {
      alert("请填写鱼缸名称");
      return;
    }

    const isOnline = offlineSyncStore.isNetworkOnline();
    const task = offlineSyncStore.saveTask({
      type: "waterChange",
      title: `${formData.tankName} 换水 ${formData.waterRatio}%`,
      description: formData.note || `换水${formData.waterRatio}%`,
      tankName: formData.tankName.trim(),
      status: "pending",
      priority: "medium",
      syncMeta: isOnline
        ? { ...createSyncMeta("pending"), pendingOperation: "create" }
        : { ...createSyncMeta("draft"), pendingOperation: "create" },
    });

    if (isOnline) {
      offlineSyncStore.addToQueue("maintenanceTask", task.id, "create", task);
    }

    setFormData({
      tankName: "",
      waterRatio: "30",
      note: "",
      addDechlorinator: true,
      checkTemperature: true,
      checkPH: true,
    });
    setShowAddForm(false);
    refreshData();
    onTaskCreated?.(task);
  };

  const handleStartTask = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const updatedSyncMeta = task.syncMeta.syncStatus === "synced"
      ? { ...task.syncMeta, syncStatus: "pending" as const, pendingOperation: "update" as const }
      : task.syncMeta;
    offlineSyncStore.saveTask({
      ...task,
      status: "inProgress",
      syncMeta: updatedSyncMeta,
    });
    if (updatedSyncMeta.syncStatus === "pending") {
      const updatedTask = offlineSyncStore.getTasks().find((t) => t.id === taskId);
      if (updatedTask) {
        offlineSyncStore.addToQueue("maintenanceTask", taskId, "update", updatedTask);
      }
    }
    refreshData();
  };

  const handleCompleteTask = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const completedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const updatedSyncMeta = task.syncMeta.syncStatus === "synced"
      ? { ...task.syncMeta, syncStatus: "pending" as const, pendingOperation: "update" as const }
      : task.syncMeta;

    offlineSyncStore.saveTask({
      ...task,
      status: "completed",
      completedAt,
      syncMeta: updatedSyncMeta,
    });
    if (updatedSyncMeta.syncStatus === "pending") {
      const updatedTask = offlineSyncStore.getTasks().find((t) => t.id === taskId);
      if (updatedTask) {
        offlineSyncStore.addToQueue("maintenanceTask", taskId, "update", updatedTask);
      }
    }
    refreshData();
  };

  const handleDeleteTask = (taskId: string) => {
    if (!window.confirm("确定删除该任务？")) return;
    offlineSyncStore.deleteTask(taskId);
    refreshData();
  };

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter === "全部") return true;
    const map: Record<string, string> = {
      待处理: "pending",
      进行中: "inProgress",
      已完成: "completed",
    };
    return t.status === map[statusFilter];
  });

  const statusFilterOptions = ["全部", "待处理", "进行中", "已完成"];

  const getTaskTypeIcon = (type: MaintenanceTask["type"]) => {
    switch (type) {
      case "waterChange":
        return "💧";
      case "waterTest":
        return "🧪";
      case "alertFollowUp":
        return "⚠️";
    }
  };

  const getTaskTypeLabel = (type: MaintenanceTask["type"]) => {
    switch (type) {
      case "waterChange":
        return "换水任务";
      case "waterTest":
        return "水质检测";
      case "alertFollowUp":
        return "异常跟进";
    }
  };

  const getPriorityLabel = (priority: MaintenanceTask["priority"]) => {
    switch (priority) {
      case "high":
        return { text: "高", color: "var(--danger)" };
      case "medium":
        return { text: "中", color: "var(--warn)" };
      case "low":
        return { text: "低", color: "var(--accent)" };
    }
  };

  const getStatusLabel = (status: MaintenanceTask["status"]) => {
    switch (status) {
      case "pending":
        return "待处理";
      case "inProgress":
        return "进行中";
      case "completed":
        return "已完成";
    }
  };

  return (
    <section className="panel offline-workflow-panel">
      <div className="section-heading">
        <div>
          <p className="offline-section-tag">🔄 离线工作流</p>
          <h2>换水与维护任务</h2>
        </div>
        <button className="primary-action" onClick={() => setShowAddForm(true)}>
          + 新建任务
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreateTask} className="task-create-form">
          <div className="field-grid">
            <label>
              <span>鱼缸名称 *</span>
              <input
                type="text"
                value={formData.tankName}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, tankName: e.target.value }))
                }
                placeholder="例如：草缸A"
              />
            </label>
            <label>
              <span>换水比例（%）</span>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.waterRatio}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, waterRatio: e.target.value }))
                }
                placeholder="例如 30"
              />
            </label>
            <label className="field-full">
              <span>备注</span>
              <input
                type="text"
                value={formData.note}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, note: e.target.value }))
                }
                placeholder="例如：周日上午换水，注意水温"
              />
            </label>
          </div>
          <div className="form-actions-row">
            <button
              type="button"
              className="secondary-action"
              onClick={() => setShowAddForm(false)}
            >
              取消
            </button>
            <button type="submit" className="primary-action">
              📝 创建任务（离线可用）
            </button>
          </div>
        </form>
      )}

      {plans.length > 0 && (
        <div className="plans-section">
          <h3 className="subsection-title">📅 换水计划</h3>
          <div className="mini-plan-list">
            {plans.slice(0, 3).map((plan) => (
              <div key={plan.id} className="mini-plan-item">
                <div className="mini-plan-main">
                  <strong>{plan.tankName}</strong>
                  <span className="mini-plan-meta">
                    每 {plan.cycleDays} 天 · {plan.waterRatio}% · 下次: {plan.nextDate}
                  </span>
                </div>
                <SyncBadge syncMeta={plan.syncMeta} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="record-filter-bar">
        <span className="filter-label">任务状态：</span>
        <div className="chips muted">
          {statusFilterOptions.map((f) => (
            <button
              key={f}
              className={statusFilter === f ? "chip-active" : ""}
              onClick={() => setStatusFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="empty-state empty-state-compact">
          <div className="empty-icon">📋</div>
          <h3>暂无维护任务</h3>
          <p>点击右上角「新建任务」创建换水或维护任务。</p>
        </div>
      ) : (
        <div className="task-grid">
          {filteredTasks.map((task) => {
            const priority = getPriorityLabel(task.priority);
            return (
              <article
                key={task.id}
                className={`task-card task-card-${task.status}`}
              >
                <header className="task-card-header">
                  <div className="task-card-left">
                    <span className="task-type-icon">
                      {getTaskTypeIcon(task.type)}
                    </span>
                    <div>
                      <span className="task-type-tag">
                        {getTaskTypeLabel(task.type)}
                      </span>
                      <h3>{task.title}</h3>
                    </div>
                  </div>
                  <span
                    className="task-priority"
                    style={{ color: priority.color, borderColor: priority.color }}
                  >
                    {priority.text}优先级
                  </span>
                </header>
                <p className="task-description">{task.description}</p>
                <div className="task-meta">
                  <span className="task-tank">🐠 {task.tankName}</span>
                  <span className={`task-status task-status-${task.status}`}>
                    {getStatusLabel(task.status)}
                  </span>
                </div>
                <div className="task-footer">
                  <SyncBadge syncMeta={task.syncMeta} size="sm" />
                  <div className="task-actions">
                    {task.status === "pending" && (
                      <button
                        className="secondary-action"
                        onClick={() => handleStartTask(task.id)}
                      >
                        ▶ 开始
                      </button>
                    )}
                    {task.status === "inProgress" && (
                      <button
                        className="primary-action"
                        onClick={() => handleCompleteTask(task.id)}
                      >
                        ✓ 完成
                      </button>
                    )}
                    <button
                      className="tank-action-btn tank-action-delete"
                      onClick={() => handleDeleteTask(task.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
                {task.completedAt && (
                  <div className="task-completed-info">
                    完成时间: {task.completedAt}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
