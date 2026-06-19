import { useState, useMemo, useCallback } from "react";
import type { TankProfile, ThresholdMetric, CustomThresholds } from "../db/types";
import { dataService } from "../db";
import {
  cloneTemplateThresholds,
  getAllEffectiveThresholds,
  TEMPLATE_METRIC_LABELS,
  TEMPLATE_METRIC_UNITS,
  TEMPLATE_METRIC_ORDER,
  TANK_TEMPLATE_TYPES,
} from "../db/tankTemplates";

const TANK_TYPES = ["草缸", "海缸", "三湖缸", "繁殖缸"];

const emptyForm: Omit<TankProfile, "id"> = {
  name: "",
  tankType: "草缸",
  capacity: "",
  setupDate: "",
  mainCreatures: "",
  maintainer: "",
  customThresholds: cloneTemplateThresholds("草缸"),
};

interface UseTankProfileServiceOptions {
  tanks: TankProfile[];
  setTanks: React.Dispatch<React.SetStateAction<TankProfile[]>>;
}

interface TankFormState {
  formData: Omit<TankProfile, "id">;
  editingId: string | null;
  modalOpen: boolean;
  activeFilter: string;
}

const filterOptions = ["全部", ...TANK_TYPES];

export function useTankProfileService(options: UseTankProfileServiceOptions) {
  const { tanks, setTanks } = options;

  const [formData, setFormData] = useState<Omit<TankProfile, "id">>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("全部");

  const filteredTanks = useMemo(() => {
    if (activeFilter === "全部") return tanks;
    return tanks.filter((t) => t.tankType === activeFilter);
  }, [tanks, activeFilter]);

  const openAddModal = useCallback(() => {
    setEditingId(null);
    setFormData({ ...emptyForm, customThresholds: cloneTemplateThresholds("草缸") });
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((tank: TankProfile) => {
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
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
  }, []);

  const updateForm = useCallback((key: keyof Omit<TankProfile, "id">, value: string) => {
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
  }, []);

  const updateThreshold = useCallback((
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
  }, []);

  const applyTemplateThresholds = useCallback((templateType: string) => {
    setFormData((prev) => ({
      ...prev,
      customThresholds: cloneTemplateThresholds(templateType),
    }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    if (!formData.name.trim()) return false;

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
    return true;
  }, [formData, editingId, setTanks, closeModal]);

  const handleDelete = useCallback(async (id: string): Promise<boolean> => {
    if (!window.confirm("确定删除该鱼缸档案吗？")) return false;
    await dataService.deleteTank(id);
    setTanks((prev) => prev.filter((t) => t.id !== id));
    return true;
  }, [setTanks]);

  const buildTankThresholdsSummary = useCallback((tank: TankProfile): string => {
    const effective = getAllEffectiveThresholds(tank);
    return TEMPLATE_METRIC_ORDER.map((m) => {
      const r = effective[m];
      const label = TEMPLATE_METRIC_LABELS[m];
      const unit = TEMPLATE_METRIC_UNITS[m];
      return `${label} ${r.ok[0]}${unit}~${r.ok[1]}${unit}`;
    }).join(" · ");
  }, []);

  const formState: TankFormState = {
    formData,
    editingId,
    modalOpen,
    activeFilter,
  };

  const formActions = {
    setFormData,
    setEditingId,
    setModalOpen,
    setActiveFilter,
    openAddModal,
    openEditModal,
    closeModal,
    updateForm,
    updateThreshold,
    applyTemplateThresholds,
    handleSubmit,
    handleDelete,
  };

  return {
    formState,
    formActions,
    filteredTanks,
    filterOptions,
    tankTypes: TANK_TYPES,
    tankTemplateTypes: TANK_TEMPLATE_TYPES,
    buildTankThresholdsSummary,
  };
}
