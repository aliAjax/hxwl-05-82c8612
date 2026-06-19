import { useCallback, useMemo } from "react";
import type { AlertItem, RetestTask, TreatmentAction } from "../alertCenter/types";
import { dataService } from "../db";

interface UseAlertServiceOptions {
  alerts: AlertItem[];
  retestTasks: RetestTask[];
  setAlerts: React.Dispatch<React.SetStateAction<AlertItem[]>>;
  setRetestTasks: React.Dispatch<React.SetStateAction<RetestTask[]>>;
}

interface ProcessAlertResult {
  success: boolean;
  updatedAlert?: AlertItem;
  retestTask?: RetestTask;
  error?: string;
}

export function useAlertService(options: UseAlertServiceOptions) {
  const { alerts, retestTasks, setAlerts, setRetestTasks } = options;

  const pendingAlertCount = useMemo(() => {
    return alerts.filter((a) => a.status === "pending").length;
  }, [alerts]);

  const needRetestTreatments: TreatmentAction[] = ["复测", "换水", "停喂"];

  const processAlert = useCallback(async (
    alertId: string,
    treatment: TreatmentAction,
    treatmentNote: string,
    handler: string
  ): Promise<ProcessAlertResult> => {
    const updatedAlert = await dataService.processAlert(
      alertId,
      treatment,
      treatmentNote,
      handler
    );
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? updatedAlert : a))
    );

    let retestTask: RetestTask | undefined;
    if (needRetestTreatments.includes(treatment)) {
      const result = await dataService.createRetestTaskFromAlert(
        updatedAlert,
        treatment,
        treatmentNote,
        handler
      );
      retestTask = result.retestTask;
      setRetestTasks((prev) => [...prev, result.retestTask]);
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? result.updatedAlert : a))
      );
    }

    return {
      success: true,
      updatedAlert,
      retestTask,
    };
  }, [setAlerts, setRetestTasks]);

  return {
    pendingAlertCount,
    processAlert,
  };
}
