import {
  RiskAssessmentResult,
  RiskFactor,
  RiskLevel,
  TankRiskContext,
  getRiskLevelThresholds,
  getRiskScoreConfig,
  RiskFactorType,
} from "./types";
import type {
  RecordStatus,
  WaterMetrics,
  WaterRecord,
  TankProfile,
  WaterChangePlan,
} from "../db/types";
import type { AlertItem, TankType, AlertMetric } from "../alertCenter/types";
import {
  evaluateMetricValue,
  getMetricThreshold,
  getAlertMetricKeys,
} from "../alertCenter/thresholdConfig";

const METRIC_LABELS: Record<AlertMetric, string> = {
  ph: "pH",
  ammonia: "氨氮",
  nitrite: "亚硝酸盐",
  nitrate: "硝酸盐",
  hardness: "硬度",
  temperature: "温度",
};

const ALERT_METRIC_KEYS = getAlertMetricKeys();

function parseCapacityLiters(capacity: string): number | null {
  if (!capacity) return null;
  const match = capacity.match(/(\d+(?:\.\d+)?)\s*L/i);
  if (match) return parseFloat(match[1]);
  const cmMatch = capacity.match(/(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)\s*cm/i);
  if (cmMatch) {
    const w = parseFloat(cmMatch[1]);
    const d = parseFloat(cmMatch[2]);
    const h = parseFloat(cmMatch[3]);
    return Math.round((w * d * h) / 1000);
  }
  const numMatch = capacity.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) return parseFloat(numMatch[1]);
  return null;
}

function isSmallTank(tank: TankProfile): boolean {
  const liters = parseCapacityLiters(tank.capacity);
  return liters !== null && liters <= 50;
}

function isHighRiskTankType(tankType: string): boolean {
  return tankType === "繁殖缸" || tankType === "海缸";
}

function getSortedRecords(records: WaterRecord[]): WaterRecord[] {
  return [...records].sort(
    (a, b) =>
      new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
}

function getMetricValue(record: WaterRecord, metric: AlertMetric): number | null {
  const raw = record.metrics[metric];
  if (!raw || !raw.trim()) return null;
  const val = parseFloat(raw);
  return isNaN(val) ? null : val;
}

function detectContinuousRise(
  sortedRecords: WaterRecord[],
  metric: AlertMetric,
  tankType: TankType | string
): RiskFactor | null {
  const values: { date: Date; value: number }[] = [];
  for (const rec of sortedRecords) {
    const v = getMetricValue(rec, metric);
    if (v !== null) {
      values.push({ date: new Date(rec.recordedAt), value: v });
    }
  }

  if (values.length < 3) return null;

  const recent = values.slice(-5);
  if (recent.length < 3) return null;

  let riseCount = 0;
  let totalRise = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i].value - recent[i - 1].value;
    if (diff > 0) {
      riseCount++;
      totalRise += diff;
    }
  }

  const threshold = getMetricThreshold(tankType, metric);
  const rangeSpan = threshold.watch[1] - threshold.watch[0] || 1;
  const relativeRise = totalRise / rangeSpan;

  const consecutiveRises = riseCount >= recent.length - 1;
  const significantRise = relativeRise >= 0.15;

  if (consecutiveRises && significantRise) {
    const isSevere = relativeRise >= 0.3 || totalRise >= rangeSpan * 0.25;
    return {
      type: "continuous_rise",
      severity: isSevere ? "severe" : "mild",
      metric,
      metricLabel: METRIC_LABELS[metric],
      description: `${METRIC_LABELS[metric]}连续${recent.length}次检测呈上升趋势`,
      score: isSevere
        ? getRiskScoreConfig().continuous_rise_severe
        : getRiskScoreConfig().continuous_rise_mild,
      evidence: `近${recent.length}次：${recent
        .map((v) => v.value)
        .join(" → ")}`,
    };
  }

  return null;
}

function detectRapidFluctuation(
  sortedRecords: WaterRecord[],
  metric: AlertMetric,
  tankType: TankType | string
): RiskFactor | null {
  const values: { date: Date; value: number }[] = [];
  for (const rec of sortedRecords) {
    const v = getMetricValue(rec, metric);
    if (v !== null) {
      values.push({ date: new Date(rec.recordedAt), value: v });
    }
  }

  if (values.length < 4) return null;

  const recent = values.slice(-7);
  if (recent.length < 4) return null;

  let upDownChanges = 0;
  for (let i = 2; i < recent.length; i++) {
    const prevDiff = recent[i - 1].value - recent[i - 2].value;
    const currDiff = recent[i].value - recent[i - 1].value;
    if (prevDiff !== 0 && currDiff !== 0 && Math.sign(prevDiff) !== Math.sign(currDiff)) {
      upDownChanges++;
    }
  }

  const threshold = getMetricThreshold(tankType, metric);
  const rangeSpan = threshold.watch[1] - threshold.watch[0] || 1;
  const maxVal = Math.max(...recent.map((v) => v.value));
  const minVal = Math.min(...recent.map((v) => v.value));
  const totalVariation = maxVal - minVal;
  const relativeVariation = totalVariation / rangeSpan;

  const hasMultipleSwings = upDownChanges >= 2;
  const hasLargeVariation = relativeVariation >= 0.2;

  if (hasMultipleSwings && hasLargeVariation) {
    const isSevere = relativeVariation >= 0.4 || upDownChanges >= 3;
    return {
      type: "rapid_fluctuation",
      severity: isSevere ? "severe" : "mild",
      metric,
      metricLabel: METRIC_LABELS[metric],
      description: `${METRIC_LABELS[metric]}近期波动剧烈，水质不稳定`,
      score: isSevere
        ? getRiskScoreConfig().rapid_fluctuation_severe
        : getRiskScoreConfig().rapid_fluctuation_mild,
      evidence: `近${recent.length}次波动幅度：${minVal} ~ ${maxVal}，上下交替${upDownChanges}次`,
    };
  }

  return null;
}

function detectNoWaterChangeLong(
  sortedRecords: WaterRecord[],
  plans: WaterChangePlan[]
): RiskFactor | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let lastWaterChangeDate: Date | null = null;
  for (let i = sortedRecords.length - 1; i >= 0; i--) {
    const rec = sortedRecords[i];
    if (rec.metrics.waterChange && rec.metrics.waterChange.trim()) {
      lastWaterChangeDate = new Date(rec.recordedAt);
      break;
    }
  }

  const overduePlans = plans.filter((p) => {
    if (p.completedAt) return false;
    const next = new Date(p.nextDate);
    next.setHours(0, 0, 0, 0);
    return next.getTime() < today.getTime();
  });

  let daysSinceChange: number | null = null;
  if (lastWaterChangeDate) {
    lastWaterChangeDate.setHours(0, 0, 0, 0);
    daysSinceChange = Math.floor(
      (today.getTime() - lastWaterChangeDate.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const hasOverduePlan = overduePlans.length > 0;
  const maxDaysWithoutChange = 14;
  const criticalDays = 21;

  if (daysSinceChange !== null && daysSinceChange >= maxDaysWithoutChange) {
    const isSevere = daysSinceChange >= criticalDays || hasOverduePlan;
    return {
      type: "no_water_change_long",
      severity: isSevere ? "severe" : "mild",
      description: `已${daysSinceChange}天未换水${
        hasOverduePlan ? "，且换水计划已逾期" : ""
      }`,
      score: isSevere
        ? getRiskScoreConfig().no_water_change_severe
        : getRiskScoreConfig().no_water_change_mild,
      evidence: `上次换水：${
        lastWaterChangeDate
          ? `${lastWaterChangeDate.getFullYear()}-${String(
              lastWaterChangeDate.getMonth() + 1
            ).padStart(2, "0")}-${String(lastWaterChangeDate.getDate()).padStart(
              2,
              "0"
            )}`
          : "无记录"
      }`,
    };
  }

  if (hasOverduePlan && daysSinceChange === null) {
    return {
      type: "no_water_change_long",
      severity: "mild",
      description: `换水计划已逾期，建议尽快换水`,
      score: getRiskScoreConfig().no_water_change_mild,
      evidence: `逾期计划：${overduePlans.length}个`,
    };
  }

  return null;
}

function detectRetestStillAbnormal(
  sortedRecords: WaterRecord[],
  alerts: AlertItem[],
  tankType: TankType | string
): RiskFactor[] {
  const factors: RiskFactor[] = [];
  if (sortedRecords.length < 2) return factors;

  const retestAlerts = alerts.filter(
    (a) => a.status === "processed" && a.treatment === "复测"
  );

  for (const metric of ALERT_METRIC_KEYS) {
    const recentRecords = sortedRecords.slice(-5);
    const abnormalRecords: WaterRecord[] = [];

    for (const rec of recentRecords) {
      const v = getMetricValue(rec, metric);
      if (v === null) continue;
      const evalResult = evaluateMetricValue(
        tankType,
        metric,
        String(v)
      );
      if (evalResult && evalResult.status !== "ok") {
        abnormalRecords.push(rec);
      }
    }

    const metricRetestAlerts = retestAlerts.filter((a) => a.metric === metric);
    const hasRetest = metricRetestAlerts.length > 0;

    let abnormalAfterRetestCount = 0;
    if (hasRetest) {
      const lastRetestTime = Math.max(
        ...metricRetestAlerts.map((a) =>
          new Date(a.processedAt || a.createdAt).getTime()
        )
      );
      abnormalAfterRetestCount = abnormalRecords.filter(
        (r) => new Date(r.recordedAt).getTime() >= lastRetestTime
      ).length;
    }

    const meetsThreshold = abnormalRecords.length >= 2 || abnormalAfterRetestCount >= 1;
    if (meetsThreshold) {
      const isSevere =
        abnormalRecords.length >= 3 ||
        abnormalAfterRetestCount >= 1 ||
        (hasRetest && abnormalRecords.length >= 2);

      let evidenceParts: string[] = [];
      if (hasRetest) {
        evidenceParts.push(`复测${metricRetestAlerts.length}次`);
        if (abnormalAfterRetestCount > 0) {
          evidenceParts.push(`复测后仍有${abnormalAfterRetestCount}次异常`);
        }
      }
      evidenceParts.push(
        `近${recentRecords.length}次检测中有${abnormalRecords.length}次异常`
      );

      factors.push({
        type: "retest_still_abnormal",
        severity: isSevere ? "severe" : "mild",
        metric,
        metricLabel: METRIC_LABELS[metric],
        description: `${METRIC_LABELS[metric]}经过${
          hasRetest ? "复测处理" : "多次检测"
        }后仍持续异常`,
        score: isSevere
          ? getRiskScoreConfig().retest_still_abnormal_severe
          : getRiskScoreConfig().retest_still_abnormal_mild,
        evidence: evidenceParts.join("，"),
      });
    }
  }

  return factors;
}

function detectSingleThresholdAbnormalities(
  latestRecord: WaterRecord | undefined,
  tankType: TankType | string
): RiskFactor[] {
  const factors: RiskFactor[] = [];
  if (!latestRecord) return factors;

  for (const metric of ALERT_METRIC_KEYS) {
    const raw = latestRecord.metrics[metric];
    if (!raw || !raw.trim()) continue;

    const evalResult = evaluateMetricValue(tankType, metric, raw);
    if (!evalResult || evalResult.status === "ok") continue;

    const isSevere = evalResult.status === "severe";
    factors.push({
      type: "single_threshold",
      severity: isSevere ? "severe" : "mild",
      metric,
      metricLabel: METRIC_LABELS[metric],
      description: `${METRIC_LABELS[metric]} ${raw}${
        evalResult.rule.unit
      } ${isSevere ? "严重" : "轻微"}超标`,
      score: isSevere
        ? getRiskScoreConfig().single_threshold_severe
        : getRiskScoreConfig().single_threshold_mild,
      evidence: `安全范围：${evalResult.rule.ok[0]}~${evalResult.rule.ok[1]}${evalResult.rule.unit}`,
    });
  }

  return factors;
}

function detectCapacitySensitivity(
  tank: TankProfile,
  abnormalFactors: RiskFactor[]
): RiskFactor | null {
  if (abnormalFactors.length === 0) return null;
  if (!isSmallTank(tank) && !isHighRiskTankType(tank.tankType)) return null;

  const parts: string[] = [];
  if (isSmallTank(tank)) {
    const liters = parseCapacityLiters(tank.capacity);
    parts.push(`小水体(${liters}L)容错率低`);
  }
  if (isHighRiskTankType(tank.tankType)) {
    parts.push(`${tank.tankType}对水质要求高`);
  }

  return {
    type: "capacity_sensitivity",
    severity: "mild",
    description: parts.join("，") + "，异常影响被放大",
    score: getRiskScoreConfig().capacity_sensitivity,
  };
}

function detectMultipleAbnormalMetrics(
  singleFactors: RiskFactor[]
): RiskFactor | null {
  const severeCount = singleFactors.filter((f) => f.severity === "severe").length;
  const mildCount = singleFactors.filter((f) => f.severity === "mild").length;

  if (severeCount >= 2 || severeCount + mildCount >= 3) {
    const isSevere = severeCount >= 2 || severeCount + mildCount >= 4;
    return {
      type: "multiple_abnormal_metrics",
      severity: isSevere ? "severe" : "mild",
      description: `同时有${severeCount + mildCount}项指标异常(${severeCount}项严重)`,
      score: isSevere
        ? getRiskScoreConfig().multiple_metrics_bonus * 2
        : getRiskScoreConfig().multiple_metrics_bonus,
      evidence: singleFactors
        .map((f) => `${f.metricLabel}${f.severity === "severe" ? "(重)" : "(轻)"}`)
        .join("、"),
    };
  }
  return null;
}

function calculateRiskLevel(totalScore: number): RiskLevel {
  if (totalScore >= getRiskLevelThresholds().high) return "严重风险";
  if (totalScore >= getRiskLevelThresholds().medium) return "高风险";
  if (totalScore >= getRiskLevelThresholds().low) return "中风险";
  return "低风险";
}

function mapRiskToRecordStatus(riskLevel: RiskLevel): RecordStatus {
  switch (riskLevel) {
    case "严重风险":
    case "高风险":
      return "异常";
    case "中风险":
      return "关注";
    case "低风险":
    default:
      return "稳定";
  }
}

function generateRecommendations(
  factors: RiskFactor[],
  tank: TankProfile
): string[] {
  const recs: string[] = [];
  const factorTypes = new Set(factors.map((f) => f.type));

  if (factorTypes.has("single_threshold") || factorTypes.has("retest_still_abnormal")) {
    recs.push("立即检测各项水质指标，确认超标项");
  }
  if (factorTypes.has("no_water_change_long")) {
    recs.push("尽快执行换水，建议换水量30%-50%");
  }
  if (factorTypes.has("continuous_rise")) {
    recs.push("密切监测上升趋势指标，排查污染源");
  }
  if (factorTypes.has("rapid_fluctuation")) {
    recs.push("稳定水质，避免大幅度换水或温度变化");
  }
  if (factorTypes.has("multiple_abnormal_metrics")) {
    recs.push("综合诊断，检查过滤系统和生物负载");
  }
  if (isSmallTank(tank)) {
    recs.push("小水体建议增加换水频率，少量多次");
  }
  if (tank.tankType === "繁殖缸") {
    recs.push("繁殖期水质需格外注意，避免影响鱼苗存活");
  }
  if (tank.tankType === "海缸") {
    recs.push("海缸注意补充微量元素，维持KH稳定");
  }

  if (recs.length === 0) {
    recs.push("水质良好，继续保持定期检测和维护");
  }

  return recs.slice(0, 5);
}

function generateSummary(factors: RiskFactor[], riskLevel: RiskLevel): string {
  if (factors.length === 0) {
    return "各项指标正常，水质稳定";
  }

  const mainFactors = factors.slice(0, 3);
  const descriptions = mainFactors.map((f) => {
    if (f.metricLabel) {
      return `${f.metricLabel}${
        f.severity === "severe" ? "严重" : ""
      }${describeFactorType(f.type)}`;
    }
    return f.description;
  });

  return `风险等级【${riskLevel}】：${descriptions.join("；")}${
    factors.length > 3 ? ` 等${factors.length}项问题` : ""
  }`;
}

function generateLowRiskReasons(
  context: TankRiskContext,
  sortedRecords: WaterRecord[]
): string[] {
  const reasons: string[] = [];
  const { tank, plans, alerts } = context;
  const latestRecord = sortedRecords[sortedRecords.length - 1];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (latestRecord) {
    let allMetricsOk = true;
    const checkedMetrics: string[] = [];
    for (const metric of ALERT_METRIC_KEYS) {
      const raw = latestRecord.metrics[metric];
      if (raw && raw.trim()) {
        const evalResult = evaluateMetricValue(
          tank.tankType as TankType | string,
          metric,
          raw
        );
        if (evalResult && evalResult.status !== "ok") {
          allMetricsOk = false;
          break;
        }
        checkedMetrics.push(METRIC_LABELS[metric]);
      }
    }
    if (allMetricsOk && checkedMetrics.length > 0) {
      reasons.push(`${checkedMetrics.join("、")}指标均在安全范围内`);
    }
  }

  let lastWaterChangeDate: Date | null = null;
  for (let i = sortedRecords.length - 1; i >= 0; i--) {
    const rec = sortedRecords[i];
    if (rec.metrics.waterChange && rec.metrics.waterChange.trim()) {
      lastWaterChangeDate = new Date(rec.recordedAt);
      break;
    }
  }
  if (lastWaterChangeDate) {
    lastWaterChangeDate.setHours(0, 0, 0, 0);
    const daysSinceChange = Math.floor(
      (today.getTime() - lastWaterChangeDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceChange <= 7) {
      reasons.push(`最近${daysSinceChange === 0 ? "今天" : daysSinceChange + "天内"}刚换过水`);
    } else if (daysSinceChange <= 14) {
      reasons.push(`上次换水在${daysSinceChange}天前，周期正常`);
    }
  }

  const overduePlans = plans.filter((p) => {
    if (p.completedAt) return false;
    const next = new Date(p.nextDate);
    next.setHours(0, 0, 0, 0);
    return next.getTime() < today.getTime();
  });
  if (overduePlans.length === 0) {
    const upcomingPlans = plans.filter((p) => {
      if (p.completedAt) return false;
      const next = new Date(p.nextDate);
      next.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil(
        (next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return diffDays >= 0 && diffDays <= 7;
    });
    if (plans.length > 0) {
      reasons.push(
        upcomingPlans.length > 0
          ? `换水计划正常，近7天内有${upcomingPlans.length}次计划`
          : "无逾期换水计划"
      );
    }
  }

  const pendingAlerts = alerts.filter((a) => a.status === "pending");
  if (pendingAlerts.length === 0) {
    reasons.push("暂无待处理的异常提醒");
  }

  if (sortedRecords.length >= 2) {
    const recentRecords = sortedRecords.slice(-5);
    let hasStableTrend = true;
    for (const metric of ALERT_METRIC_KEYS) {
      const values: number[] = [];
      for (const rec of recentRecords) {
        const v = getMetricValue(rec, metric);
        if (v !== null) values.push(v);
      }
      if (values.length >= 3) {
        const hasRise = detectContinuousRise(
          sortedRecords,
          metric,
          tank.tankType as TankType | string
        );
        const hasFluct = detectRapidFluctuation(
          sortedRecords,
          metric,
          tank.tankType as TankType | string
        );
        if (hasRise || hasFluct) {
          hasStableTrend = false;
          break;
        }
      }
    }
    if (hasStableTrend && sortedRecords.length >= 3) {
      reasons.push("近期水质趋势平稳，无持续上升或剧烈波动");
    }
  }

  if (reasons.length === 0) {
    reasons.push("当前未检测到异常风险因素");
  }

  return reasons.slice(0, 5);
}

function describeFactorType(type: RiskFactorType): string {
  switch (type) {
    case "single_threshold":
      return "超标";
    case "continuous_rise":
      return "持续升高";
    case "rapid_fluctuation":
      return "波动剧烈";
    case "no_water_change_long":
      return "长期未换水";
    case "retest_still_abnormal":
      return "复测仍异常";
    case "capacity_sensitivity":
      return "水体敏感";
    case "multiple_abnormal_metrics":
      return "多项异常";
    default:
      return "异常";
  }
}

export function assessTankRisk(context: TankRiskContext): RiskAssessmentResult {
  const { tank, records, plans, alerts } = context;
  const sortedRecords = getSortedRecords(records);
  const latestRecord = sortedRecords[sortedRecords.length - 1];
  const tankType = tank.tankType as TankType | string;

  const allFactors: RiskFactor[] = [];

  const singleFactors = detectSingleThresholdAbnormalities(latestRecord, tankType);
  allFactors.push(...singleFactors);

  for (const metric of ALERT_METRIC_KEYS) {
    const riseFactor = detectContinuousRise(sortedRecords, metric, tankType);
    if (riseFactor) allFactors.push(riseFactor);

    const fluctFactor = detectRapidFluctuation(sortedRecords, metric, tankType);
    if (fluctFactor) allFactors.push(fluctFactor);
  }

  const waterChangeFactor = detectNoWaterChangeLong(sortedRecords, plans);
  if (waterChangeFactor) allFactors.push(waterChangeFactor);

  const retestFactors = detectRetestStillAbnormal(sortedRecords, alerts, tankType);
  allFactors.push(...retestFactors);

  const capacityFactor = detectCapacitySensitivity(tank, singleFactors);
  if (capacityFactor) allFactors.push(capacityFactor);

  const multipleFactor = detectMultipleAbnormalMetrics(singleFactors);
  if (multipleFactor) allFactors.push(multipleFactor);

  allFactors.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "severe" ? -1 : 1;
    return b.score - a.score;
  });

  const totalScore = allFactors.reduce((sum, f) => sum + f.score, 0);
  const riskLevel = calculateRiskLevel(totalScore);
  const recordStatus = mapRiskToRecordStatus(riskLevel);
  const summary = generateSummary(allFactors, riskLevel);
  const recommendations = generateRecommendations(allFactors, tank);
  const lowRiskReasons =
    riskLevel === "低风险" ? generateLowRiskReasons(context, sortedRecords) : undefined;

  return {
    riskLevel,
    recordStatus,
    totalScore,
    factors: allFactors,
    summary,
    recommendations,
    lowRiskReasons,
  };
}

export function getRiskLevelColor(level: RiskLevel): string {
  switch (level) {
    case "严重风险":
      return "#dc2626";
    case "高风险":
      return "#ea580c";
    case "中风险":
      return "#f59e0b";
    case "低风险":
    default:
      return "#16a34a";
  }
}

export function getRiskLevelBgClass(level: RiskLevel): string {
  switch (level) {
    case "严重风险":
      return "risk-severe";
    case "高风险":
      return "risk-high";
    case "中风险":
      return "risk-medium";
    case "低风险":
    default:
      return "risk-low";
  }
}
