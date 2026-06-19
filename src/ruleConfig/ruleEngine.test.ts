import { describe, it, expect } from "vitest";
import {
  evaluateMetricValue,
  evaluateRecordStatus,
  getMetricRule,
} from "./ruleEngine";
import type { WaterMetrics, CustomThresholds, MetricRange } from "../db/types";
import type { TankType } from "./types";

describe("ruleEngine - 草缸阈值判定", () => {
  const tankType = "草缸";

  it("pH 在安全范围内应判定为稳定", () => {
    const result = evaluateMetricValue(tankType, "ph", "6.5");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("pH 略低于安全范围应判定为关注", () => {
    const result = evaluateMetricValue(tankType, "ph", "5.8");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });

  it("pH 远低于安全范围应判定为异常", () => {
    const result = evaluateMetricValue(tankType, "ph", "4.9");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });

  it("pH 略高于安全范围应判定为关注", () => {
    const result = evaluateMetricValue(tankType, "ph", "7.2");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });

  it("pH 远高于安全范围应判定为异常", () => {
    const result = evaluateMetricValue(tankType, "ph", "8.5");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });

  it("氨氮为 0 应判定为稳定", () => {
    const result = evaluateMetricValue(tankType, "ammonia", "0");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("氨氮在低值应判定为关注", () => {
    const result = evaluateMetricValue(tankType, "ammonia", "0.05");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });

  it("氨氮在关注上限内高值应判定为异常", () => {
    const result = evaluateMetricValue(tankType, "ammonia", "0.15");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });

  it("氨氮超出严重上限应判定为异常", () => {
    const result = evaluateMetricValue(tankType, "ammonia", "0.6");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });

  it("硝酸盐在安全范围内应判定为稳定", () => {
    const result = evaluateMetricValue(tankType, "nitrate", "15");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("硝酸盐在关注范围内应判定为关注", () => {
    const result = evaluateMetricValue(tankType, "nitrate", "30");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });

  it("硝酸盐超出严重上限应判定为异常", () => {
    const result = evaluateMetricValue(tankType, "nitrate", "65");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });

  it("温度在安全范围内应判定为稳定", () => {
    const result = evaluateMetricValue(tankType, "temperature", "26");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("温度在关注范围内应判定为关注", () => {
    const result = evaluateMetricValue(tankType, "temperature", "29");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });

  it("温度超出严重范围应判定为异常", () => {
    const result = evaluateMetricValue(tankType, "temperature", "35");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });

  it("硬度在安全范围内应判定为稳定", () => {
    const result = evaluateMetricValue(tankType, "hardness", "6");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("硬度在关注范围内应判定为关注", () => {
    const result = evaluateMetricValue(tankType, "hardness", "3");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });

  it("硬度超出严重范围应判定为异常", () => {
    const result = evaluateMetricValue(tankType, "hardness", "20");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });
});

describe("ruleEngine - 海缸阈值判定", () => {
  const tankType = "海缸";

  it("海缸 pH 在安全范围内应判定为稳定", () => {
    const result = evaluateMetricValue(tankType, "ph", "8.2");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("海缸 pH 低于安全范围应判定为关注", () => {
    const result = evaluateMetricValue(tankType, "ph", "7.9");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });

  it("海缸 pH 远低于安全范围应判定为异常", () => {
    const result = evaluateMetricValue(tankType, "ph", "7.5");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });

  it("海缸硝酸盐更严格，5ppm 内为稳定", () => {
    const result = evaluateMetricValue(tankType, "nitrate", "3");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("海缸硝酸盐 8ppm 应为关注", () => {
    const result = evaluateMetricValue(tankType, "nitrate", "8");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });

  it("海缸硝酸盐 25ppm 应为异常", () => {
    const result = evaluateMetricValue(tankType, "nitrate", "25");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });

  it("海缸氨氮阈值更严格，0.02 应为关注", () => {
    const result = evaluateMetricValue(tankType, "ammonia", "0.02");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });
});

describe("ruleEngine - 三湖缸阈值判定", () => {
  const tankType = "三湖缸";

  it("三湖缸 pH 偏好高碱性，8.2 应为稳定", () => {
    const result = evaluateMetricValue(tankType, "ph", "8.2");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("三湖缸 pH 9.0 应为关注", () => {
    const result = evaluateMetricValue(tankType, "ph", "9.0");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });

  it("三湖缸硬度偏高，15 应为稳定", () => {
    const result = evaluateMetricValue(tankType, "hardness", "15");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("三湖缸硝酸盐容忍度高，25 应为稳定", () => {
    const result = evaluateMetricValue(tankType, "nitrate", "25");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("三湖缸硝酸盐 70 应为关注", () => {
    const result = evaluateMetricValue(tankType, "nitrate", "70");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });
});

describe("ruleEngine - 繁殖缸阈值判定", () => {
  const tankType = "繁殖缸";

  it("繁殖缸 pH 中性偏弱酸，6.8 应为稳定", () => {
    const result = evaluateMetricValue(tankType, "ph", "6.8");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("繁殖缸氨氮要求极严，0.02 应为关注", () => {
    const result = evaluateMetricValue(tankType, "ammonia", "0.02");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });

  it("繁殖缸氨氮在关注区间内高值应为异常", () => {
    const result = evaluateMetricValue(tankType, "ammonia", "0.04");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });

  it("繁殖缸氨氮超出关注范围但在严重范围内应为关注", () => {
    const result = evaluateMetricValue(tankType, "ammonia", "0.1");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("关注");
    expect(result?.status).toBe("mild");
  });

  it("繁殖缸氨氮超出严重范围应为异常", () => {
    const result = evaluateMetricValue(tankType, "ammonia", "0.2");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });

  it("繁殖缸硝酸盐要求严格，5 应为稳定", () => {
    const result = evaluateMetricValue(tankType, "nitrate", "5");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });

  it("繁殖缸硝酸盐超出严重范围应为异常", () => {
    const result = evaluateMetricValue(tankType, "nitrate", "35");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("异常");
    expect(result?.status).toBe("severe");
  });

  it("繁殖缸硬度偏低，5 应为稳定", () => {
    const result = evaluateMetricValue(tankType, "hardness", "5");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
    expect(result?.status).toBe("ok");
  });
});

describe("ruleEngine - 无效值与边界", () => {
  it("空字符串应返回 null", () => {
    const result = evaluateMetricValue("草缸", "ph", "");
    expect(result).toBeNull();
  });

  it("非数值应返回 null", () => {
    const result = evaluateMetricValue("草缸", "ph", "abc");
    expect(result).toBeNull();
  });

  it("未知缸型应回退到草缸规则", () => {
    const result = evaluateMetricValue("未知缸型", "ph", "6.5");
    expect(result).not.toBeNull();
    expect(result?.recordStatus).toBe("稳定");
  });

  it("边界值 - 安全范围下限应为稳定", () => {
    const rule = getMetricRule("草缸", "ph");
    const result = evaluateMetricValue("草缸", "ph", String(rule.ok[0]));
    expect(result?.status).toBe("ok");
  });

  it("边界值 - 安全范围上限应为稳定", () => {
    const rule = getMetricRule("草缸", "ph");
    const result = evaluateMetricValue("草缸", "ph", String(rule.ok[1]));
    expect(result?.status).toBe("ok");
  });

  it("边界值 - 关注范围上限应为关注", () => {
    const rule = getMetricRule("草缸", "ph");
    const result = evaluateMetricValue("草缸", "ph", String(rule.watch[1] + 0.01));
    expect(result?.status).toBe("mild");
  });
});

describe("ruleEngine - 记录整体状态评估", () => {
  const emptyMetrics: WaterMetrics = {
    ph: "",
    ammonia: "",
    nitrite: "",
    nitrate: "",
    hardness: "",
    temperature: "",
    waterChange: "",
  };

  it("所有指标正常应判定为稳定", () => {
    const metrics: WaterMetrics = {
      ...emptyMetrics,
      ph: "6.5",
      ammonia: "0",
      nitrite: "0",
      nitrate: "10",
    };
    const result = evaluateRecordStatus(metrics, { tankType: "草缸" });
    expect(result.status).toBe("稳定");
    expect(result.note).toContain("正常");
  });

  it("单个指标关注应判定为关注", () => {
    const metrics: WaterMetrics = {
      ...emptyMetrics,
      ph: "5.8",
      ammonia: "0",
      nitrate: "10",
    };
    const result = evaluateRecordStatus(metrics, { tankType: "草缸" });
    expect(result.status).toBe("关注");
    expect(result.note).toContain("需关注");
  });

  it("单个指标异常应判定为异常", () => {
    const metrics: WaterMetrics = {
      ...emptyMetrics,
      ph: "4.5",
      ammonia: "0",
      nitrate: "10",
    };
    const result = evaluateRecordStatus(metrics, { tankType: "草缸" });
    expect(result.status).toBe("异常");
    expect(result.note).toContain("异常");
    expect(result.note).toContain("建议立即处理");
  });

  it("多个指标异常应判定为异常", () => {
    const metrics: WaterMetrics = {
      ...emptyMetrics,
      ph: "4.5",
      ammonia: "0.6",
      nitrate: "70",
    };
    const result = evaluateRecordStatus(metrics, { tankType: "草缸" });
    expect(result.status).toBe("异常");
  });

  it("关注加异常应判定为异常", () => {
    const metrics: WaterMetrics = {
      ...emptyMetrics,
      ph: "5.8",
      nitrate: "70",
    };
    const result = evaluateRecordStatus(metrics, { tankType: "草缸" });
    expect(result.status).toBe("异常");
  });

  it("无任何指标应判定为稳定", () => {
    const result = evaluateRecordStatus(emptyMetrics, { tankType: "草缸" });
    expect(result.status).toBe("稳定");
  });

  it("应使用指定缸型的规则", () => {
    const metrics: WaterMetrics = {
      ...emptyMetrics,
      ph: "8.2",
      nitrate: "8",
    };
    const resultSea = evaluateRecordStatus(metrics, { tankType: "海缸" });
    expect(resultSea.status).toBe("关注");

    const resultCichlid = evaluateRecordStatus(metrics, { tankType: "三湖缸" });
    expect(resultCichlid.status).toBe("稳定");
  });

  it("备注中应包含换水量信息（有异常时）", () => {
    const metrics: WaterMetrics = {
      ...emptyMetrics,
      ph: "5.0",
      waterChange: "30%",
    };
    const result = evaluateRecordStatus(metrics, { tankType: "草缸" });
    expect(result.note).toContain("本次换水");
    expect(result.note).toContain("30%");
  });

  it("全部指标正常时备注不含换水信息", () => {
    const metrics: WaterMetrics = {
      ...emptyMetrics,
      ph: "6.5",
      waterChange: "30%",
    };
    const result = evaluateRecordStatus(metrics, { tankType: "草缸" });
    expect(result.status).toBe("稳定");
    expect(result.note).toContain("正常");
  });
});

describe("ruleEngine - 自定义阈值", () => {
  it("自定义 pH 阈值应覆盖默认规则", () => {
    const customThresholds: CustomThresholds = {
      ph: { ok: [6.5, 7.5] as MetricRange["ok"], watch: [6.0, 8.0] as MetricRange["watch"] },
    };
    const result = evaluateMetricValue("草缸", "ph", "7.2", customThresholds);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("ok");
  });

  it("自定义阈值外应判定为关注", () => {
    const customThresholds: CustomThresholds = {
      ph: { ok: [6.5, 7.5] as MetricRange["ok"], watch: [6.0, 8.0] as MetricRange["watch"] },
    };
    const result = evaluateMetricValue("草缸", "ph", "7.8", customThresholds);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("mild");
  });

  it("自定义硝酸盐阈值应生效", () => {
    const customThresholds: CustomThresholds = {
      nitrate: { ok: [0, 30] as MetricRange["ok"], watch: [0, 50] as MetricRange["watch"] },
    };
    const result = evaluateMetricValue("草缸", "nitrate", "25", customThresholds);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("ok");
  });

  it("记录评估应支持自定义阈值", () => {
    const customThresholds: CustomThresholds = {
      ph: { ok: [7.0, 8.0] as MetricRange["ok"], watch: [6.5, 8.5] as MetricRange["watch"] },
    };
    const metrics: WaterMetrics = {
      ph: "7.5",
      ammonia: "0",
      nitrite: "",
      nitrate: "",
      hardness: "",
      temperature: "",
      waterChange: "",
    };
    const result = evaluateRecordStatus(metrics, {
      tankType: "草缸",
      customThresholds,
    });
    expect(result.status).toBe("稳定");
  });
});

describe("ruleEngine - 不同缸型阈值差异验证", () => {
  const metrics: Record<string, number> = {
    ph: 0,
    ammonia: 0,
    nitrite: 0,
    nitrate: 0,
    hardness: 0,
    temperature: 0,
  };

  it("各缸型 pH 安全范围不同", () => {
    const tankTypes: TankType[] = ["草缸", "海缸", "三湖缸", "繁殖缸"];
    const phRanges = tankTypes.map((t) => getMetricRule(t, "ph").ok);
    expect(phRanges[0]).toEqual([6.0, 7.0]);
    expect(phRanges[1]).toEqual([8.0, 8.4]);
    expect(phRanges[2]).toEqual([7.8, 8.6]);
    expect(phRanges[3]).toEqual([6.5, 7.2]);
  });

  it("繁殖缸氨氮阈值最严格", () => {
    const tankTypes: TankType[] = ["草缸", "海缸", "三湖缸", "繁殖缸"];
    const ammoniaWatchMax = tankTypes.map((t) => getMetricRule(t, "ammonia").watch[1]);
    expect(Math.min(...ammoniaWatchMax)).toBe(ammoniaWatchMax[3]);
  });

  it("三湖缸硝酸盐容忍度最高", () => {
    const tankTypes: TankType[] = ["草缸", "海缸", "三湖缸", "繁殖缸"];
    const nitrateOkMax = tankTypes.map((t) => getMetricRule(t, "nitrate").ok[1]);
    expect(Math.max(...nitrateOkMax)).toBe(nitrateOkMax[2]);
  });

  it("海缸硝酸盐阈值最严格", () => {
    const tankTypes: TankType[] = ["草缸", "海缸", "三湖缸", "繁殖缸"];
    const nitrateOkMax = tankTypes.map((t) => getMetricRule(t, "nitrate").ok[1]);
    expect(Math.min(...nitrateOkMax)).toBe(nitrateOkMax[1]);
  });
});
