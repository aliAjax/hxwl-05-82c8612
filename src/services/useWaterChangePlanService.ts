import { useState, useMemo, useCallback } from "react";
import type { WaterChangePlan, PlanStatus, TankProfile } from "../db/types";
import { dataService } from "../db";
import { offlineSyncStore, createSyncMeta } from "../offlineSync";

const emptyPlanForm: Omit<WaterChangePlan, "id" | "createdAt"> = {
  tankName: "",
  tankId: "",
  cycleDays: "7",
  waterRatio: "30",
  nextDate: "",
  note: "",
};

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

interface UseWaterChangePlanServiceOptions {
  tanks: TankProfile[];
  waterChangePlans: WaterChangePlan[];
  setWaterChangePlans: React.Dispatch<React.SetStateAction<WaterChangePlan[]>>;
}

interface PlanFormState {
  planFormData: Omit<WaterChangePlan, "id" | "createdAt">;
  editingPlanId: string | null;
  planModalOpen: boolean;
  planFilter: string;
}

const planFilterOptions = ["全部", "已逾期", "即将到期", "正常", "已完成"];

export function useWaterChangePlanService(options: UseWaterChangePlanServiceOptions) {
  const { tanks, waterChangePlans, setWaterChangePlans } = options;

  const [planFormData, setPlanFormData] = useState<Omit<WaterChangePlan, "id" | "createdAt">>(emptyPlanForm);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planFilter, setPlanFilter] = useState<string>("全部");

  const getPlanStatus = useCallback((plan: WaterChangePlan): PlanStatus => {
    if (plan.completedAt) return "completed";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextDate = new Date(plan.nextDate);
    nextDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "overdue";
    if (diffDays <= 3) return "upcoming";
    return "normal";
  }, []);

  const getPlanStatusText = useCallback((status: PlanStatus): string => {
    switch (status) {
      case "normal": return "正常";
      case "upcoming": return "即将到期";
      case "overdue": return "已逾期";
      case "completed": return "已完成";
    }
  }, []);

  const getPlanDaysText = useCallback((plan: WaterChangePlan): string => {
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
  }, []);

  const openAddPlanModal = useCallback(() => {
    setEditingPlanId(null);
    setPlanFormData({ ...emptyPlanForm });
    setPlanModalOpen(true);
  }, []);

  const openEditPlanModal = useCallback((plan: WaterChangePlan) => {
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
  }, []);

  const closePlanModal = useCallback(() => {
    setPlanModalOpen(false);
    setEditingPlanId(null);
    setPlanFormData({ ...emptyPlanForm });
  }, []);

  const updatePlanForm = useCallback((
    key: keyof Omit<WaterChangePlan, "id" | "createdAt">,
    value: string
  ) => {
    setPlanFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const validatePlanForm = useCallback((): { valid: boolean; error?: string; tankName?: string } => {
    if (editingPlanId) {
      if (!planFormData.nextDate) {
        return { valid: false, error: "请选择下次维护日期" };
      }
      return { valid: true };
    }

    const tankName =
      (planFormData.tankId && tanks.find((t) => t.id === planFormData.tankId)?.name) ||
      planFormData.tankName.trim();
    if (!tankName) {
      return { valid: false, error: "请选择鱼缸或填写鱼缸名称" };
    }
    if (!planFormData.nextDate) {
      return { valid: false, error: "请选择下次维护日期" };
    }
    return { valid: true, tankName };
  }, [editingPlanId, planFormData, tanks]);

  const handlePlanSubmit = useCallback(async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();

    const validation = validatePlanForm();
    if (!validation.valid) {
      if (validation.error) alert(validation.error);
      return false;
    }

    if (editingPlanId) {
      const existingPlan = waterChangePlans.find((p) => p.id === editingPlanId);
      if (!existingPlan) return false;

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
      return true;
    }

    const tankName = validation.tankName!;
    const newPlan = await dataService.addWaterChangePlan({
      ...planFormData,
      tankName,
    });
    setWaterChangePlans((prev) => [...prev, newPlan]);
    mirrorWaterChangePlanToOffline(newPlan);
    closePlanModal();
    return true;
  }, [
    editingPlanId,
    planFormData,
    validatePlanForm,
    waterChangePlans,
    setWaterChangePlans,
    closePlanModal,
  ]);

  const handleCompletePlan = useCallback(async (planId: string): Promise<boolean> => {
    if (!window.confirm("确认已完成本次换水？完成后将自动生成下一次计划。")) return false;
    await dataService.completeWaterChangePlan(planId);
    const updatedPlans = await dataService.getWaterChangePlans();
    setWaterChangePlans(updatedPlans);
    updatedPlans
      .filter((p) => p.id === planId || !p.completedAt)
      .forEach(mirrorWaterChangePlanToOffline);
    return true;
  }, [setWaterChangePlans]);

  const handleDeletePlan = useCallback(async (planId: string): Promise<boolean> => {
    if (!window.confirm("确定删除该换水计划吗？")) return false;
    await dataService.deleteWaterChangePlan(planId);
    setWaterChangePlans((prev) => prev.filter((p) => p.id !== planId));
    removeOfflinePlanMirror(planId);
    return true;
  }, [setWaterChangePlans]);

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
  }, [waterChangePlans, planFilter, getPlanStatus]);

  const formState: PlanFormState = {
    planFormData,
    editingPlanId,
    planModalOpen,
    planFilter,
  };

  const formActions = {
    setPlanFormData,
    setEditingPlanId,
    setPlanModalOpen,
    setPlanFilter,
    openAddPlanModal,
    openEditPlanModal,
    closePlanModal,
    updatePlanForm,
    handlePlanSubmit,
    handleCompletePlan,
    handleDeletePlan,
  };

  return {
    formState,
    formActions,
    filteredPlans,
    planFilterOptions,
    getPlanStatus,
    getPlanStatusText,
    getPlanDaysText,
  };
}
