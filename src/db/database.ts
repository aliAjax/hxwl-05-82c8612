import { STORE_NAMES, type StoreName } from "./types";

const DB_NAME = "aquarium_water_db";
const DB_VERSION = 1;

export class Database {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains("tanks")) {
          const tankStore = db.createObjectStore("tanks", { keyPath: "id" });
          tankStore.createIndex("tankType", "tankType", { unique: false });
          tankStore.createIndex("name", "name", { unique: false });
        }

        if (!db.objectStoreNames.contains("waterRecords")) {
          const recordStore = db.createObjectStore("waterRecords", { keyPath: "id" });
          recordStore.createIndex("tankId", "tankId", { unique: false });
          recordStore.createIndex("tankName", "tankName", { unique: false });
          recordStore.createIndex("recordedAt", "recordedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains("waterChangePlans")) {
          const planStore = db.createObjectStore("waterChangePlans", { keyPath: "id" });
          planStore.createIndex("tankId", "tankId", { unique: false });
          planStore.createIndex("tankName", "tankName", { unique: false });
          planStore.createIndex("nextDate", "nextDate", { unique: false });
        }

        if (!db.objectStoreNames.contains("alerts")) {
          const alertStore = db.createObjectStore("alerts", { keyPath: "id" });
          alertStore.createIndex("tankId", "tankId", { unique: false });
          alertStore.createIndex("status", "status", { unique: false });
          alertStore.createIndex("severity", "severity", { unique: false });
          alertStore.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  async add<T>(storeName: StoreName, data: T): Promise<string> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.add(data);

      request.onsuccess = () => resolve(request.result as string);
      request.onerror = () => reject(request.error);
    });
  }

  async put<T>(storeName: StoreName, data: T): Promise<string> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result as string);
      request.onerror = () => reject(request.error);
    });
  }

  async get<T>(storeName: StoreName, id: string): Promise<T | undefined> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(storeName: StoreName): Promise<T[]> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: StoreName, id: string): Promise<void> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(storeName: StoreName): Promise<void> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    await this.ensureInitialized();
    const promises = STORE_NAMES.map((name) => this.clear(name));
    await Promise.all(promises);
  }

  async bulkAdd<T>(storeName: StoreName, items: T[]): Promise<void> {
    if (items.length === 0) return;
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);

      let completed = 0;
      let hasError = false;

      for (const item of items) {
        const request = store.add(item);
        request.onsuccess = () => {
          completed++;
          if (completed === items.length && !hasError) {
            resolve();
          }
        };
        request.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(request.error);
          }
        };
      }
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

export const db = new Database();
