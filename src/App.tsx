import { useState, useMemo, useEffect } from "react";
import "./styles.css";
import { WaterTrendAnalysis, LiveTrendDataSource } from "./trend";
import { AlertCenter, generateAlertsFromRecord } from "./alertCenter/AlertCenter";
import { TreatmentAction, AlertMetricValues, RetestTask } from "./alertCenter/types";
import { dataService } from "./db";
import type {
  Customer,
  RecordStatus,
  WaterMetrics,
  WaterRecord,
  TankProfile,
  PlanStatus,
  WaterChangePlan,
  ThresholdMetric,
} from "./db/types";
import {
  TANK_TEMPLATE_TYPES,
  TEMPLATE_METRIC_LABELS,
  TEMPLATE_METRIC_UNITS,
  TEMPLATE_METRIC_STEPS,
  TEMPLATE_METRIC_ORDER,
  cloneTemplateThresholds,
  getAllEffectiveThresholds,
} from "./db/tankTemplates";
import { Dashboard } from "./dashboard";
import {
  evaluateMetricValue,
  evaluateRecordStatus,
  getMetricRule,
  RuleConfigPanel,
  RULE_METRICS,
} from "./ruleConfig";
import type { RuleConfig, RuleMetric } from "./ruleConfig";
import { ImportWaterRecordsModal } from "./importCsv";
import type { ImportRecordItem } from "./importCsv";
import type { AlertItem } from "./alertCenter/types";
import {
  WaterTestRecorder,
  WaterChangeTaskManager,
  AlertReminderPanel,
  SyncControlPanel,
  RetestTaskPanel,
  OfflineRetestPanel,
} from "./offlineMaintenance";
import { createSyncMeta, offlineSyncStore } from "./offlineSync";
import { auditLogger } from "./auditLog";
import { AuditTimelinePanel } from "./auditLog/AuditTimelinePanel";

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
  RecordStatus,
  WaterMetrics,
  WaterRecord,
  TankProfile,
  PlanStatus,
  WaterChangePlan,
};

const statusColors = ["status-ok", "status-watch", "status-danger"];

const TANK_TYPES = ["草缸", "海缸", "三湖缸", "繁殖缸"];

const emptyWaterMetrics: WaterMetrics = {
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  hardness: "",
  temperature: "",
  waterChange: "",
};

const emptyForm: Omit<TankProfile, "id"> = {
  name: "",
  tankType: "草缸",
  capacity: "",
  setupDate: "",
  mainCreatures: "",
  maintainer: "",
  customThresholds: cloneTemplateThresholds("草缸"),
};

const emptyPlanForm: Omit<WaterChangePlan, "id" | "createdAt"> = {
  tankName: "",
  tankId: "",
  cycleDays: "7",
  waterRatio: "30",
  nextDate: "",
  note: "",
};

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function getPlanStatus(plan: WaterChangePlan): PlanStatus {
  if (plan.completedAt) return "completed";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextDate = new Date(plan.nextDate);
  nextDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "upcoming";
  return "normal";
}

function getPlanStatusText(status: PlanStatus): string {
  switch (status) {
    case "normal": return "正常";
    case "upcoming": return "即将到期";
    case "overdue": return "已逾期";
    case "completed": return "已完成";
  }
}

function getPlanDaysText(plan: WaterChangePlan): string {
  if (plan.completedAt) return "已完成";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextDate = new Date(plan.nextDate);
  nextDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "明天";
  if (diffDays > 0) return `${diffDays}天后`;
  return `逾期${Math.abs(diffDays)}天`;
}

const getOfflinePlanMirrorId = (planId: string) => `main-water-plan-${planId}`;

const mirrorWaterChangePlanToOffline = (plan: WaterChangePlan) => {
  const existing = offlineSyncStore
    .getWaterPlans()
    .find((p) => p.id === getOfflinePlanMirrorId(plan.id));

  offlineSyncStore.saveWaterPlan({
    ...existing,
    id: getOfflinePlanMirrorId(plan.id),
    tankName: plan.tankName,
    tankId: plan.tankId,
    cycleDays: plan.cycleDays,
    waterRatio: plan.waterRatio,
    nextDate: plan.nextDate,
    note: plan.note,
    completedAt: plan.completedAt,
    createdAt: plan.createdAt,
    syncMeta: existing?.syncMeta || createSyncMeta("synced"),
  });
};

const removeOfflinePlanMirror = (planId: string) => {
  offlineSyncStore.deleteWaterPlan(getOfflinePlanMirrorId(planId));
};

function App() {
  const values = project.metrics.map((metric: string, index: number) => {
    const base = [84, 12, 31, 7][index % 4];
    return String(base + index * 3);
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tanks, setTanks] = useState<TankProfile[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>("全部");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<TankProfile, "id">>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const filterOptions = ["全部", ...TANK_TYPES];

  const filteredTanks = useMemo(() => {
    if (activeFilter === "全部") return tanks;
    return tanks.filter((t) => t.tankType === activeFilter);
  }, [tanks, activeFilter]);

  const [waterFormData, setWaterFormData] = useState<WaterMetrics>(emptyWaterMetrics);
  const [selectedTankForRecord, setSelectedTankForRecord] = useState<string>("");
  const [customTankName, setCustomTankName] = useState<string>("");
  const [waterRecords, setWaterRecords] = useState<WaterRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [retestTasks, setRetestTasks] = useState<RetestTask[]>([]);

  const trendDataSource = useMemo(
    () => new LiveTrendDataSource(tanks, waterRecords, 30),
    [tanks, waterRecords]
  );

  const [waterChangePlans, setWaterChangePlans] = useState<WaterChangePlan[]>([]);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planFormData, setPlanFormData] = useState<Omit<WaterChangePlan, "id" | "createdAt">>(emptyPlanForm);
  const [planFilter, setPlanFilter] = useState<string>("全部");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [targetAlertId, setTargetAlertId] = useState<string | null>(null);
  const [targetPlanId, setTargetPlanId] = useState<string | null>(null);

  const planFilterOptions = ["全部", "已逾期", "即将到期", "正常", "已完成"];

  const handleImportRecords = async (items: ImportRecordItem[]) => {
    const newRecords: WaterRecord[] = [];
    const allSavedAlerts: AlertItem[] = [];

    for (const item of items) {
      const newRecordData: Omit<WaterRecord, "id"> = {
        tankName: item.record.tankName,
        tankId: item.record.tankId,
        recordedAt: item.record.recordedAt,
        metrics: { ...item.record.metrics },
        status: item.record.status,
        note: item.record.note,
      };
      const newRecord = await dataService.addWaterRecord(newRecordData);
      newRecords.push(newRecord);

      if (item.alerts.length > 0) {
        const alertsWithRecordId = item.alerts.map((alert) => ({
          ...alert,
          recordId: newRecord.id,
        }));
        const savedAlerts = await dataService.addAlerts(alertsWithRecordId);
        allSavedAlerts.push(...savedAlerts);
      }
    }

    await auditLogger.logImport("waterRecord", newRecords.length, {
      detail: `CSV导入${newRecords.length}条水质记录，${allSavedAlerts.length}条异常提醒`,
    });

    setWaterRecords((prev) => {
      const combined = [...newRecords, ...prev];
      combined.sort(
        (a, b) =>
          new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
      );
      return combined;
    });
    if (allSavedAlerts.length > 0) {
      setAlerts((prev) => [...allSavedAlerts, ...prev]);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        await dataService.init();
        const data = await dataService.getAllData();
        setCustomers(data.customers);
        setTanks(data.tanks);
        setWaterRecords(data.waterRecords);
        setWaterChangePlans(data.waterChangePlans);
        setAlerts(data.alerts);
        setRetestTasks(data.retestTasks);
      } catch (error) {
        console.error("Failed to load data from IndexedDB:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (targetPlanId) {
      const plan = waterChangePlans.find((p) => p.id === targetPlanId);
      if (plan) {
        openEditPlanModal(plan);
      }
      const el = document.querySelector(".water-change-plans");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setTargetPlanId(null);
    }
  }, [targetPlanId, waterChangePlans]);

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

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ ...emptyForm, customThresholds: cloneTemplateThresholds("草缸") });
    setModalOpen(true);
  };

  const openEditModal = (tank: TankProfile) => {
    setEditingId(tank.id);
    const customThresholds = tank.customThresholds
      ? JSON.parse(JSON.stringify(tank.customThresholds))
      : cloneTemplateThresholds(tank.tankType);
    setFormData({
      name: tank.name,
      tankType: tank.tankType,
      capacity: tank.capacity,
      setupDate: tank.setupDate,
      mainCreatures: tank.mainCreatures,
      maintainer: tank.maintainer,
      customThresholds,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingId) {
      const updatedTank: TankProfile = { ...formData, id: editingId };
      await dataService.updateTank(updatedTank);
      setTanks((prev) =>
        prev.map((t) => (t.id === editingId ? updatedTank : t))
      );
    } else {
      const newTank = await dataService.addTank(formData);
      setTanks((prev) => [...prev, newTank]);
    }
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("确定删除该鱼缸档案吗？")) {
      await dataService.deleteTank(id);
      setTanks((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const updateForm = (key: keyof Omit<TankProfile, "id">, value: string) => {
    setFormData((prev) => {
      if (key === "tankType") {
        return {
          ...prev,
          [key]: value,
          customThresholds: cloneTemplateThresholds(value),
        };
      }
      return { ...prev, [key]: value };
    });
  };

  const updateThreshold = (
    metric: ThresholdMetric,
    rangeKey: "ok" | "watch",
    index: 0 | 1,
    value: string
  ) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    setFormData((prev) => {
      const currentThresholds = prev.customThresholds || cloneTemplateThresholds(prev.tankType);
      const metricRange = currentThresholds[metric] || { ok: [0, 0], watch: [0, 0] };
      const newRange: [number, number] = [...metricRange[rangeKey]] as [number, number];
      newRange[index] = numValue;
      return {
        ...prev,
        customThresholds: {
          ...currentThresholds,
          [metric]: {
            ...metricRange,
            [rangeKey]: newRange,
          },
        },
      };
    });
  };

  const applyTemplateThresholds = (templateType: string) => {
    setFormData((prev) => ({
      ...prev,
      customThresholds: cloneTemplateThresholds(templateType),
    }));
  };

  const updateWaterForm = (key: keyof WaterMetrics, value: string) => {
    setWaterFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleWaterRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedTank = selectedTankForRecord
      ? tanks.find((t) => t.id === selectedTankForRecord)
      : undefined;
    const tankName =
      (selectedTank && selectedTank.name) ||
      customTankName.trim();
    if (!tankName) {
      alert("请选择鱼缸或填写鱼缸名称");
      return;
    }
    const hasAnyMetric = (Object.keys(waterFormData) as (keyof WaterMetrics)[]).some(
      (k) => waterFormData[k].trim() !== ""
    );
    if (!hasAnyMetric) {
      alert("请至少填写一项水质指标");
      return;
    }
    const { status, note } = evaluateRecordStatus(waterFormData, selectedTank);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const recordedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newRecordData: Omit<WaterRecord, "id"> = {
      tankName,
      tankId: selectedTankForRecord || undefined,
      recordedAt,
      metrics: { ...waterFormData },
      status,
      note,
    };
    const newRecord = await dataService.addWaterRecord(newRecordData);
    setWaterRecords((prev) => [newRecord, ...prev]);

    const tankType = selectedTank?.tankType || "草缸";
    const customThresholds = selectedTank?.customThresholds;
    const newAlerts = generateAlertsFromRecord(
      newRecord.id,
      tankName,
      selectedTankForRecord || undefined,
      tankType,
      waterFormData as unknown as AlertMetricValues,
      recordedAt,
      customThresholds
    );
    if (newAlerts.length > 0) {
      const savedAlerts = await dataService.addAlerts(
        newAlerts.map((a) => ({ ...a, id: undefined! } as Omit<AlertItem, "id">))
      );
      setAlerts((prev) => [...savedAlerts, ...prev]);
    }

    const pendingRetestTasks = retestTasks.filter(
      (t) =>
        (t.status === "pending" || t.status === "overdue") &&
        (t.tankId === newRecord.tankId ||
          (t.tankId === undefined && t.tankName === newRecord.tankName))
    );
    for (const task of pendingRetestTasks) {
      const metricKey = task.sourceAlertMetric as keyof WaterMetrics;
      const retestValue = newRecord.metrics[metricKey];
      if (retestValue && retestValue.trim()) {
        const metricEvalResult = evaluateMetricValue(
          selectedTank?.tankType || "草缸",
          metricKey as RuleMetric,
          retestValue,
          selectedTank?.customThresholds
        );
        const metricStatus = metricEvalResult?.recordStatus ?? "稳定";
        const isRecovered = metricStatus === "稳定";
        const { task: updatedTask, alert: updatedAlert } = await dataService.completeRetestTask(
          task.id,
          newRecord.id,
          retestValue,
          isRecovered
        );
        setRetestTasks((prev) =>
          prev.map((t) => (t.id === task.id ? updatedTask : t))
        );
        setAlerts((prev) =>
          prev.map((a) => (a.id === task.sourceAlertId ? updatedAlert : a))
        );
      }
    }

    setWaterFormData(emptyWaterMetrics);
    setSelectedTankForRecord("");
    setCustomTankName("");
  };

  const getStatusClass = (status: RecordStatus) => {
    switch (status) {
      case "稳定":
        return "status-ok";
      case "关注":
        return "status-watch";
      case "异常":
        return "status-danger";
    }
  };

  const buildMetricSummary = (metrics: WaterMetrics, tank?: TankProfile) => {
    const parts: string[] = [];
    RULE_METRICS.forEach((k) => {
      if (metrics[k].trim()) {
        const r = getMetricRule(tank?.tankType || "草缸", k, tank?.customThresholds);
        parts.push(`${r.label} ${metrics[k]}${r.unit}`);
      }
    });
    if (metrics.waterChange.trim()) {
      parts.push(`换水量 ${metrics.waterChange}`);
    }
    return parts.join(" · ");
  };

  const buildTankThresholdsSummary = (tank: TankProfile) => {
    const effective = getAllEffectiveThresholds(tank);
    return TEMPLATE_METRIC_ORDER.map((m) => {
      const r = effective[m];
      const label = TEMPLATE_METRIC_LABELS[m];
      const unit = TEMPLATE_METRIC_UNITS[m];
      return `${label} ${r.ok[0]}${unit}~${r.ok[1]}${unit}`;
    }).join(" · ");
  };

  const displayRecords = useMemo(() => {
    return [...waterRecords];
  }, [waterRecords]);

  const pendingAlertCount = useMemo(() => {
    return alerts.filter((a) => a.status === "pending").length;
  }, [alerts]);

  const handleProcessAlert = async (
    alertId: string,
    treatment: TreatmentAction,
    treatmentNote: string,
    handler: string
  ) => {
    const updatedAlert = await dataService.processAlert(alertId, treatment, treatmentNote, handler);
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? updatedAlert : a))
    );

    const needRetest: TreatmentAction[] = ["复测", "换水", "停喂"];
    if (needRetest.includes(treatment)) {
      const { retestTask, updatedAlert: alertWithRetest } = await dataService.createRetestTaskFromAlert(
        updatedAlert,
        treatment,
        treatmentNote,
        handler
      );
      setRetestTasks((prev) => [...prev, retestTask]);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? alertWithRetest : a))
      );
    }
  };

  const openAddPlanModal = () => {
    setEditingPlanId(null);
    setPlanFormData({ ...emptyPlanForm });
    setPlanModalOpen(true);
  };

  const openEditPlanModal = (plan: WaterChangePlan) => {
    setEditingPlanId(plan.id);
    setPlanFormData({
      tankName: plan.tankName,
      tankId: plan.tankId || "",
      cycleDays: plan.cycleDays,
      waterRatio: plan.waterRatio,
      nextDate: plan.nextDate,
      note: plan.note,
    });
    setPlanModalOpen(true);
  };

  const closePlanModal = () => {
    setPlanModalOpen(false);
    setEditingPlanId(null);
    setPlanFormData({ ...emptyPlanForm });
  };

  const updatePlanForm = (key: keyof Omit<WaterChangePlan, "id" | "createdAt">, value: string) => {
    setPlanFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPlanId) {
      const existingPlan = waterChangePlans.find((p) => p.id === editingPlanId);
      if (!existingPlan) return;
      if (!planFormData.nextDate) {
        alert("请选择下次维护日期");
        return;
      }
      const updatedPlan: WaterChangePlan = {
        ...existingPlan,
        cycleDays: planFormData.cycleDays,
        waterRatio: planFormData.waterRatio,
        nextDate: planFormData.nextDate,
        note: planFormData.note,
      };
      await dataService.updateWaterChangePlan(updatedPlan);
      setWaterChangePlans((prev) =>
        prev.map((p) => (p.id === editingPlanId ? updatedPlan : p))
      );
      mirrorWaterChangePlanToOffline(updatedPlan);

      closePlanModal();
      return;
    }
    const tankName =
      (planFormData.tankId && tanks.find((t) => t.id === planFormData.tankId)?.name) ||
      planFormData.tankName.trim();
    if (!tankName) {
      alert("请选择鱼缸或填写鱼缸名称");
      return;
    }
    if (!planFormData.nextDate) {
      alert("请选择下次维护日期");
      return;
    }
    const newPlan = await dataService.addWaterChangePlan({
      ...planFormData,
      tankName,
    });
    setWaterChangePlans((prev) => [...prev, newPlan]);
    mirrorWaterChangePlanToOffline(newPlan);
    closePlanModal();
  };

  const handleCompletePlan = async (planId: string) => {
    if (!window.confirm("确认已完成本次换水？完成后将自动生成下一次计划。")) return;
    await dataService.completeWaterChangePlan(planId);
    const updatedPlans = await dataService.getWaterChangePlans();
    setWaterChangePlans(updatedPlans);
    updatedPlans
      .filter((p) => p.id === planId || !p.completedAt)
      .forEach(mirrorWaterChangePlanToOffline);
  };

  const handleDeletePlan = async (planId: string) => {
    if (!window.confirm("确定删除该换水计划吗？")) return;
    await dataService.deleteWaterChangePlan(planId);
    setWaterChangePlans((prev) => prev.filter((p) => p.id !== planId));
    removeOfflinePlanMirror(planId);
  };

  const filteredPlans = useMemo(() => {
    let plans = [...waterChangePlans];
    if (planFilter !== "全部") {
      plans = plans.filter((p) => {
        const status = getPlanStatus(p);
        if (planFilter === "已逾期") return status === "overdue";
        if (planFilter === "即将到期") return status === "upcoming";
        if (planFilter === "正常") return status === "normal";
        if (planFilter === "已完成") return status === "completed";
        return true;
      });
    }
    plans.sort((a, b) => {
      const statusRank: Record<PlanStatus, number> = {
        overdue: 0,
        upcoming: 1,
        normal: 2,
        completed: 3,
      };
      const rankA = statusRank[getPlanStatus(a)];
      const rankB = statusRank[getPlanStatus(b)];
      if (rankA !== rankB) return rankA - rankB;
      return new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime();
    });
    return plans;
  }, [waterChangePlans, planFilter]);

  const handleRuleChange = async (_config: RuleConfig, reevaluate: boolean) => {
    if (reevaluate) {
      setIsLoading(true);
      try {
        const data = await dataService.reevaluateAllRecords();
        setWaterRecords(data.waterRecords);
        setAlerts(data.alerts);
      } catch (error) {
        console.error("Failed to re-evaluate records:", error);
        alert("重新评估历史数据失败，请重试。");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleClearAllData = async () => {
    if (!window.confirm("确定要清空所有演示数据吗？此操作不可恢复。")) {
      setClearConfirmOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await dataService.clearAllData();
      setCustomers(data.customers);
      setTanks(data.tanks);
      setWaterRecords(data.waterRecords);
      setWaterChangePlans(data.waterChangePlans);
      setAlerts(data.alerts);
      setRetestTasks(data.retestTasks);
      setClearConfirmOpen(false);
    } catch (error) {
      console.error("Failed to clear data:", error);
      alert("清空数据失败，请重试。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReloadSeedData = async () => {
    if (!window.confirm("确定要重置为初始演示数据吗？当前所有数据将被替换。")) {
      setClearConfirmOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await dataService.resetToSeedData();
      setCustomers(data.customers);
      setTanks(data.tanks);
      setWaterRecords(data.waterRecords);
      setWaterChangePlans(data.waterChangePlans);
      setAlerts(data.alerts);
      setRetestTasks(data.retestTasks);
      setClearConfirmOpen(false);
    } catch (error) {
      console.error("Failed to reload seed data:", error);
      alert("重置数据失败，请重试。");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
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
          <button className="secondary-action" onClick={() => setClearConfirmOpen(true)}>
            🗑️ 数据管理
          </button>
          <RuleConfigPanel onRuleChange={handleRuleChange} />
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
                  value={selectedTankForRecord}
                  onChange={(e) => setSelectedTankForRecord(e.target.value)}
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
                  value={customTankName}
                  onChange={(e) => setCustomTankName(e.target.value)}
                  placeholder="例如：草缸A"
                />
              </label>
              <label>
                <span>pH</span>
                <input
                  type="number"
                  step="0.1"
                  value={waterFormData.ph}
                  onChange={(e) => updateWaterForm("ph", e.target.value)}
                  placeholder="例如 6.8"
                />
              </label>
              <label>
                <span>氨氮 (ppm)</span>
                <input
                  type="number"
                  step="0.01"
                  value={waterFormData.ammonia}
                  onChange={(e) => updateWaterForm("ammonia", e.target.value)}
                  placeholder="例如 0"
                />
              </label>
              <label>
                <span>亚硝酸盐 (ppm)</span>
                <input
                  type="number"
                  step="0.01"
                  value={waterFormData.nitrite}
                  onChange={(e) => updateWaterForm("nitrite", e.target.value)}
                  placeholder="例如 0"
                />
              </label>
              <label>
                <span>硝酸盐 (ppm)</span>
                <input
                  type="number"
                  step="1"
                  value={waterFormData.nitrate}
                  onChange={(e) => updateWaterForm("nitrate", e.target.value)}
                  placeholder="例如 20"
                />
              </label>
              <label>
                <span>硬度 (dGH)</span>
                <input
                  type="number"
                  step="1"
                  value={waterFormData.hardness}
                  onChange={(e) => updateWaterForm("hardness", e.target.value)}
                  placeholder="例如 8"
                />
              </label>
              <label>
                <span>温度 (°C)</span>
                <input
                  type="number"
                  step="0.5"
                  value={waterFormData.temperature}
                  onChange={(e) => updateWaterForm("temperature", e.target.value)}
                  placeholder="例如 26"
                />
              </label>
              <label className="field-full">
                <span>换水量</span>
                <input
                  type="text"
                  value={waterFormData.waterChange}
                  onChange={(e) => updateWaterForm("waterChange", e.target.value)}
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
                  <div className={`record-index ${getStatusClass(record.status)}`}>
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
                      {buildMetricSummary(record.metrics, recordTank) || "未填写指标"}
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
        pendingCount={pendingAlertCount}
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
        tankTypes={TANK_TYPES}
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
          <button className="primary-action" onClick={openAddModal}>
            + 新增档案
          </button>
        </div>

        <div className="chips muted tank-filter-chips">
          {filterOptions.map((filter) => (
            <button
              key={filter}
              className={activeFilter === filter ? "chip-active" : ""}
              onClick={() => setActiveFilter(filter)}
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

        {filteredTanks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🐠</div>
            <h3>暂无鱼缸档案</h3>
            <p>
              {tanks.length === 0
                ? "点击右上角「新增档案」，开始记录您的第一个鱼缸信息。"
                : `当前「${activeFilter}」分类下暂无档案，试试切换其他筛选分类。`}
            </p>
            {tanks.length === 0 && (
              <button className="primary-action" onClick={openAddModal}>
                + 新增档案
              </button>
            )}
          </div>
        ) : (
          <div className="tank-grid">
            {filteredTanks.map((tank) => (
              <article key={tank.id} className="tank-card">
                <header className="tank-card-header">
                  <div>
                    <span className={`tank-type-tag tank-type-${tank.tankType}`}>
                      {tank.tankType}
                    </span>
                    <h3>{tank.name}</h3>
                  </div>
                  <div className="tank-actions">
                    <button className="tank-action-btn" onClick={() => openEditModal(tank)}>
                      编辑
                    </button>
                    <button
                      className="tank-action-btn tank-action-delete"
                      onClick={() => handleDelete(tank.id)}
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
                    {buildTankThresholdsSummary(tank)}
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
          <button className="primary-action" onClick={openAddPlanModal}>
            + 新增计划
          </button>
        </div>

        <div className="chips muted plan-filter-chips">
          {planFilterOptions.map((filter) => {
            let count = 0;
            if (filter === "全部") {
              count = waterChangePlans.length;
            } else {
              count = waterChangePlans.filter((p) => {
                const status = getPlanStatus(p);
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
                className={planFilter === filter ? "chip-active" : ""}
                onClick={() => setPlanFilter(filter)}
              >
                {filter}
                <span className="chip-count">{count}</span>
              </button>
            );
          })}
        </div>

        {filteredPlans.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>暂无换水计划</h3>
            <p>
              {waterChangePlans.length === 0
                ? "点击右上角「新增计划」，为您的鱼缸设置定期换水提醒。"
                : `当前「${planFilter}」分类下暂无计划，试试切换其他筛选分类。`}
            </p>
            {waterChangePlans.length === 0 && (
              <button className="primary-action" onClick={openAddPlanModal}>
                + 新增计划
              </button>
            )}
          </div>
        ) : (
          <div className="plan-grid">
            {filteredPlans.map((plan) => {
              const status = getPlanStatus(plan);
              const statusText = getPlanStatusText(status);
              const daysText = getPlanDaysText(plan);
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
                            onClick={() => openEditPlanModal(plan)}
                          >
                            编辑
                          </button>
                          <button
                            className="plan-action-btn plan-action-complete"
                            onClick={() => handleCompletePlan(plan.id)}
                          >
                            ✓ 完成换水
                          </button>
                        </>
                      )}
                      <button
                        className="plan-action-btn plan-action-delete"
                        onClick={() => handleDeletePlan(plan.id)}
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

      {clearConfirmOpen && (
        <div className="modal-overlay" onClick={() => setClearConfirmOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>数据管理</h2>
              <button className="modal-close" onClick={() => setClearConfirmOpen(false)}>
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
                  <button className="secondary-action" onClick={handleReloadSeedData}>
                    重置演示数据
                  </button>
                </div>
                <div className="data-action-card">
                  <h3>清空所有数据</h3>
                  <p>永久删除所有本地数据，刷新页面后仍保持为空。</p>
                  <button className="danger-action" onClick={handleClearAllData}>
                    清空所有数据
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {planModalOpen && (
        <div className="modal-overlay" onClick={closePlanModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>{editingPlanId ? "编辑换水计划" : "新增换水计划"}</h2>
              <button className="modal-close" onClick={closePlanModal}>
                ×
              </button>
            </header>
            <form onSubmit={handlePlanSubmit} className="modal-form">
              <div className="form-grid">
                {!editingPlanId && (
                  <>
                    <label>
                      <span>鱼缸</span>
                      <select
                        value={planFormData.tankId || ""}
                        onChange={(e) => updatePlanForm("tankId", e.target.value)}
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
                        value={planFormData.tankName}
                        onChange={(e) => updatePlanForm("tankName", e.target.value)}
                        placeholder="例如：草缸A"
                      />
                    </label>
                  </>
                )}
                {editingPlanId && (
                  <label className="form-full">
                    <span>鱼缸</span>
                    <input
                      type="text"
                      value={planFormData.tankName || (planFormData.tankId && tanks.find((t) => t.id === planFormData.tankId)?.name) || ""}
                      disabled
                    />
                  </label>
                )}
                <label>
                  <span>换水周期（天）</span>
                  <input
                    type="number"
                    min="1"
                    value={planFormData.cycleDays}
                    onChange={(e) => updatePlanForm("cycleDays", e.target.value)}
                    placeholder="例如 7"
                  />
                </label>
                <label>
                  <span>计划换水比例（%）</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={planFormData.waterRatio}
                    onChange={(e) => updatePlanForm("waterRatio", e.target.value)}
                    placeholder="例如 30"
                  />
                </label>
                <label className="form-full">
                  <span>下次维护日期 *</span>
                  <input
                    type="date"
                    value={planFormData.nextDate}
                    onChange={(e) => updatePlanForm("nextDate", e.target.value)}
                  />
                </label>
                <label className="form-full">
                  <span>备注</span>
                  <input
                    type="text"
                    value={planFormData.note}
                    onChange={(e) => updatePlanForm("note", e.target.value)}
                    placeholder="例如：周日上午换水，注意水温"
                  />
                </label>
              </div>
              <footer className="modal-footer">
                <button type="button" onClick={closePlanModal}>
                  取消
                </button>
                <button type="submit" className="primary-action">
                  {editingPlanId ? "保存修改" : "确认新增"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>{editingId ? "编辑鱼缸档案" : "新增鱼缸档案"}</h2>
              <button className="modal-close" onClick={closeModal}>
                ×
              </button>
            </header>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-grid">
                <label>
                  <span>鱼缸名称 *</span>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    placeholder="例如：草缸A"
                    required
                  />
                </label>
                <label>
                  <span>缸型</span>
                  <select
                    value={formData.tankType}
                    onChange={(e) => updateForm("tankType", e.target.value)}
                  >
                    {TANK_TYPES.map((t) => (
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
                    value={formData.capacity}
                    onChange={(e) => updateForm("capacity", e.target.value)}
                    placeholder="例如：60L 或 120×50×50cm"
                  />
                </label>
                <label>
                  <span>开缸日期</span>
                  <input
                    type="date"
                    value={formData.setupDate}
                    onChange={(e) => updateForm("setupDate", e.target.value)}
                  />
                </label>
                <label className="form-full">
                  <span>主要生物</span>
                  <input
                    type="text"
                    value={formData.mainCreatures}
                    onChange={(e) => updateForm("mainCreatures", e.target.value)}
                    placeholder="例如：红绿灯、宝莲灯、迷你矮珍珠"
                  />
                </label>
                <label className="form-full">
                  <span>维护负责人</span>
                  <input
                    type="text"
                    value={formData.maintainer}
                    onChange={(e) => updateForm("maintainer", e.target.value)}
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
                        className={`template-apply-btn ${formData.tankType === t ? "template-apply-active" : ""}`}
                        onClick={() => applyTemplateThresholds(t)}
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
                    const current = formData.customThresholds?.[metric];
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
                                onChange={(e) => updateThreshold(metric, "ok", 0, e.target.value)}
                              />
                              <span className="threshold-range-sep">~</span>
                              <input
                                type="number"
                                step={step}
                                value={okMax}
                                onChange={(e) => updateThreshold(metric, "ok", 1, e.target.value)}
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
                                onChange={(e) => updateThreshold(metric, "watch", 0, e.target.value)}
                              />
                              <span className="threshold-range-sep">~</span>
                              <input
                                type="number"
                                step={step}
                                value={watchMax}
                                onChange={(e) => updateThreshold(metric, "watch", 1, e.target.value)}
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
                <button type="button" onClick={closeModal}>
                  取消
                </button>
                <button type="submit" className="primary-action">
                  {editingId ? "保存修改" : "确认新增"}
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
