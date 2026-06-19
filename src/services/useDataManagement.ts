import { useState, useCallback, useEffect } from "react";
import type { AppData, Customer, TankProfile, WaterRecord, WaterChangePlan } from "../db/types";
import type { AlertItem, RetestTask } from "../alertCenter/types";
import { dataService } from "../db";

interface UseDataManagementOptions {
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  setTanks: React.Dispatch<React.SetStateAction<TankProfile[]>>;
  setWaterRecords: React.Dispatch<React.SetStateAction<WaterRecord[]>>;
  setWaterChangePlans: React.Dispatch<React.SetStateAction<WaterChangePlan[]>>;
  setAlerts: React.Dispatch<React.SetStateAction<AlertItem[]>>;
  setRetestTasks: React.Dispatch<React.SetStateAction<RetestTask[]>>;
}

interface DataManagementState {
  isLoading: boolean;
  clearConfirmOpen: boolean;
}

export function useDataManagement(options: UseDataManagementOptions) {
  const {
    setCustomers,
    setTanks,
    setWaterRecords,
    setWaterChangePlans,
    setAlerts,
    setRetestTasks,
  } = options;

  const [isLoading, setIsLoading] = useState(true);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const applyData = useCallback((data: AppData) => {
    setCustomers(data.customers);
    setTanks(data.tanks);
    setWaterRecords(data.waterRecords);
    setWaterChangePlans(data.waterChangePlans);
    setAlerts(data.alerts);
    setRetestTasks(data.retestTasks);
  }, [
    setCustomers,
    setTanks,
    setWaterRecords,
    setWaterChangePlans,
    setAlerts,
    setRetestTasks,
  ]);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      await dataService.init();
      const data = await dataService.getAllData();
      applyData(data);
    } catch (error) {
      console.error("Failed to load data from IndexedDB:", error);
    } finally {
      setIsLoading(false);
    }
  }, [applyData]);

  const handleClearAllData = useCallback(async () => {
    if (!window.confirm("确定要清空所有演示数据吗？此操作不可恢复。")) {
      setClearConfirmOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await dataService.clearAllData();
      applyData(data);
      setClearConfirmOpen(false);
    } catch (error) {
      console.error("Failed to clear data:", error);
      alert("清空数据失败，请重试。");
    } finally {
      setIsLoading(false);
    }
  }, [applyData]);

  const handleReloadSeedData = useCallback(async () => {
    if (!window.confirm("确定要重置为初始演示数据吗？当前所有数据将被替换。")) {
      setClearConfirmOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await dataService.resetToSeedData();
      applyData(data);
      setClearConfirmOpen(false);
    } catch (error) {
      console.error("Failed to reload seed data:", error);
      alert("重置数据失败，请重试。");
    } finally {
      setIsLoading(false);
    }
  }, [applyData]);

  const handleRuleChange = useCallback(async (
    _config: unknown,
    reevaluate: boolean
  ) => {
    if (reevaluate) {
      setIsLoading(true);
      try {
        const data = await dataService.reevaluateAllRecords();
        applyData(data);
      } catch (error) {
        console.error("Failed to re-evaluate records:", error);
        alert("重新评估历史数据失败，请重试。");
      } finally {
        setIsLoading(false);
      }
    }
  }, [applyData]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const state: DataManagementState = {
    isLoading,
    clearConfirmOpen,
  };

  const actions = {
    setClearConfirmOpen,
    loadAllData,
    handleClearAllData,
    handleReloadSeedData,
    handleRuleChange,
  };

  return {
    state,
    actions,
  };
}
