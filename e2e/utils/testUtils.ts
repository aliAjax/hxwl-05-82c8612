import type { Page } from "@playwright/test";

export async function mockStableEnvironment(page: Page, seed = 42): Promise<void> {
  await page.addInitScript(
    ({ fixedTime, initialSeed }: { fixedTime: number; initialSeed: number }) => {
      (window as any).__seededRandomSeed = initialSeed;
      function seededRandom(): number {
        let s = (window as any).__seededRandomSeed >>> 0;
        s = (s * 1664525 + 1013904223) >>> 0;
        (window as any).__seededRandomSeed = s;
        return s / 0xffffffff;
      }
      Math.random = seededRandom;

      const OriginalDate = globalThis.Date;
      class MockDate extends OriginalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(fixedTime);
          } else {
            super(...(args as [any]));
          }
        }
        static now() {
          return fixedTime;
        }
        static parse(s: string) {
          return OriginalDate.parse(s);
        }
        static UTC(...args: any[]) {
          return OriginalDate.UTC(...(args as [any]));
        }
      }
      (globalThis as any).Date = MockDate as any;
    },
    { fixedTime: new Date("2026-06-15T10:30:00.000Z").getTime(), initialSeed: seed }
  );
}

export async function clearStorages(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      try { localStorage.clear(); } catch (_) { /* ignore */ }
      try { sessionStorage.clear(); } catch (_) { /* ignore */ }
      try {
        const req = indexedDB.deleteDatabase("aquarium_water_db");
        return new Promise<void>((resolve) => {
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
          setTimeout(resolve, 2000);
        });
      } catch (_) {
        return Promise.resolve();
      }
    });
  } catch (_) {
    /* ignore */
  }
}

export async function prepareTestPage(page: Page, seed = 42): Promise<void> {
  await mockStableEnvironment(page, seed);
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await clearStorages(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
}

