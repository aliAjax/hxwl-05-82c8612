import { db } from "./database";
import { generateSeedData, hasSeedDataBeenLoaded, markSeedDataAsLoaded } from "./seedData";
import type { TankProfile, WaterRecord, WaterChangePlan, AppData, Customer } from "./types";
import type { AlertItem, RetestTask, TreatmentAction, AlertMetric } from "../alertCenter/types";

export class DataService {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await db.init();

    if (!hasSeedDataBeenLoaded()) {
      const existingData = await this.getAllData();
      const isEmpty = Object.values(existingData).every((arr) => arr.length === 0);
      if (isEmpty) {
        await this.loadSeedData();
      }
      markSeedDataAsLoaded();
    }

    this.initialized = true;
  }

  private async loadSeedData(): Promise<void> {
    const seed = generateSeedData();
    await db.bulkAdd("customers", seed.customers);
    await db.bulkAdd("tanks", seed.tanks);
    await db.bulkAdd("waterRecords", seed.waterRecords);
    await db.bulkAdd("waterChangePlans", seed.waterChangePlans);
    await db.bulkAdd("alerts", seed.alerts);
  }

  async getAllData(): Promise<AppData> {
    const [customers, tanks, waterRecords, waterChangePlans, alerts, retestTasks] = await Promise.all([
      this.getCustomers(),
      this.getTanks(),
      this.getWaterRecords(),
      this.getWaterChangePlans(),
      this.getAlerts(),
      this.getRetestTasks(),
    ]);
    return { customers, tanks, waterRecords, waterChangePlans, alerts, retestTasks };
  }

  async getCustomers(): Promise<Customer[]> {
    const customers = await db.getAll<Customer>("customers");
    return customers.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    return db.get<Customer>("customers", id);
  }

  async addCustomer(customer: Omit<Customer, "id" | "createdAt">): Promise<Customer> {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newCustomer: Customer = {
      ...customer,
      id: Date.now().toString(),
      createdAt,
    };
    await db.add("customers", newCustomer);
    return newCustomer;
  }

  async updateCustomer(customer: Customer): Promise<void> {
    await db.put("customers", customer);
  }

  async deleteCustomer(id: string): Promise<void> {
    await db.delete("customers", id);
  }

  async getTanks(): Promise<TankProfile[]> {
    const tanks = await db.getAll<TankProfile>("tanks");
    return tanks.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getTank(id: string): Promise<TankProfile | undefined> {
    return db.get<TankProfile>("tanks", id);
  }

  async addTank(tank: Omit<TankProfile, "id">): Promise<TankProfile> {
    const newTank: TankProfile = {
      ...tank,
      id: Date.now().toString(),
    };
    await db.add("tanks", newTank);
    return newTank;
  }

  async updateTank(tank: TankProfile): Promise<void> {
    await db.put("tanks", tank);
  }

  async deleteTank(id: string): Promise<void> {
    await db.delete("tanks", id);
  }

  async getWaterRecords(): Promise<WaterRecord[]> {
    const records = await db.getAll<WaterRecord>("waterRecords");
    return records.sort(
      (a, b) =>
        new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
    );
  }

  async addWaterRecord(
    record: Omit<WaterRecord, "id">
  ): Promise<WaterRecord> {
    const newRecord: WaterRecord = {
      ...record,
      id: Date.now().toString(),
    };
    await db.add("waterRecords", newRecord);
    return newRecord;
  }

  async updateWaterRecord(record: WaterRecord): Promise<void> {
    await db.put("waterRecords", record);
  }

  async deleteWaterRecord(id: string): Promise<void> {
    await db.delete("waterRecords", id);
  }

  async getWaterChangePlans(): Promise<WaterChangePlan[]> {
    const plans = await db.getAll<WaterChangePlan>("waterChangePlans");
    return plans.sort((a, b) => {
      const aHasCompleted = !!a.completedAt;
      const bHasCompleted = !!b.completedAt;
      if (aHasCompleted !== bHasCompleted) return aHasCompleted ? 1 : -1;
      return new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime();
    });
  }

  async addWaterChangePlan(
    plan: Omit<WaterChangePlan, "id" | "createdAt">
  ): Promise<WaterChangePlan> {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newPlan: WaterChangePlan = {
      ...plan,
      id: Date.now().toString(),
      createdAt,
    };
    await db.add("waterChangePlans", newPlan);
    return newPlan;
  }

  async updateWaterChangePlan(plan: WaterChangePlan): Promise<void> {
    await db.put("waterChangePlans", plan);
  }

  async deleteWaterChangePlan(id: string): Promise<void> {
    await db.delete("waterChangePlans", id);
  }

  async completeWaterChangePlan(planId: string): Promise<WaterChangePlan> {
    const plan = await db.get<WaterChangePlan>("waterChangePlans", planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const completedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const completedPlan: WaterChangePlan = {
      ...plan,
      completedAt,
    };
    await db.put("waterChangePlans", completedPlan);

    const cycleDays = parseInt(plan.cycleDays) || 7;
    const nextDate = new Date(now);
    nextDate.setDate(nextDate.getDate() + cycleDays);
    const nextDateStr = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`;

    const nextPlan: WaterChangePlan = {
      ...plan,
      id: (Date.now() + 1).toString(),
      nextDate: nextDateStr,
      completedAt: undefined,
      createdAt: completedAt,
    };
    await db.add("waterChangePlans", nextPlan);

    return nextPlan;
  }

  async getAlerts(): Promise<AlertItem[]> {
    const alerts = await db.getAll<AlertItem>("alerts");
    return alerts.sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      if (a.severity !== b.severity) return a.severity === "severe" ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async addAlert(alert: Omit<AlertItem, "id">): Promise<AlertItem> {
    const newAlert: AlertItem = {
      ...alert,
      id: `${alert.recordId}-${alert.metric}-${Date.now()}`,
    };
    await db.add("alerts", newAlert);
    return newAlert;
  }

  async addAlerts(alerts: Omit<AlertItem, "id">[]): Promise<AlertItem[]> {
    const createdAlerts: AlertItem[] = [];
    for (const alert of alerts) {
      const newAlert = await this.addAlert(alert);
      createdAlerts.push(newAlert);
    }
    return createdAlerts;
  }

  async updateAlert(alert: AlertItem): Promise<void> {
    await db.put("alerts", alert);
  }

  async processAlert(
    alertId: string,
    treatment: AlertItem["treatment"],
    treatmentNote: string,
    handler: string
  ): Promise<AlertItem> {
    const alert = await db.get<AlertItem>("alerts", alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const processedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const updatedAlert: AlertItem = {
      ...alert,
      status: "processed",
      treatment,
      treatmentNote,
      handler,
      processedAt,
    };
    await db.put("alerts", updatedAlert);
    return updatedAlert;
  }

  async deleteAlert(id: string): Promise<void> {
    await db.delete("alerts", id);
  }

  async getRetestTasks(): Promise<RetestTask[]> {
    const tasks = await db.getAll<RetestTask>("retestTasks");
    this.checkAndUpdateOverdueRetestTasks(tasks);
    return tasks.sort((a, b) => {
      const statusRank: Record<string, number> = { overdue: 0, pending: 1, completed: 2 };
      const rankA = statusRank[a.status] ?? 3;
      const rankB = statusRank[b.status] ?? 3;
      if (rankA !== rankB) return rankA - rankB;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }

  private async checkAndUpdateOverdueRetestTasks(tasks: RetestTask[]): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let hasUpdates = false;
    for (const task of tasks) {
      if (task.status === "pending") {
        const dueDate = new Date(task.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        if (dueDate.getTime() < today.getTime()) {
          task.status = "overdue";
          await db.put("retestTasks", task);
          hasUpdates = true;
        }
      }
    }
  }

  async getRetestTask(id: string): Promise<RetestTask | undefined> {
    return db.get<RetestTask>("retestTasks", id);
  }

  async addRetestTask(task: Omit<RetestTask, "id" | "createdAt" | "status" | "retestResult">): Promise<RetestTask> {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const newTask: RetestTask = {
      ...task,
      id: `retest-${Date.now()}`,
      createdAt,
      status: "pending",
      retestResult: null,
    };
    await db.add("retestTasks", newTask);
    return newTask;
  }

  async updateRetestTask(task: RetestTask): Promise<void> {
    await db.put("retestTasks", task);
  }

  async deleteRetestTask(id: string): Promise<void> {
    await db.delete("retestTasks", id);
  }

  async createRetestTaskFromAlert(
    alert: AlertItem,
    treatment: TreatmentAction,
    treatmentNote: string,
    handler: string
  ): Promise<{ retestTask: RetestTask; updatedAlert: AlertItem }> {
    const dueDaysMap: Record<TreatmentAction, number> = {
      "复测": 1,
      "换水": 3,
      "停喂": 2,
      "补菌": 3,
    };
    const dueDays = dueDaysMap[treatment] ?? 2;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dueDateStr = `${dueDate.getFullYear()}-${pad(dueDate.getMonth() + 1)}-${pad(dueDate.getDate())}`;

    const retestTask = await this.addRetestTask({
      sourceAlertId: alert.id,
      sourceAlertMetric: alert.metric,
      sourceAlertMetricLabel: alert.metricLabel,
      tankName: alert.tankName,
      tankId: alert.tankId,
      tankType: alert.tankType,
      triggerTreatment: treatment,
      treatmentNote,
      originalValue: alert.value,
      originalUnit: alert.unit,
      thresholdRange: alert.thresholdRange,
      dueDate: dueDateStr,
      handler,
    });

    const updatedAlert: AlertItem = {
      ...alert,
      retestTaskId: retestTask.id,
    };
    await this.updateAlert(updatedAlert);

    return { retestTask, updatedAlert };
  }

  async completeRetestTask(
    taskId: string,
    retestRecordId: string,
    retestValue: string,
    isRecovered: boolean
  ): Promise<{ task: RetestTask; alert: AlertItem }> {
    const task = await this.getRetestTask(taskId);
    if (!task) {
      throw new Error(`Retest task not found: ${taskId}`);
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const completedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const updatedTask: RetestTask = {
      ...task,
      status: "completed",
      retestRecordId,
      retestValue,
      retestResult: isRecovered ? "recovered" : "not_recovered",
      completedAt,
    };
    await this.updateRetestTask(updatedTask);

    const alert = await db.get<AlertItem>("alerts", task.sourceAlertId);
    let updatedAlert: AlertItem = alert ?? { id: task.sourceAlertId } as AlertItem;
    if (alert) {
      updatedAlert = {
        ...alert,
        retestResult: isRecovered ? "recovered" : "not_recovered",
        isClosed: isRecovered,
        closedAt: isRecovered ? completedAt : undefined,
      };
      await this.updateAlert(updatedAlert);
    }

    return { task: updatedTask, alert: updatedAlert };
  }

  async clearAllData(): Promise<AppData> {
    await db.clearAll();
    markSeedDataAsLoaded();
    this.initialized = true;
    return this.getAllData();
  }

  async resetToSeedData(): Promise<AppData> {
    await db.clearAll();
    await this.loadSeedData();
    markSeedDataAsLoaded();
    this.initialized = true;
    return this.getAllData();
  }
}

export const dataService = new DataService();
