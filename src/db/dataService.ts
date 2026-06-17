import { db } from "./database";
import { generateSeedData, hasSeedDataBeenLoaded, markSeedDataAsLoaded } from "./seedData";
import type { TankProfile, WaterRecord, WaterChangePlan, AppData, Customer } from "./types";
import type { AlertItem } from "../alertCenter/types";

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
    const [customers, tanks, waterRecords, waterChangePlans, alerts] = await Promise.all([
      this.getCustomers(),
      this.getTanks(),
      this.getWaterRecords(),
      this.getWaterChangePlans(),
      this.getAlerts(),
    ]);
    return { customers, tanks, waterRecords, waterChangePlans, alerts };
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
