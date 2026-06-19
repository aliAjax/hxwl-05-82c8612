import { useState, useEffect, useCallback } from "react";
import {
  type RuleConfig,
  type TankType,
  type RuleMetric,
  type MetricRule,
  type RiskScoreConfig,
  type RiskLevelThresholds,
  type RetestDelayConfig,
  RULE_TANK_TYPES,
  RULE_METRICS,
  RULE_METRIC_LABELS,
  RULE_METRIC_UNITS,
  RULE_METRIC_STEPS,
  TREATMENT_ACTIONS,
} from "./types";
import {
  loadRuleConfig,
  saveRuleConfig,
  resetRuleConfig,
  getDefaultRuleConfig,
} from "./ruleEngine";

type ConfigTab = "thresholds" | "risk" | "retest";

interface RuleConfigPanelProps {
  onRuleChange?: (config: RuleConfig, reevaluate: boolean) => void;
}

export function RuleConfigPanel({ onRuleChange }: RuleConfigPanelProps) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<RuleConfig>(loadRuleConfig);
  const [activeTab, setActiveTab] = useState<ConfigTab>("thresholds");
  const [activeTankType, setActiveTankType] = useState<TankType>("草缸");
  const [reevaluateConfirm, setReevaluateConfirm] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setConfig(loadRuleConfig());
  }, [open]);

  const updateMetricRule = useCallback(
    (
      tankType: TankType,
      metric: RuleMetric,
      rangeKey: "ok" | "watch" | "severe",
      index: 0 | 1,
      value: string
    ) => {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return;
      setConfig((prev) => {
        const current = prev.tankTypeRules[tankType][metric];
        const newRange: [number, number] = [
          ...current[rangeKey],
        ] as [number, number];
        newRange[index] = numValue;
        return {
          ...prev,
          tankTypeRules: {
            ...prev.tankTypeRules,
            [tankType]: {
              ...prev.tankTypeRules[tankType],
              [metric]: {
                ...current,
                [rangeKey]: newRange,
              },
            },
          },
        };
      });
      setHasChanges(true);
    },
    []
  );

  const updateRiskScore = useCallback(
    (key: keyof RiskScoreConfig, value: string) => {
      const numValue = parseInt(value);
      if (isNaN(numValue) || numValue < 0) return;
      setConfig((prev) => ({
        ...prev,
        riskScoreConfig: {
          ...prev.riskScoreConfig,
          [key]: numValue,
        },
      }));
      setHasChanges(true);
    },
    []
  );

  const updateRiskLevel = useCallback(
    (key: keyof RiskLevelThresholds, value: string) => {
      const numValue = parseInt(value);
      if (isNaN(numValue) || numValue < 0) return;
      setConfig((prev) => ({
        ...prev,
        riskLevelThresholds: {
          ...prev.riskLevelThresholds,
          [key]: numValue,
        },
      }));
      setHasChanges(true);
    },
    []
  );

  const updateRetestDelay = useCallback(
    (action: string, value: string) => {
      const numValue = parseInt(value);
      if (isNaN(numValue) || numValue < 1) return;
      setConfig((prev) => ({
        ...prev,
        retestDelayConfig: {
          ...prev.retestDelayConfig,
          [action]: numValue,
        },
      }));
      setHasChanges(true);
    },
    []
  );

  const applyTemplateToTankType = useCallback((templateType: TankType) => {
    const defaults = getDefaultRuleConfig();
    setConfig((prev) => ({
      ...prev,
      tankTypeRules: {
        ...prev.tankTypeRules,
        [activeTankType]: defaults.tankTypeRules[templateType],
      },
    }));
    setHasChanges(true);
  }, [activeTankType]);

  const handleSave = (reevaluate: boolean) => {
    saveRuleConfig(config);
    setHasChanges(false);
    setOpen(false);
    setReevaluateConfirm(false);
    onRuleChange?.(config, reevaluate);
  };

  const handleReset = () => {
    if (!window.confirm("确定重置所有规则为默认值吗？此操作不可撤销。")) return;
    const defaults = resetRuleConfig();
    setConfig(defaults);
    setHasChanges(true);
  };

  const handleCancel = () => {
    setOpen(false);
    setHasChanges(false);
    setReevaluateConfirm(false);
  };

  const currentRules = config.tankTypeRules[activeTankType];

  const RISK_SCORE_LABELS: Record<keyof RiskScoreConfig, string> = {
    single_threshold_mild: "单项超标（轻微）",
    single_threshold_severe: "单项超标（严重）",
    continuous_rise_mild: "持续上升（轻微）",
    continuous_rise_severe: "持续上升（严重）",
    rapid_fluctuation_mild: "剧烈波动（轻微）",
    rapid_fluctuation_severe: "剧烈波动（严重）",
    no_water_change_mild: "长期未换水（轻微）",
    no_water_change_severe: "长期未换水（严重）",
    retest_still_abnormal_mild: "复测仍异常（轻微）",
    retest_still_abnormal_severe: "复测仍异常（严重）",
    capacity_sensitivity: "水体敏感加成",
    multiple_metrics_bonus: "多项异常加成",
  };

  const RISK_LEVEL_LABELS: Record<keyof RiskLevelThresholds, string> = {
    low: "低风险上限",
    medium: "中风险上限",
    high: "高风险上限",
  };

  return (
    <>
      <button
        className="secondary-action"
        onClick={() => setOpen(true)}
      >
        ⚙️ 规则配置中心
      </button>

      {open && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div
            className="modal-content modal-content-large rule-config-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>规则配置中心</h2>
              <button className="modal-close" onClick={handleCancel}>
                ×
              </button>
            </header>

            <div className="rule-config-body">
              <div className="rule-config-tabs">
                <button
                  className={`rule-config-tab ${activeTab === "thresholds" ? "tab-active" : ""}`}
                  onClick={() => setActiveTab("thresholds")}
                >
                  📊 指标阈值
                </button>
                <button
                  className={`rule-config-tab ${activeTab === "risk" ? "tab-active" : ""}`}
                  onClick={() => setActiveTab("risk")}
                >
                  ⚡ 风险评分
                </button>
                <button
                  className={`rule-config-tab ${activeTab === "retest" ? "tab-active" : ""}`}
                  onClick={() => setActiveTab("retest")}
                >
                  🔄 复测建议
                </button>
              </div>

              {activeTab === "thresholds" && (
                <div className="rule-config-section">
                  <div className="rule-config-tank-type-bar">
                    <span className="rule-config-label">选择缸型：</span>
                    <div className="chips muted">
                      {RULE_TANK_TYPES.map((t) => (
                        <button
                          key={t}
                          className={activeTankType === t ? "chip-active" : ""}
                          onClick={() => setActiveTankType(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="template-apply-group">
                      <span className="template-apply-label">套用模板：</span>
                      {RULE_TANK_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`template-apply-btn ${activeTankType === t ? "template-apply-active" : ""}`}
                          onClick={() => applyTemplateToTankType(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rule-config-thresholds-grid">
                    {RULE_METRICS.map((metric) => {
                      const rule = currentRules[metric];
                      return (
                        <div key={metric} className="threshold-card">
                          <header className="threshold-card-header">
                            <span className="threshold-card-label">
                              {rule.label}
                            </span>
                            {rule.unit && (
                              <span className="threshold-card-unit">
                                {rule.unit}
                              </span>
                            )}
                          </header>
                          <div className="threshold-card-body">
                            <div className="threshold-row">
                              <span className="threshold-range-label threshold-range-ok">
                                正常范围
                              </span>
                              <div className="threshold-range-inputs">
                                <input
                                  type="number"
                                  step={rule.step}
                                  value={rule.ok[0]}
                                  onChange={(e) =>
                                    updateMetricRule(
                                      activeTankType,
                                      metric,
                                      "ok",
                                      0,
                                      e.target.value
                                    )
                                  }
                                />
                                <span className="threshold-range-sep">~</span>
                                <input
                                  type="number"
                                  step={rule.step}
                                  value={rule.ok[1]}
                                  onChange={(e) =>
                                    updateMetricRule(
                                      activeTankType,
                                      metric,
                                      "ok",
                                      1,
                                      e.target.value
                                    )
                                  }
                                />
                                {rule.unit && (
                                  <span className="threshold-input-unit">
                                    {rule.unit}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="threshold-row">
                              <span className="threshold-range-label threshold-range-watch">
                                关注范围
                              </span>
                              <div className="threshold-range-inputs">
                                <input
                                  type="number"
                                  step={rule.step}
                                  value={rule.watch[0]}
                                  onChange={(e) =>
                                    updateMetricRule(
                                      activeTankType,
                                      metric,
                                      "watch",
                                      0,
                                      e.target.value
                                    )
                                  }
                                />
                                <span className="threshold-range-sep">~</span>
                                <input
                                  type="number"
                                  step={rule.step}
                                  value={rule.watch[1]}
                                  onChange={(e) =>
                                    updateMetricRule(
                                      activeTankType,
                                      metric,
                                      "watch",
                                      1,
                                      e.target.value
                                    )
                                  }
                                />
                                {rule.unit && (
                                  <span className="threshold-input-unit">
                                    {rule.unit}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="threshold-row">
                              <span className="threshold-range-label threshold-range-severe">
                                严重异常范围
                              </span>
                              <div className="threshold-range-inputs">
                                <input
                                  type="number"
                                  step={rule.step}
                                  value={rule.severe[0]}
                                  onChange={(e) =>
                                    updateMetricRule(
                                      activeTankType,
                                      metric,
                                      "severe",
                                      0,
                                      e.target.value
                                    )
                                  }
                                />
                                <span className="threshold-range-sep">~</span>
                                <input
                                  type="number"
                                  step={rule.step}
                                  value={rule.severe[1]}
                                  onChange={(e) =>
                                    updateMetricRule(
                                      activeTankType,
                                      metric,
                                      "severe",
                                      1,
                                      e.target.value
                                    )
                                  }
                                />
                                {rule.unit && (
                                  <span className="threshold-input-unit">
                                    {rule.unit}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === "risk" && (
                <div className="rule-config-section">
                  <h3 className="rule-config-subtitle">风险分值配置</h3>
                  <p className="rule-config-hint">
                    配置各类风险因素的评分权重，总分越高风险等级越高。
                  </p>
                  <div className="rule-config-score-grid">
                    {(
                      Object.keys(config.riskScoreConfig) as (keyof RiskScoreConfig)[]
                    ).map((key) => (
                      <div key={key} className="rule-config-score-row">
                        <span className="rule-config-score-label">
                          {RISK_SCORE_LABELS[key]}
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={config.riskScoreConfig[key]}
                          onChange={(e) => updateRiskScore(key, e.target.value)}
                          className="rule-config-score-input"
                        />
                      </div>
                    ))}
                  </div>

                  <h3 className="rule-config-subtitle" style={{ marginTop: 24 }}>
                    风险等级阈值
                  </h3>
                  <p className="rule-config-hint">
                    根据风险总分划分等级：低风险 → 中风险 → 高风险 → 严重风险。
                  </p>
                  <div className="rule-config-score-grid">
                    {(
                      Object.keys(config.riskLevelThresholds) as (keyof RiskLevelThresholds)[]
                    ).map((key) => (
                      <div key={key} className="rule-config-score-row">
                        <span className="rule-config-score-label">
                          {RISK_LEVEL_LABELS[key]}
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={config.riskLevelThresholds[key]}
                          onChange={(e) => updateRiskLevel(key, e.target.value)}
                          className="rule-config-score-input"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "retest" && (
                <div className="rule-config-section">
                  <h3 className="rule-config-subtitle">复测建议天数</h3>
                  <p className="rule-config-hint">
                    配置各处理措施后建议进行复测的天数。
                  </p>
                  <div className="rule-config-score-grid">
                    {TREATMENT_ACTIONS.map((action) => (
                      <div key={action} className="rule-config-score-row">
                        <span className="rule-config-score-label">
                          {action}后复测天数
                        </span>
                        <input
                          type="number"
                          min="1"
                          value={config.retestDelayConfig[action]}
                          onChange={(e) =>
                            updateRetestDelay(action, e.target.value)
                          }
                          className="rule-config-score-input"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <footer className="modal-footer rule-config-footer">
              <div className="rule-config-footer-left">
                <button
                  type="button"
                  className="danger-action"
                  onClick={handleReset}
                >
                  重置默认
                </button>
                {hasChanges && (
                  <span className="rule-config-unsaved">有未保存的更改</span>
                )}
              </div>
              <div className="rule-config-footer-right">
                <button type="button" onClick={handleCancel}>
                  取消
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => handleSave(false)}
                  disabled={!hasChanges}
                >
                  保存（仅影响新记录）
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => setReevaluateConfirm(true)}
                  disabled={!hasChanges}
                >
                  保存并重新评估历史数据
                </button>
              </div>
            </footer>

            {reevaluateConfirm && (
              <div
                className="modal-overlay reevaluate-confirm-overlay"
                onClick={() => setReevaluateConfirm(false)}
              >
                <div
                  className="modal-content reevaluate-confirm-modal"
                  onClick={(e) => e.stopPropagation()}
                >
                  <header className="modal-header">
                    <h2>确认重新评估历史数据</h2>
                    <button
                      className="modal-close"
                      onClick={() => setReevaluateConfirm(false)}
                    >
                      ×
                    </button>
                  </header>
                  <div className="modal-body">
                    <p className="modal-warning">
                      ⚠️ 重新评估将使用新规则对全部历史水质记录重新计算状态和备注，并重新生成告警。
                      已处理的告警不会被修改，但可能产生新的告警。
                    </p>
                    <p>此操作可能需要一些时间，确定继续吗？</p>
                  </div>
                  <footer className="modal-footer">
                    <button
                      type="button"
                      onClick={() => setReevaluateConfirm(false)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="primary-action"
                      onClick={() => handleSave(true)}
                    >
                      确认重新评估
                    </button>
                  </footer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
