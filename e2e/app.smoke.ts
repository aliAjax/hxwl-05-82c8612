import { test, expect } from "@playwright/test";
import { prepareTestPage, mockStableEnvironment, clearStorages } from "./utils/testUtils";

test.describe("应用冒烟测试 - 核心UI加载", () => {
  test.beforeEach(async ({ page }) => {
    await prepareTestPage(page, 42);
  });

  test("应用应成功加载并显示标题和副标题", async ({ page }) => {
    const hero = page.locator(".hero");
    await expect(hero.locator("h1")).toContainText("水族箱水质监测");
    await expect(hero.locator(".subtitle")).toContainText("多鱼缸水质趋势");
  });

  test("应显示项目标识和端口信息", async ({ page }) => {
    const hero = page.locator(".hero");
    const eyebrow = hero.locator(".eyebrow");
    await expect(eyebrow).toContainText("hxwl-05");
    await expect(eyebrow).toContainText("port 5105");
  });

  test("应显示核心指标卡片", async ({ page }) => {
    const metricCards = page.locator(".metric-card");
    await expect(metricCards).toHaveCount(4);

    const labels = ["pH", "氨氮", "硝酸盐", "换水周期"];
    for (let i = 0; i < labels.length; i++) {
      await expect(metricCards.nth(i).locator("span")).toContainText(labels[i]);
    }
  });

  test("应显示角色和筛选标签", async ({ page }) => {
    const roleChips = page.locator(".chips").first().locator("span");
    await expect(roleChips).toHaveCount(3);
    await expect(roleChips.nth(0)).toContainText("水族店员");

    const filterButtons = page.locator(".chips.muted").first().locator("button");
    await expect(filterButtons).toHaveCount(4);
    const filters = ["草缸", "海缸", "三湖缸", "繁殖缸"];
    for (let i = 0; i < filters.length; i++) {
      await expect(filterButtons.nth(i)).toContainText(filters[i]);
    }
  });

  test("应显示水质录入表单的关键字段", async ({ page }) => {
    const workspace = page.locator(".workspace");
    const formSection = workspace.locator(".panel").last();
    await expect(formSection.locator("h2")).toContainText("水质记录录入");

    const formLabels = formSection.locator(".field-grid label span");
    const expectedLabels = [
      "鱼缸",
      "或自定义鱼缸名称",
      "pH",
      "氨氮 (ppm)",
      "亚硝酸盐 (ppm)",
      "硝酸盐 (ppm)",
      "硬度 (dGH)",
      "温度 (°C)",
      "换水量",
    ];
    for (let i = 0; i < expectedLabels.length; i++) {
      await expect(formLabels.nth(i)).toContainText(expectedLabels[i]);
    }

    await expect(formSection.getByRole("button", { name: "提交记录" })).toBeVisible();
  });
});

test.describe("应用冒烟测试 - 数据管理与录入", () => {
  test.beforeEach(async ({ page }) => {
    await prepareTestPage(page, 7);
  });

  test("数据管理弹窗和重置按钮应正常存在", async ({ page }) => {
    const dataBtn = page.locator("button", { hasText: "数据管理" });
    await dataBtn.click();
    await expect(page.locator(".modal-content")).toBeVisible();

    const resetBtn = page.locator(".modal-content button", { hasText: "重置演示数据" });
    await expect(resetBtn).toBeVisible();

    const clearBtn = page.locator(".modal-content button", { hasText: "清空所有数据" });
    await expect(clearBtn).toBeVisible();
  });

  test("提交一条水质记录应显示在记录列表中", async ({ page }) => {
    const dataBtn = page.locator("button", { hasText: "数据管理" });
    await dataBtn.click();
    page.once("dialog", (dialog) => dialog.accept());

    const clearBtn = page.locator(".modal-content button", { hasText: "清空所有数据" });
    await clearBtn.click();
    await page.waitForTimeout(1500);

    const closeBtn = page.locator(".modal-content button", { hasText: "关闭" });
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    const emptyState = page.locator(".records .empty-state h3");
    await expect(emptyState).toContainText("暂无水质记录");

    const workspace = page.locator(".workspace");
    const formSection = workspace.locator(".panel").last();

    await formSection
      .locator('input[placeholder="例如：草缸A"]')
      .fill("冒烟测试草缸");

    await formSection
      .locator('input[placeholder="例如 6.8"]')
      .fill("6.8");

    await formSection
      .locator('input[placeholder="例如 0"]')
      .first()
      .fill("0");

    await formSection
      .locator('input[placeholder="例如 20"]')
      .fill("15");

    await formSection.getByRole("button", { name: "提交记录" }).click();
    await page.waitForTimeout(1200);

    const recordCards = page.locator(".record-card");
    await expect(recordCards).toHaveCount(1);

    await expect(recordCards.first().locator("h3")).toContainText("冒烟测试草缸");
    await expect(recordCards.first().locator(".record-metrics")).toContainText("pH 6.8");
    await expect(recordCards.first().locator(".record-metrics")).toContainText("硝酸盐 15");
  });

  test("鱼缸档案区域UI应完整存在", async ({ page }) => {
    const tankSection = page.locator(".tank-profiles");
    await expect(tankSection.locator("h2")).toContainText("鱼缸档案");

    const addBtn = tankSection.locator("button", { hasText: "新增档案" }).first();
    await expect(addBtn).toBeVisible();

    const filterBtns = tankSection.locator(".chips").first().locator("button");
    await expect(filterBtns).toHaveCount(5);
  });
});

test.describe("应用冒烟测试 - 离线同步控制面板", () => {
  test.beforeEach(async ({ page }) => {
    await prepareTestPage(page, 99);
  });

  test("应显示离线同步控制面板", async ({ page }) => {
    const offlineSection = page.locator(".offline-maintenance-section");
    const sectionHeader = offlineSection.locator("h2").first();
    await expect(sectionHeader).toContainText("水族维护工作流");

    const syncPanel = offlineSection.locator(".sync-control-panel");
    await expect(syncPanel).toBeVisible({ timeout: 10000 });
    const panelHeader = syncPanel.locator("h2").first();
    await expect(panelHeader).toContainText("离线同步控制台");

    const demoBtn = syncPanel.locator("button", { hasText: "加载演示数据" });
    await expect(demoBtn).toBeVisible();
  });
});

test.describe("应用冒烟测试 - IndexedDB数据隔离验证", () => {
  test("第一个上下文录入数据不应影响第二个上下文", async ({ browser }) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    try {
      await prepareTestPage(page1, 1);

      const workspace1 = page1.locator(".workspace");
      const formSection1 = workspace1.locator(".panel").last();
      await formSection1
        .locator('input[placeholder="例如：草缸A"]')
        .fill("隔离测试缸ABC");

      await formSection1
        .locator('input[placeholder="例如 6.8"]')
        .fill("7.0");

      await formSection1.getByRole("button", { name: "提交记录" }).click();
      await page1.waitForTimeout(1500);

      const recordCards1 = page1.locator(".record-card");
      let foundTank = false;
      const count1 = await recordCards1.count();
      for (let i = 0; i < count1; i++) {
        const text = await recordCards1.nth(i).locator("h3").textContent();
        if (text && text.includes("隔离测试缸ABC")) {
          foundTank = true;
          break;
        }
      }
      expect(foundTank).toBe(true);
    } finally {
      await context1.close();
    }

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    try {
      await prepareTestPage(page2, 2);

      const recordCards = page2.locator(".record-card");
      const cardCount = await recordCards.count();
      if (cardCount === 0) {
        const emptyState = page2.locator(".records .empty-state h3");
        await expect(emptyState).toBeVisible({ timeout: 5000 });
      } else {
        for (let i = 0; i < cardCount; i++) {
          const text = await recordCards.nth(i).locator("h3").textContent();
          expect(text).not.toContain("隔离测试缸ABC");
        }
      }
    } finally {
      await context2.close();
    }
  });
});
