import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assessTankRisk, getRiskLevelColor, getRiskLevelBgClass } from "./riskEngine";
import type { TankRiskContext } from "./types";
import type { TankProfile, WaterRecord, WaterChangePlan } from "../db/types";
import { setFixedDate, resetFixedDate } from "../test/setup";

function createBaseTank(overrides: Partial<TankProfile> = {}): TankProfile {
  return {
    id: "tank-1",
    name: "测试草缸",
    tankType: "草缸",
    capacity: "100L",
    setupDate: "2025-01-01",
    mainCreatures: "红绿灯、莫斯",
    maintainer: "测试员",
    ...overrides,
  };
}

function createWaterRecord(
  recordedAt: string,
  metrics: Partial<WaterRecord["metrics"]> = {},
  overrides: Partial<WaterRecord> = {}
): WaterRecord {
  return {
    id: `rec-${recordedAt}`,
    tankName: "测试草缸",
    tankId: "tank-1",
    recordedAt,
    metrics: {
      ph: "6.5",
      ammonia: "0",
      nitrite: "0",
      nitrate: "10",
      hardness: "8",
      temperature: "26",
      waterChange: "",
      ...metrics,
    },
    status: "稳定",
    note: "",
    ...overrides,
  };
}

function createBaseContext(overrides: Partial<TankRiskContext> = {}): TankRiskContext {
  return {
    tank: createBaseTank(),
    records: [],
    plans: [],
    alerts: [],
    ...overrides,
  };
}

describe("riskEngine - 低风险正常场景", () => {
  it("无任何记录应判定为低风险", () => {
    const result = assessTankRisk(createBaseContext());
    expect(result.riskLevel).toBe("低风险");
    expect(result.recordStatus).toBe("稳定");
    expect(result.totalScore).toBe(0);
    expect(result.factors).toHaveLength(0);
  });

  it("所有指标在安全范围应判定为低风险", () => {
    const ctx = createBaseContext({
      records: [createWaterRecord("2026-06-14 09:00")],
    });
    const result = assessTankRisk(ctx);
    expect(result.riskLevel).toBe("低风险");
    expect(result.recordStatus).toBe("稳定");
    expect(result.factors).toHaveLength(0);
    expect(result.lowRiskReasons).toBeDefined();
    expect(result.lowRiskReasons!.length).toBeGreaterThan(0);
  });
});

describe("riskEngine - 单指标阈值超标", () => {
  it("pH 严重超标应产生严重风险因素", () => {
    const ctx = createBaseContext({
      records: [
        createWaterRecord("2026-06-14 09:00", { ph: "4.5" }),
      ],
    });
    const result = assessTankRisk(ctx);
    expect(result.factors.some((f) => f.type === "single_threshold")).toBe(true);
    const phFactor = result.factors.find(
      (f) => f.type === "single_threshold" && f.metric === "ph"
    );
    expect(phFactor?.severity).toBe("severe");
  });

  it("pH 轻微超标应产生轻度风险因素", () => {
    const ctx = createBaseContext({
      records: [
        createWaterRecord("2026-06-14 09:00", { ph: "5.8" }),
      ],
    });
    const result = assessTankRisk(ctx);
    const phFactor = result.factors.find(
      (f) => f.type === "single_threshold" && f.metric === "ph"
    );
    expect(phFactor?.severity).toBe("mild");
  });
});

describe("riskEngine - 长期未换水检测（依赖日期时间）", () => {
  beforeEach(() => {
    setFixedDate("2026-06-15T10:30:00.000Z");
  });

  afterEach(() => {
    resetFixedDate();
  });

  it("7天内刚换过水不应触发长期未换水", () => {
    const ctx = createBaseContext({
      records: [
        createWaterRecord("2026-06-10 09:00", { waterChange: "30%" }),
        createWaterRecord("2026-06-14 09:00"),
      ],
    });
    const result = assessTankRisk(ctx);
    expect(result.factors.some((f) => f.type === "no_water_change_long")).toBe(false);
  });

  it("20天未换水应触发严重的长期未换水", () => {
    const ctx = createBaseContext({
      records: [
        createWaterRecord("2026-05-25 09:00", { waterChange: "30%" }),
        createWaterRecord("2026-06-14 09:00"),
      ],
    });
    const result = assessTankRisk(ctx);
    const factor = result.factors.find((f) => f.type === "no_water_change_long");
    expect(factor).toBeDefined();
    expect(factor?.severity).toBe("severe");
  });

  it("换水计划逾期应放大风险", () => {
    const ctx = createBaseContext({
      records: [
        createWaterRecord("2026-05-30 09:00", { waterChange: "30%" }),
        createWaterRecord("2026-06-14 09:00"),
      ],
      plans: [
        {
          id: "plan-1",
          tankName: "测试草缸",
          tankId: "tank-1",
          cycleDays: "7",
          waterRatio: "30%",
          nextDate: "2026-06-10",
          note: "",
          createdAt: "2026-06-01",
        } as WaterChangePlan,
      ],
    });
    const result = assessTankRisk(ctx);
    const factor = result.factors.find((f) => f.type === "no_water_change_long");
    expect(factor?.severity).toBe("severe");
    expect(factor?.description).toContain("逾期");
  });
});

describe("riskEngine - 连续上升趋势检测", () => {
  it("硝酸盐连续5次上升应触发连续上升因素", () => {
    const records: WaterRecord[] = [
      createWaterRecord("2026-06-01 09:00", { nitrate: "5" }),
      createWaterRecord("2026-06-04 09:00", { nitrate: "8" }),
      createWaterRecord("2026-06-07 09:00", { nitrate: "12" }),
      createWaterRecord("2026-06-10 09:00", { nitrate: "16" }),
      createWaterRecord("2026-06-13 09:00", { nitrate: "22" }),
    ];
    const ctx = createBaseContext({ records });
    const result = assessTankRisk(ctx);
    expect(result.factors.some((f) => f.type === "continuous_rise")).toBe(true);
  });

  it("3次检测且波动不应触发连续上升", () => {
    const records: WaterRecord[] = [
      createWaterRecord("2026-06-01 09:00", { nitrate: "10" }),
      createWaterRecord("2026-06-07 09:00", { nitrate: "8" }),
      createWaterRecord("2026-06-13 09:00", { nitrate: "12" }),
    ];
    const ctx = createBaseContext({ records });
    const result = assessTankRisk(ctx);
    expect(result.factors.some((f) => f.type === "continuous_rise")).toBe(false);
  });
});

describe("riskEngine - 剧烈波动检测", () => {
  it("pH多次上下交替应触发剧烈波动", () => {
    const records: WaterRecord[] = [
      createWaterRecord("2026-06-01 09:00", { ph: "6.5" }),
      createWaterRecord("2026-06-03 09:00", { ph: "7.2" }),
      createWaterRecord("2026-06-05 09:00", { ph: "5.8" }),
      createWaterRecord("2026-06-07 09:00", { ph: "7.0" }),
      createWaterRecord("2026-06-09 09:00", { ph: "5.5" }),
    ];
    const ctx = createBaseContext({ records });
    const result = assessTankRisk(ctx);
    expect(result.factors.some((f) => f.type === "rapid_fluctuation")).toBe(true);
  });
});

describe("riskEngine - 多项异常放大", () => {
  it("2项严重超标应触发多项异常", () => {
    const ctx = createBaseContext({
      records: [
        createWaterRecord("2026-06-14 09:00", {
          ph: "5.0",
          ammonia: "0.6",
          nitrate: "70",
        }),
      ],
    });
    const result = assessTankRisk(ctx);
    expect(result.factors.some((f) => f.type === "multiple_abnormal_metrics")).toBe(true);
    expect(result.riskLevel).toBe("严重风险");
  });
});

describe("riskEngine - 小水体敏感放大", () => {
  it("50L以下小缸+异常指标应触发水体敏感", () => {
    const ctx = createBaseContext({
      tank: createBaseTank({ capacity: "30L" }),
      records: [
        createWaterRecord("2026-06-14 09:00", { ph: "5.5" }),
      ],
    });
    const result = assessTankRisk(ctx);
    expect(result.factors.some((f) => f.type === "capacity_sensitivity")).toBe(true);
  });

  it("大缸+正常指标不应触发水体敏感", () => {
    const ctx = createBaseContext({
      tank: createBaseTank({ capacity: "200L" }),
      records: [
        createWaterRecord("2026-06-14 09:00"),
      ],
    });
    const result = assessTankRisk(ctx);
    expect(result.factors.some((f) => f.type === "capacity_sensitivity")).toBe(false);
  });

  it("海缸（高风险缸型）+异常应触发水体敏感", () => {
    const ctx = createBaseContext({
      tank: createBaseTank({ tankType: "海缸", capacity: "100L" }),
      records: [
        createWaterRecord("2026-06-14 09:00", { ph: "7.5" }),
      ],
    });
    const result = assessTankRisk(ctx);
    expect(result.factors.some((f) => f.type === "capacity_sensitivity")).toBe(true);
  });
});

describe("riskEngine - 缸型规则差异", () => {
  it("相同pH值在草缸和海缸应产生不同判定", () => {
    const grassRecords = [createWaterRecord("2026-06-14 09:00", { ph: "8.2" })];
    const seaRecords = [createWaterRecord("2026-06-14 09:00", { ph: "8.2" })];

    const grassResult = assessTankRisk(
      createBaseContext({ tank: createBaseTank({ tankType: "草缸" }), records: grassRecords })
    );
    const seaResult = assessTankRisk(
      createBaseContext({ tank: createBaseTank({ tankType: "海缸" }), records: seaRecords })
    );

    const grassFactor = grassResult.factors.find(
      (f) => f.type === "single_threshold" && f.metric === "ph"
    );
    const seaFactor = seaResult.factors.find(
      (f) => f.type === "single_threshold" && f.metric === "ph"
    );

    expect(grassFactor).toBeDefined();
    expect(seaFactor).toBeUndefined();
  });
});

describe("riskEngine - 辅助函数", () => {
  it("getRiskLevelColor 应返回对应颜色", () => {
    expect(getRiskLevelColor("低风险")).toBe("#16a34a");
    expect(getRiskLevelColor("中风险")).toBe("#f59e0b");
    expect(getRiskLevelColor("高风险")).toBe("#ea580c");
    expect(getRiskLevelColor("严重风险")).toBe("#dc2626");
  });

  it("getRiskLevelBgClass 应返回对应样式类", () => {
    expect(getRiskLevelBgClass("低风险")).toBe("risk-low");
    expect(getRiskLevelBgClass("中风险")).toBe("risk-medium");
    expect(getRiskLevelBgClass("高风险")).toBe("risk-high");
    expect(getRiskLevelBgClass("严重风险")).toBe("risk-severe");
  });
});

describe("riskEngine - 建议生成", () => {
  it("全部正常应生成保持建议", () => {
    const ctx = createBaseContext({
      records: [createWaterRecord("2026-06-14 09:00")],
    });
    const result = assessTankRisk(ctx);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.some((r) => r.includes("保持"))).toBe(true);
  });

  it("长期未换水应建议换水", () => {
    setFixedDate("2026-06-15T10:30:00.000Z");
    const ctx = createBaseContext({
      records: [
        createWaterRecord("2026-05-20 09:00", { waterChange: "30%" }),
        createWaterRecord("2026-06-14 09:00"),
      ],
    });
    const result = assessTankRisk(ctx);
    expect(result.recommendations.some((r) => r.includes("换水"))).toBe(true);
  });

  it("繁殖缸应额外提示繁殖期注意", () => {
    const ctx = createBaseContext({
      tank: createBaseTank({ tankType: "繁殖缸", capacity: "50L" }),
      records: [
        createWaterRecord("2026-06-14 09:00", { ph: "5.5" }),
      ],
    });
    const result = assessTankRisk(ctx);
    expect(result.recommendations.some((r) => r.includes("繁殖"))).toBe(true);
  });
});
