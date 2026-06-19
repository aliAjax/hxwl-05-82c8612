import { beforeEach, vi } from "vitest";

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
  get length(): number {
    return Object.keys(this.store).length;
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}

beforeEach(() => {
  (globalThis as any).localStorage = new LocalStorageMock();
});

export const FIXED_DATE = new Date("2026-06-15T10:30:00.000Z");

vi.useFakeTimers();
vi.setSystemTime(FIXED_DATE);

beforeEach(() => {
  vi.setSystemTime(FIXED_DATE);
});

export function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function mockMathRandom(seed = 12345): void {
  const rand = createSeededRandom(seed);
  vi.spyOn(globalThis.Math, "random").mockImplementation(rand);
}

export function unmockMathRandom(): void {
  vi.spyOn(globalThis.Math, "random").mockRestore();
}

export function setFixedDate(dateStr: string): void {
  vi.setSystemTime(new Date(dateStr));
}

export function resetFixedDate(): void {
  vi.setSystemTime(FIXED_DATE);
}
