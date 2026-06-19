import { useState, useMemo, useEffect } from "react";
import "./styles.css";
import { WaterTrendAnalysis, LiveTrendDataSource } from "./trend";
import { AlertCenter } from "./alertCenter/AlertCenter";
import type { TreatmentAction } from "./alertCenter/types";
import type {
  Customer,
  TankProfile,
  WaterRecord,
  WaterChangePlan,
} from "./db/types";
import {
  TANK_TEMPLATE_TYPES,
  TEMPLATE_METRIC_LABELS,
  TEMPLATE_METRIC_UNITS,
  TEMPLATE_METRIC_STEPS,
  TEMPLATE_METRIC_ORDER,
} from "./db/tankTemplates";
import { Dashboard } from "./dashboard";
import { RuleConfigPanel } from "./ruleConfig";
import { ImportWaterRecordsModal } from "./importCsv";
import type { ImportRecordItem } from "./importCsv";
import type { AlertItem, RetestTask } from "./alertCenter/types";
import {
  WaterTestRecorder,
  WaterChangeTaskManager,
  AlertReminderPanel,
  SyncControlPanel,
  RetestTaskPanel,
  OfflineRetestPanel,
} from "./offlineMaintenance";
import { AuditTimelinePanel } from "./auditLog/AuditTimelinePanel";
import {
  useWaterRecordService,
  useAlertService,
  useWaterChangePlanService,
  useDataManagement,
  useTankProfileService,
} from "./services";

const project = {
  "id": "hxwl-05",
  "port": 5105,
  "title": "水族箱水质监测",
  "subtitle": "多鱼缸水质趋势、换水和异常指标提醒",
  "stack": "React + Vite + TypeScript + CSS",
  "theme": [
    "#0891b2",
    "#16a34a",
    "#f59e0b"
  ],
  "domain": "水族养护",
  "users": [
    "水族店员",
    "玩家",
    "维护师"
  ],
  "metrics": [
    "pH",
    "氨氮",
    "硝酸盐",
    "换水周期"
  ],
  "filters": [
    "草缸",
    "海缸",
    "三湖缸",
    "繁殖缸"
  ],
  "fields": [
    "pH",
    "氨氮",
    "亚硝酸盐",
    "硝酸盐",
    "硬度",
    "温度",
    "换水量"
  ],
  "records": [
    [
      "草缸A",
      "pH 6.8",
      "稳定",
      "硝酸盐18ppm，计划周末换水30%"
    ],
    [
      "海缸B",
      "pH 8.1",
      "关注",
      "钙硬度偏低，需复测"
    ],
    [
      "繁殖缸C",
      "pH 7.2",
      "异常",
      "亚硝酸盐升高，停止投喂"
    ]
  ]
};

export type {
  WaterRecord,
  TankProfile,
  WaterChangePlan,
};

const statusColors = ["status-ok", "status-watch", "status-danger"];

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function App() {
  const values = project.metrics.map((metric: string, index: number) => {
    const base = [84, 12, 31, 7][index % 4];
    return String(base + index * 3);
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tanks, setTanks] = useState<TankProfile[]>([]);
  const [waterRecords, setWaterRecords] = useState<WaterRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [retestTasks, setRetestTasks] = useState<RetestTask[]>([]);
  const [waterChangePlans, setWaterChangePlans] = useState<WaterChangePlan[]>([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [targetAlertId, setTargetAlertId] = useState<string | null>(null);
  const [targetPlanId, setTargetPlanId] = useState<string | null>(null);

  const trendDataSource = useMemo(
    () => new LiveTrendDataSource(tanks, waterRecords, 30),
    [tanks, waterRecords]
  );

  const dataManagement = useDataManagement({
    setCustomers,
    setTanks,
    setWaterRecords,
    setWaterChangePlans,
    setAlerts,
    setRetestTasks,
  });

  const tankProfileService = useTankProfileService({
    tanks,
    setTanks,
  });

  const waterRecordService = useWaterRecordService({
    tanks,
    waterRecords,
    alerts,
    retestTasks,
    setWaterRecords,
    setAlerts,
    setRetestTasks,
  });

  const alertService = useAlertService({
    alerts,
    retestTasks,
    setAlerts,
    setRetestTasks,
  });

  const waterChangePlanService = useWaterChangePlanService({
    tanks,
    waterChangePlans,
    setWaterChangePlans,
  });

  const handleImportRecords = async (items: ImportRecordItem[]) => {
    await waterRecordService.importWaterRecords(items);
  };

  useEffect(() => {
    if (targetPlanId) {
      const plan = waterChangePlans.find((p) => p.id === targetPlanId);
      if (plan) {
        waterChangePlanService.formActions.openEditPlanModal(plan);
      }
      const el = document.querySelector(".water-change-plans");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTargetPlanId(null);
    }
  }, [targetPlanId, waterChangePlans, waterChangePlanService]);

  const handleJumpToAlert = (alertId: string) => {
    setTargetAlertId(alertId);
    const el = document.querySelector(".alert-center");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleJumpToWaterChangePlan = (planId: string) => {
    setTargetPlanId(planId);
  };

  const handleJumpToAllAlerts = () => {
    const el = document.querySelector(".alert-center");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleJumpToAllPlans = () => {
    const el = document.querySelector(".water-change-plans");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleJumpToWaterRecordForm = () => {
    const el = document.querySelector(".workspace");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleJumpToAllRetestTasks = () => {
    const el = document.querySelector(".retest-task-panel");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleProcessAlert = (
    alertId: string,
    treatment: TreatmentAction,
    treatmentNote: string,
    handler: string
  ) => {
    alertService.processAlert(alertId, treatment, treatmentNote, handler);
  };

  const handleWaterRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    waterRecordService.submitWaterRecord();
  };

  const displayRecords = useMemo(() => {
    return [...waterRecords];
  }, [waterRecords]);

  if (dataManagement.state.isLoading) {
    return (
      <main className="app-shell">
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>正在加载数据...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
        </div>
      </section>

      <section className="metrics-grid">
        {project.metrics.map((metric: string, index: number) => (
          <MetricCard key={metric} label={metric} value={values[index]} index={index} />
        ))}
      </section>

      <section className="data-management-bar">
        <div className="data-info">
          <span>数据已本地持久化存储 · IndexedDB</span>
        </div>
        <div className="data-actions">
          <button className="secondary-action" onClick={() => dataManagement.actions.setClearConfirmOpen(true)}>
            🗑️ 数据管理
          </button>
          <RuleConfigPanel onRuleChange={dataManagement.actions.handleRuleChange} />
        </div>
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((user: string) => (
              <span key={user}>{user}</span>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips muted">
            {project.filters.map((filter: string) => (
              <button key={filter}>{filter}</button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <form onSubmit={handleWaterRecordSubmit}>
            <div className="section-heading">
              <div>
                <p>{project.domain}</p>
                <h2>水质记录录入</h2>
              </div>
              <button type="submit" className="primary-action">
                提交记录
              </button>
            </div>
            <div className="field-grid">
              <label>
                <span>鱼缸</span>
                <select
                  value={waterRecordService.formState.selectedTankForRecord}
                  onChange={(e) => waterRecordService.formActions.setSelectedTankForRecord(e.target.value)}
                >
                  <option value="">— 选择已有鱼缸 —</option>
                  {tanks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>或自定义鱼缸名称</span>
                <input
                  type="text"
                  value={waterRecordService.formState.customTankName}
                  onChange={(e) => waterRecordService.formActions.setCustomTankName(e.target.value)}
                  placeholder="例如：草缸A"
                />
              </label>
              <label>
                <span>pH</span>
                <input
                  type="number"
                  step="0.1"
                  value={waterRecordService.formState.waterFormData.ph}
                  onChange={(e) => waterRecordService.formActions.updateWaterForm("ph", e.target.value)}
                  placeholder="例如 6.8"
                />
              </label>
              <label>
                <span>氨氮 (ppm)</span>
                <input
                  type="number"
                  step="0.01"
                  value={waterRecordService.formState.waterFormData.ammonia}
                  onChange={(e) => waterRecordService.formActions.updateWaterForm("ammonia", e.target.value)}
                  placeholder="例如 0"
                />
              </label>
              <label>
                <span>亚硝酸盐 (ppm)</span>
                <input
                  type="number"
                  step="0.01"
                  value={waterRecordService.formState.waterFormData.nitrite}
                  onChange={(e) => waterRecordService.formActions.updateWaterForm("nitrite", e.target.value)}
                  placeholder="例如 0"
                />
              </label>
              <label>
                <span>硝酸盐 (ppm)</span>
                <input
                  type="number"
                  step="1"
                  value={waterRecordService.formState.waterFormData.nitrate}
                  onChange={(e) => waterRecordService.formActions.updateWaterForm("nitrate", e.target.value)}
                  placeholder="例如 20"
                />
              </label>
              <label>
                <span>硬度 (dGH)</span>
                <input
                  type="number"
                  step="1"
                  value={waterRecordService.formState.waterFormData.hardness}
                  onChange={(e) => waterRecordService.formActions.updateWaterForm("hardness", e.target.value)}
                  placeholder="例如 8"
                />
              </label>
              <label>
                <span>温度 (°C)</span>
                <input
                  type="number"
                  step="0.5"
                  value={waterRecordService.formState.waterFormData.temperature}
                  onChange={(e) => waterRecordService.formActions.updateWaterForm("temperature", e.target.value)}
                  placeholder="例如 26"
                />
              </label>
              <label className="field-full">
                <span>换水量</span>
                <input
                  type="text"
                  value={waterRecordService.formState.waterFormData.waterChange}
                  onChange={(e) => waterRecordService.formActions.updateWaterForm("waterChange", e.target.value)}
                  placeholder="例如 30%"
                />
              </label>
            </div>
          </form>
        </section>
      </section>

      <section className="records panel">
        <div className="section-heading">
          <div>
            <p>水质历史</p>
            <h2>近期记录</h2>
          </div>
          <div className="records-actions">
            <button className="secondary-action" onClick={() => setImportModalOpen(true)}>
              📋 导入CSV
            </button>
            <button disabled={displayRecords.length === 0}>导出摘要</button>
          </div>
        </div>
        {displayRecords.length === 0 ? (
          <div className="empty-state empty-state-compact">
            <div className="empty-icon">💧</div>
            <h3>暂无水质记录</h3>
            <p>在上方「水质记录录入」表单中填写数据并提交，记录将出现在这里。</p>
          </div>
        ) : (
          <div className="record-list">
            {displayRecords.map((record, index) => {
              const recordTank = record.tankId
                ? tanks.find((t) => t.id === record.tankId)
                : undefined;
              return (
                <article key={record.id} className="record-card">
                  <div className={`record-index ${waterRecordService.getStatusClass(record.status)}`}>
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="record-main">
                    <header className="record-header">
                      <h3>{record.tankName}</h3>
                      <span className={`record-status record-status-${record.status}`}>
                        {record.status}
                      </span>
                    </header>
                    <p className="record-metrics">
                      {waterRecordService.buildMetricSummary(record.metrics, recordTank) || "未填写指标"}
                    </p>
                    <p className="record-note">{record.note}</p>
                    <p className="record-time">{record.recordedAt}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <AlertCenter
        alerts={alerts}
        retestTasks={retestTasks}
        onProcessAlert={handleProcessAlert}
        pendingCount={alertService.pendingAlertCount}
        targetAlertId={targetAlertId}
        onTargetAlertHandled={() => setTargetAlertId(null)}
      />

      <RetestTaskPanel
        retestTasks={retestTasks}
        onJumpToRecord={handleJumpToWaterRecordForm}
      />

      <WaterTrendAnalysis dataSource={trendDataSource} />

      <Dashboard
        customers={customers}
        tanks={tanks}
        waterRecords={waterRecords}
        waterChangePlans={waterChangePlans}
        alerts={alerts}
        retestTasks={retestTasks}
        tankTypes={tankProfileService.tankTypes}
        onJumpToAlert={handleJumpToAlert}
        onJumpToWaterChangePlan={handleJumpToWaterChangePlan}
        onJumpToAllAlerts={handleJumpToAllAlerts}
        onJumpToAllPlans={handleJumpToAllPlans}
        onJumpToAllRetestTasks={handleJumpToAllRetestTasks}
      />

      <AuditTimelinePanel tanks={tanks} />

      <section className="tank-profiles panel">
        <div className="section-heading">
          <div>
            <p>档案管理</p>
            <h2>鱼缸档案</h2>
          </div>
          <button className="primary-action" onClick={tankProfileService.formActions.openAddModal}>
            + 新增档案
          </button>
        </div>

        <div className="chips muted tank-filter-chips">
          {tankProfileService.filterOptions.map((filter) => (
            <button
              key={filter}
              className={tankProfileService.formState.activeFilter === filter ? "chip-active" : ""}
              onClick={() => tankProfileService.formActions.setActiveFilter(filter)}
            >
              {filter}
              {filter !== "全部" && (
                <span className="chip-count">
                  {tanks.filter((t) => t.tankType === filter).length}
                </span>
              )}
              {filter === "全部" && (
                <span className="chip-count">{tanks.length}</span>
              )}
            </button>
          ))}
        </div>

        {tankProfileService.filteredTanks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🐠</div>
            <h3>暂无鱼缸档案</h3>
            <p>
              {tanks.length === 0
                ? "点击右上角「新增档案」，开始记录您的第一个鱼缸信息。"
                : `当前「${tankProfileService.formState.activeFilter}」分类下暂无档案，试试切换其他筛选分类。`}
            </p>
            {tanks.length === 0 && (
              <button className="primary-action" onClick={tankProfileService.formActions.openAddModal}>
                + 新增档案
              </button>
            )}
          </div>
        ) : (
          <div className="tank-grid">
            {tankProfileService.filteredTanks.map((tank) => (
              <article key={tank.id} className="tank-card">
                <header className="tank-card-header">
                  <div>
                    <span className={`tank-type-tag tank-type-${tank.tankType}`}>
                      {tank.tankType}
                    </span>
                    <h3>{tank.name}</h3>
                  </div>
                  <div className="tank-actions">
                    <button className="tank-action-btn" onClick={() => tankProfileService.formActions.openEditModal(tank)}>
                      编辑
                    </button>
                    <button
                      className="tank-action-btn tank-action-delete"
                      onClick={() => tankProfileService.formActions.handleDelete(tank.id)}
                    >
                      删除
                    </button>
                  </div>
                </header>
                <dl className="tank-info-list">
                  <div>
                    <dt>容量</dt>
                    <dd>{tank.capacity || "—"}</dd>
                  </div>
                  <div>
                    <dt>开缸日期</dt>
                    <dd>{tank.setupDate || "—"}</dd>
                  </div>
                  <div>
                    <dt>主要生物</dt>
                    <dd>{tank.mainCreatures || "—"}</dd>
                  </div>
                  <div>
                    <dt>维护负责人</dt>
                    <dd>{tank.maintainer || "—"}</dd>
                  </div>
                </dl>
                <div className="tank-thresholds-section">
                  <p className="tank-thresholds-label">适养参数范围</p>
                  <p className="tank-thresholds-values">
                    {tankProfileService.buildTankThresholdsSummary(tank)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="water-change-plans panel">
        <div className="section-heading">
          <div>
            <p>维护管理</p>
            <h2>换水计划</h2>
          </div>
          <button className="primary-action" onClick={waterChangePlanService.formActions.openAddPlanModal}>
            + 新增计划
          </button>
        </div>

        <div className="chips muted plan-filter-chips">
          {waterChangePlanService.planFilterOptions.map((filter) => {
            let count = 0;
            if (filter === "全部") {
              count = waterChangePlans.length;
            } else {
              count = waterChangePlans.filter((p) => {
                const status = waterChangePlanService.getPlanStatus(p);
                if (filter === "已逾期") return status === "overdue";
                if (filter === "即将到期") return status === "upcoming";
                if (filter === "正常") return status === "normal";
                if (filter === "已完成") return status === "completed";
                return false;
              }).length;
            }
            return (
              <button
                key={filter}
                className={waterChangePlanService.formState.planFilter === filter ? "chip-active" : ""}
                onClick={() => waterChangePlanService.formActions.setPlanFilter(filter)}
              >
                {filter}
                <span className="chip-count">{count}</span>
              </button>
            );
          })}
        </div>

        {waterChangePlanService.filteredPlans.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>暂无换水计划</h3>
            <p>
              {waterChangePlans.length === 0
                ? "点击右上角「新增计划」，为您的鱼缸设置定期换水提醒。"
                : `当前「${waterChangePlanService.formState.planFilter}」分类下暂无计划，试试切换其他筛选分类。`}
            </p>
            {waterChangePlans.length === 0 && (
              <button className="primary-action" onClick={waterChangePlanService.formActions.openAddPlanModal}>
                + 新增计划
              </button>
            )}
          </div>
        ) : (
          <div className="plan-grid">
            {waterChangePlanService.filteredPlans.map((plan) => {
              const status = waterChangePlanService.getPlanStatus(plan);
              const statusText = waterChangePlanService.getPlanStatusText(status);
              const daysText = waterChangePlanService.getPlanDaysText(plan);
              return (
                <article key={plan.id} className={`plan-card plan-card-${status}`}>
                  <header className="plan-card-header">
                    <div>
                      <span className={`plan-status plan-status-${status}`}>
                        {statusText}
                      </span>
                      <h3>{plan.tankName}</h3>
                    </div>
                    <div className="plan-actions">
                      {status !== "completed" && (
                        <>
                          <button
                            className="plan-action-btn"
                            onClick={() => waterChangePlanService.formActions.openEditPlanModal(plan)}
                          >
                            编辑
                          </button>
                          <button
                            className="plan-action-btn plan-action-complete"
                            onClick={() => waterChangePlanService.formActions.handleCompletePlan(plan.id)}
                          >
                            ✓ 完成换水
                          </button>
                        </>
                      )}
                      <button
                        className="plan-action-btn plan-action-delete"
                        onClick={() => waterChangePlanService.formActions.handleDeletePlan(plan.id)}
                      >
                        删除
                      </button>
                    </div>
                  </header>
                  <dl className="plan-info-list">
                    <div>
                      <dt>换水周期</dt>
                      <dd>每 {plan.cycleDays} 天</dd>
                    </div>
                    <div>
                      <dt>换水比例</dt>
                      <dd>{plan.waterRatio}%</dd>
                    </div>
                    <div>
                      <dt>下次维护</dt>
                      <dd className={`plan-date plan-date-${status}`}>
                        {plan.nextDate}
                        <span className="plan-days">{daysText}</span>
                      </dd>
                    </div>
                    {plan.note && (
                      <div className="plan-note-full">
                        <dt>备注</dt>
                        <dd>{plan.note}</dd>
                      </div>
                    )}
                  </dl>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {dataManagement.state.clearConfirmOpen && (
        <div className="modal-overlay" onClick={() => dataManagement.actions.setClearConfirmOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>数据管理</h2>
              <button className="modal-close" onClick={() => dataManagement.actions.setClearConfirmOpen(false)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              <p className="modal-warning">
                ⚠️ 请谨慎操作，以下操作将影响您的本地数据。
              </p>
              <div className="data-management-actions">
                <div className="data-action-card">
                  <h3>重置为演示数据</h3>
                  <p>清空当前数据并重新加载初始演示数据，日期将更新为当前时间。</p>
                  <button className="secondary-action" onClick={dataManagement.actions.handleReloadSeedData}>
                    重置演示数据
                  </button>
                </div>
                <div className="data-action-card">
                  <h3>清空所有数据</h3>
                  <p>永久删除所有本地数据，刷新页面后仍保持为空。</p>
                  <button className="danger-action" onClick={dataManagement.actions.handleClearAllData}>
                    清空所有数据
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {waterChangePlanService.formState.planModalOpen && (
        <div className="modal-overlay" onClick={waterChangePlanService.formActions.closePlanModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>{waterChangePlanService.formState.editingPlanId ? "编辑换水计划" : "新增换水计划"}</h2>
              <button className="modal-close" onClick={waterChangePlanService.formActions.closePlanModal}>
                ×
              </button>
            </header>
            <form onSubmit={waterChangePlanService.formActions.handlePlanSubmit} className="modal-form">
              <div className="form-grid">
                {!waterChangePlanService.formState.editingPlanId && (
                  <>
                    <label>
                      <span>鱼缸</span>
                      <select
                        value={waterChangePlanService.formState.planFormData.tankId || ""}
                        onChange={(e) => waterChangePlanService.formActions.updatePlanForm("tankId", e.target.value)}
                      >
                        <option value="">— 选择已有鱼缸 —</option>
                        {tanks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>或自定义鱼缸名称</span>
                      <input
                        type="text"
                        value={waterChangePlanService.formState.planFormData.tankName}
                        onChange={(e) => waterChangePlanService.formActions.updatePlanForm("tankName", e.target.value)}
                        placeholder="例如：草缸A"
                      />
                    </label>
                  </>
                )}
                {waterChangePlanService.formState.editingPlanId && (
                  <label className="form-full">
                    <span>鱼缸</span>
                    <input
                      type="text"
                      value={waterChangePlanService.formState.planFormData.tankName || (waterChangePlanService.formState.planFormData.tankId && tanks.find((t) => t.id === waterChangePlanService.formState.planFormData.tankId)?.name) || ""}
                      disabled
                    />
                  </label>
                )}
                <label>
                  <span>换水周期（天）</span>
                  <input
                    type="number"
                    min="1"
                    value={waterChangePlanService.formState.planFormData.cycleDays}
                    onChange={(e) => waterChangePlanService.formActions.updatePlanForm("cycleDays", e.target.value)}
                    placeholder="例如 7"
                  />
                </label>
                <label>
                  <span>计划换水比例（%）</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={waterChangePlanService.formState.planFormData.waterRatio}
                    onChange={(e) => waterChangePlanService.formActions.updatePlanForm("waterRatio", e.target.value)}
                    placeholder="例如 30"
                  />
                </label>
                <label className="form-full">
                  <span>下次维护日期 *</span>
                  <input
                    type="date"
                    value={waterChangePlanService.formState.planFormData.nextDate}
                    onChange={(e) => waterChangePlanService.formActions.updatePlanForm("nextDate", e.target.value)}
                  />
                </label>
                <label className="form-full">
                  <span>备注</span>
                  <input
                    type="text"
                    value={waterChangePlanService.formState.planFormData.note}
                    onChange={(e) => waterChangePlanService.formActions.updatePlanForm("note", e.target.value)}
                    placeholder="例如：周日上午换水，注意水温"
                  />
                </label>
              </div>
              <footer className="modal-footer">
                <button type="button" onClick={waterChangePlanService.formActions.closePlanModal}>
                  取消
                </button>
                <button type="submit" className="primary-action">
                  {waterChangePlanService.formState.editingPlanId ? "保存修改" : "确认新增"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {tankProfileService.formState.modalOpen && (
        <div className="modal-overlay" onClick={tankProfileService.formActions.closeModal}>
          <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>{tankProfileService.formState.editingId ? "编辑鱼缸档案" : "新增鱼缸档案"}</h2>
              <button className="modal-close" onClick={tankProfileService.formActions.closeModal}>
                ×
              </button>
            </header>
            <form onSubmit={tankProfileService.formActions.handleSubmit} className="modal-form">
              <div className="form-grid">
                <label>
                  <span>鱼缸名称 *</span>
                  <input
                    type="text"
                    value={tankProfileService.formState.formData.name}
                    onChange={(e) => tankProfileService.formActions.updateForm("name", e.target.value)}
                    placeholder="例如：草缸A"
                    required
                  />
                </label>
                <label>
                  <span>缸型</span>
                  <select
                    value={tankProfileService.formState.formData.tankType}
                    onChange={(e) => tankProfileService.formActions.updateForm("tankType", e.target.value)}
                  >
                    {tankProfileService.tankTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>容量</span>
                  <input
                    type="text"
                    value={tankProfileService.formState.formData.capacity}
                    onChange={(e) => tankProfileService.formActions.updateForm("capacity", e.target.value)}
                    placeholder="例如：60L 或 120×50×50cm"
                  />
                </label>
                <label>
                  <span>开缸日期</span>
                  <input
                    type="date"
                    value={tankProfileService.formState.formData.setupDate}
                    onChange={(e) => tankProfileService.formActions.updateForm("setupDate", e.target.value)}
                  />
                </label>
                <label className="form-full">
                  <span>主要生物</span>
                  <input
                    type="text"
                    value={tankProfileService.formState.formData.mainCreatures}
                    onChange={(e) => tankProfileService.formActions.updateForm("mainCreatures", e.target.value)}
                    placeholder="例如：红绿灯、宝莲灯、迷你矮珍珠"
                  />
                </label>
                <label className="form-full">
                  <span>维护负责人</span>
                  <input
                    type="text"
                    value={tankProfileService.formState.formData.maintainer}
                    onChange={(e) => tankProfileService.formActions.updateForm("maintainer", e.target.value)}
                    placeholder="例如：张师傅"
                  />
                </label>
              </div>

              <div className="thresholds-section">
                <div className="thresholds-header">
                  <div>
                    <h3>适养参数模板</h3>
                    <p className="thresholds-hint">
                      选择缸型后自动加载默认参数，可手动微调安全范围与关注范围。
                    </p>
                  </div>
                  <div className="template-apply-group">
                    <span className="template-apply-label">套用模板：</span>
                    {TANK_TEMPLATE_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`template-apply-btn ${tankProfileService.formState.formData.tankType === t ? "template-apply-active" : ""}`}
                        onClick={() => tankProfileService.formActions.applyTemplateThresholds(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="thresholds-grid">
                  {TEMPLATE_METRIC_ORDER.map((metric) => {
                    const label = TEMPLATE_METRIC_LABELS[metric];
                    const unit = TEMPLATE_METRIC_UNITS[metric];
                    const step = TEMPLATE_METRIC_STEPS[metric];
                    const current = tankProfileService.formState.formData.customThresholds?.[metric];
                    const okMin = current?.ok[0] ?? 0;
                    const okMax = current?.ok[1] ?? 0;
                    const watchMin = current?.watch[0] ?? 0;
                    const watchMax = current?.watch[1] ?? 0;
                    return (
                      <div key={metric} className="threshold-card">
                        <header className="threshold-card-header">
                          <span className="threshold-card-label">{label}</span>
                          {unit && <span className="threshold-card-unit">{unit}</span>}
                        </header>
                        <div className="threshold-card-body">
                          <div className="threshold-row">
                            <span className="threshold-range-label">安全范围</span>
                            <div className="threshold-range-inputs">
                              <input
                                type="number"
                                step={step}
                                value={okMin}
                                onChange={(e) => tankProfileService.formActions.updateThreshold(metric, "ok", 0, e.target.value)}
                              />
                              <span className="threshold-range-sep">~</span>
                              <input
                                type="number"
                                step={step}
                                value={okMax}
                                onChange={(e) => tankProfileService.formActions.updateThreshold(metric, "ok", 1, e.target.value)}
                              />
                              {unit && <span className="threshold-input-unit">{unit}</span>}
                            </div>
                          </div>
                          <div className="threshold-row">
                            <span className="threshold-range-label threshold-range-watch">关注范围</span>
                            <div className="threshold-range-inputs">
                              <input
                                type="number"
                                step={step}
                                value={watchMin}
                                onChange={(e) => tankProfileService.formActions.updateThreshold(metric, "watch", 0, e.target.value)}
                              />
                              <span className="threshold-range-sep">~</span>
                              <input
                                type="number"
                                step={step}
                                value={watchMax}
                                onChange={(e) => tankProfileService.formActions.updateThreshold(metric, "watch", 1, e.target.value)}
                              />
                              {unit && <span className="threshold-input-unit">{unit}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <footer className="modal-footer">
                <button type="button" onClick={tankProfileService.formActions.closeModal}>
                  取消
                </button>
                <button type="submit" className="primary-action">
                  {tankProfileService.formState.editingId ? "保存修改" : "确认新增"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      <section className="offline-maintenance-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">📱 离线优先</p>
            <h2>水族维护工作流（离线可用）</h2>
            <p className="subtitle">
              店员可在无网络场景下记录水质检测、生成异常提醒、完成换水任务，
              恢复网络后点击「同步控制面板」一键同步。所有数据状态完整展示。
            </p>
          </div>
        </div>

        <SyncControlPanel />

        <div className="offline-workflow-grid">
          <WaterTestRecorder />
          <WaterChangeTaskManager />
        </div>

        <AlertReminderPanel />

        <OfflineRetestPanel />
      </section>

      <ImportWaterRecordsModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        tanks={tanks}
        onImport={handleImportRecords}
      />
    </main>
  );
}

export default App;
