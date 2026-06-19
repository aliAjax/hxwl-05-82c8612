import { useState, useCallback } from "react";
import type { WaterMetrics, WaterRecord, TankProfile } from "../db/types";
import type { AlertItem, RetestTask, AlertMetricValues } from "../alertCenter/types";
import type { ImportRecordItem } from "../importCsv";
import { dataService } from "../db";
import { generateAlertsFromRecord } from "../alertCenter/AlertCenter";
import { evaluateRecordStatus, evaluateMetricValue, RULE_METRICS, getMetricRule } from "../ruleConfig";
import type { RuleMetric } from "../ruleConfig";
import { auditLogger } from "../auditLog/auditLogger";

const emptyWaterMetrics: WaterMetrics = {
  ph: "",
  ammonia: "",
  nitrite: "",
  nitrate: "",
  hardness: "",
  temperature: "",
  waterChange: "",
};

interface UseWaterRecordServiceOptions {
  tanks: TankProfile[];
  waterRecords: WaterRecord[];
  alerts: AlertItem[];
  retestTasks: RetestTask[];
  setWaterRecords: React.Dispatch<React.SetStateAction<WaterRecord[]>>;
  setAlerts: React.Dispatch<React.SetStateAction<AlertItem[]>>;
  setRetestTasks: React.Dispatch<React.SetStateAction<RetestTask[]>>;
}

interface WaterRecordFormState {
  waterFormData: WaterMetrics;
  selectedTankForRecord: string;
  customTankName: string;
}

interface WaterRecordSubmitResult {
  success: boolean;
  record?: WaterRecord;
  newAlerts?: AlertItem[];
  completedRetestTasks?: RetestTask[];
  error?: string;
}

export function useWaterRecordService(options: UseWaterRecordServiceOptions) {
  const {
    tanks,
    waterRecords,
    alerts,
    retestTasks,
    setWaterRecords,
    setAlerts,
    setRetestTasks,
  } = options;

  const [waterFormData, setWaterFormData] = useState<WaterMetrics>(emptyWaterMetrics);
  const [selectedTankForRecord, setSelectedTankForRecord] = useState<string>("");
  const [customTankName, setCustomTankName] = useState<string>("");

  const updateWaterForm = useCallback((key: keyof WaterMetrics, value: string) => {
    setWaterFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetWaterForm = useCallback(() => {
    setWaterFormData(emptyWaterMetrics);
    setSelectedTankForRecord("");
    setCustomTankName("");
  }, []);

  const validateWaterRecordForm = useCallback((): { valid: boolean; error?: string; tankName?: string; selectedTank?: TankProfile } => {
    const selectedTank = selectedTankForRecord
      ? tanks.find((t) => t.id === selectedTankForRecord)
      : undefined;
    const tankName =
      (selectedTank && selectedTank.name) ||
      customTankName.trim();

    if (!tankName) {
      return { valid: false, error: "请选择鱼缸或填写鱼缸名称" };
    }

    const hasAnyMetric = (Object.keys(waterFormData) as (keyof WaterMetrics)[]).some(
      (k) => waterFormData[k].trim() !== ""
    );
    if (!hasAnyMetric) {
      return { valid: false, error: "请至少填写一项水质指标" };
    }

    return { valid: true, tankName, selectedTank };
  }, [selectedTankForRecord, customTankName, waterFormData, tanks]);

  const generateRecordTimestamp = useCallback((): string => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }, []);

  const processRetestTasksForRecord = useCallback(async (
    newRecord: WaterRecord,
    selectedTank?: TankProfile
  ): Promise<{ updatedTasks: RetestTask[]; updatedAlerts: AlertItem[] }> => {
    const pendingRetestTasks = retestTasks.filter(
      (t) =>
        (t.status === "pending" || t.status === "overdue") &&
        (t.tankId === newRecord.tankId ||
          (t.tankId === undefined && t.tankName === newRecord.tankName))
    );

    const updatedTasks: RetestTask[] = [];
    const updatedAlerts: AlertItem[] = [];

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
        updatedTasks.push(updatedTask);
        updatedAlerts.push(updatedAlert);
      }
    }

    return { updatedTasks, updatedAlerts };
  }, [retestTasks]);

  const submitWaterRecord = useCallback(async (): Promise<WaterRecordSubmitResult> => {
    const validation = validateWaterRecordForm();
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { tankName, selectedTank } = validation;
    const { status, note } = evaluateRecordStatus(waterFormData, selectedTank);
    const recordedAt = generateRecordTimestamp();

    const newRecordData: Omit<WaterRecord, "id"> = {
      tankName: tankName!,
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
      tankName!,
      selectedTankForRecord || undefined,
      tankType,
      waterFormData as unknown as AlertMetricValues,
      recordedAt,
      customThresholds
    );

    let savedAlerts: AlertItem[] = [];
    if (newAlerts.length > 0) {
      savedAlerts = await dataService.addAlerts(
        newAlerts.map((a) => ({ ...a, id: undefined! } as Omit<AlertItem, "id">))
      );
      setAlerts((prev) => [...savedAlerts, ...prev]);
    }

    const { updatedTasks, updatedAlerts } = await processRetestTasksForRecord(newRecord, selectedTank);
    if (updatedTasks.length > 0) {
      setRetestTasks((prev) =>
        prev.map((t) => {
          const updated = updatedTasks.find((ut) => ut.id === t.id);
          return updated || t;
        })
      );
    }
    if (updatedAlerts.length > 0) {
      setAlerts((prev) =>
        prev.map((a) => {
          const updated = updatedAlerts.find((ua) => ua.id === a.id);
          return updated || a;
        })
      );
    }

    resetWaterForm();

    return {
      success: true,
      record: newRecord,
      newAlerts: savedAlerts,
      completedRetestTasks: updatedTasks,
    };
  }, [
    validateWaterRecordForm,
    waterFormData,
    selectedTankForRecord,
    generateRecordTimestamp,
    processRetestTasksForRecord,
    resetWaterForm,
    setWaterRecords,
    setAlerts,
    setRetestTasks,
  ]);

  const getStatusClass = useCallback((status: WaterRecord["status"]): string => {
    switch (status) {
      case "稳定":
        return "status-ok";
      case "关注":
        return "status-watch";
      case "异常":
        return "status-danger";
    }
  }, []);

  const buildMetricSummary = useCallback((metrics: WaterMetrics, tank?: TankProfile): string => {
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
  }, []);

  const importWaterRecords = useCallback(async (
    items: ImportRecordItem[]
  ): Promise<{ records: WaterRecord[]; alerts: AlertItem[] }> => {
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

    return { records: newRecords, alerts: allSavedAlerts };
  }, [setWaterRecords, setAlerts]);

  const formState: WaterRecordFormState = {
    waterFormData,
    selectedTankForRecord,
    customTankName,
  };

  const formActions = {
    setWaterFormData,
    setSelectedTankForRecord,
    setCustomTankName,
    updateWaterForm,
    resetWaterForm,
  };

  return {
    formState,
    formActions,
    submitWaterRecord,
    importWaterRecords,
    getStatusClass,
    buildMetricSummary,
  };
}
