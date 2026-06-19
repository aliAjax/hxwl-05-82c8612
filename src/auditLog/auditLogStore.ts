import { db } from "../db/database";
import type { AuditLogEntry, AuditEntityType, AuditOperation } from "./types";

class AuditLogStore {
  private sequenceCounter = 0;

  async init(): Promise<void> {
    const existing = await db.getAll<AuditLogEntry>("auditLogs");
    if (existing.length > 0) {
      this.sequenceCounter = Math.max(...existing.map((e) => e.sequence));
    }
  }

  private nextSequence(): number {
    this.sequenceCounter++;
    return this.sequenceCounter;
  }

  async addLog(entry: Omit<AuditLogEntry, "id" | "createdAt" | "sequence">): Promise<AuditLogEntry> {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const fullEntry: AuditLogEntry = {
      ...entry,
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt,
      sequence: this.nextSequence(),
    };

    await db.add("auditLogs", fullEntry);
    return fullEntry;
  }

  async getAllLogs(): Promise<AuditLogEntry[]> {
    const logs = await db.getAll<AuditLogEntry>("auditLogs");
    return logs.sort((a, b) => b.sequence - a.sequence);
  }

  async getLogsByTank(tankId: string): Promise<AuditLogEntry[]> {
    const logs = await db.getAll<AuditLogEntry>("auditLogs");
    return logs
      .filter((l) => l.tankId === tankId)
      .sort((a, b) => b.sequence - a.sequence);
  }

  async getLogsByTankName(tankName: string): Promise<AuditLogEntry[]> {
    const logs = await db.getAll<AuditLogEntry>("auditLogs");
    return logs
      .filter((l) => l.tankName === tankName)
      .sort((a, b) => b.sequence - a.sequence);
  }

  async getLogsByEntity(entityType: AuditEntityType, entityId: string): Promise<AuditLogEntry[]> {
    const logs = await db.getAll<AuditLogEntry>("auditLogs");
    return logs
      .filter((l) => l.entityType === entityType && l.entityId === entityId)
      .sort((a, b) => b.sequence - a.sequence);
  }

  async getLogsByOperation(operation: AuditOperation): Promise<AuditLogEntry[]> {
    const logs = await db.getAll<AuditLogEntry>("auditLogs");
    return logs
      .filter((l) => l.operation === operation)
      .sort((a, b) => b.sequence - a.sequence);
  }

  async getLogsByEntityType(entityType: AuditEntityType): Promise<AuditLogEntry[]> {
    const logs = await db.getAll<AuditLogEntry>("auditLogs");
    return logs
      .filter((l) => l.entityType === entityType)
      .sort((a, b) => b.sequence - a.sequence);
  }

  async getTimelineForTank(tankId: string, tankName?: string): Promise<AuditLogEntry[]> {
    const logs = await db.getAll<AuditLogEntry>("auditLogs");
    return logs
      .filter((l) => {
        if (l.tankId && l.tankId === tankId) return true;
        if (tankName && l.tankName === tankName && !l.tankId) return true;
        return false;
      })
      .sort((a, b) => b.sequence - a.sequence);
  }

  async clearLogs(): Promise<void> {
    await db.clear("auditLogs");
    this.sequenceCounter = 0;
  }

  async getLogCount(): Promise<number> {
    const logs = await db.getAll<AuditLogEntry>("auditLogs");
    return logs.length;
  }
}

export const auditLogStore = new AuditLogStore();
