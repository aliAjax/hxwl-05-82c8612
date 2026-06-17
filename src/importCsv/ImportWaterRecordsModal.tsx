import { useState, useMemo, useCallback, Fragment } from "react";
import {
  parseWaterRecordsCsv,
  FIELD_LABELS,
  MISSING_DESCRIPTION,
  MISSING_CATEGORY,
  CATEGORY_LABEL,
  getMissingFieldSummary,
  SAMPLE_CSV,
} from "./csvParser";
import type { MissingFieldSummary } from "./csvParser";
import type { ParseResult, ValidRow, ErrorRow, PreparedRecord } from "./types";
import type { TankProfile, RecordStatus, WaterMetrics } from "../db/types";

const METRIC_RANGES: Record<
  keyof Omit<WaterMetrics, "waterChange">,
  { ok: [number, number]; watch: [number, number]; unit: string; label: string }
> = {
  ph: { ok: [6.5, 7.5], watch: [6.0, 8.0], unit: "", label: "pH" },
  ammonia: { ok: [0, 0], watch: [0, 0.25], unit: "ppm", label: "氨氮" },
  nitrite: { ok: [0, 0], watch: [0, 0.5], unit: "ppm", label: "亚硝酸盐" },
  nitrate: { ok: [0, 20], watch: [0, 40], unit: "ppm", label: "硝酸盐" },
  hardness: { ok: [4, 12], watch: [2, 18], unit: "dGH", label: "硬度" },
  temperature: { ok: [24, 28], watch: [20, 32], unit: "°C", label: "温度" },
};

function evaluateMetric(
  key: keyof Omit<WaterMetrics, "waterChange">,
  raw: string
): RecordStatus {
  const value = parseFloat(raw);
  if (isNaN(value)) return "稳定";
  const range = METRIC_RANGES[key];
  if (value < range.watch[0] || value > range.watch[1]) return "异常";
  if (value < range.ok[0] || value > range.ok[1]) return "关注";
  return "稳定";
}

function evaluateRecordStatus(metrics: WaterMetrics, remark: string): { status: RecordStatus; note: string } {
  const metricKeys = Object.keys(METRIC_RANGES) as (keyof Omit<WaterMetrics, "waterChange">)[];
  const issues: { key: keyof Omit<WaterMetrics, "waterChange">; status: RecordStatus }[] = [];
  let overall: RecordStatus = "稳定";

  for (const key of metricKeys) {
    const raw = metrics[key];
    if (!raw.trim()) continue;
    const st = evaluateMetric(key, raw);
    if (st !== "稳定") {
      issues.push({ key, status: st });
    }
    if (st === "异常") overall = "异常";
    else if (st === "关注" && overall !== "异常") overall = "关注";
  }

  let note = "";
  if (issues.length === 0) {
    note = "各项指标正常，继续保持";
  } else {
    const dangerItems = issues.filter((i) => i.status === "异常");
    const watchItems = issues.filter((i) => i.status === "关注");
    const parts: string[] = [];
    if (dangerItems.length > 0) {
      parts.push(
        dangerItems
          .map((i) => {
            const r = METRIC_RANGES[i.key];
            return `${r.label}${metrics[i.key]}${r.unit}异常`;
          })
          .join("、")
      );
    }
    if (watchItems.length > 0) {
      parts.push(
        watchItems
          .map((i) => `${METRIC_RANGES[i.key].label}${metrics[i.key]}需关注`)
          .join("、")
      );
    }
    note = parts.join("；");
    if (metrics.waterChange.trim()) {
      note += `；本次换水${metrics.waterChange}`;
    }
    if (dangerItems.length > 0) {
      note += "，建议立即处理";
    }
  }
  if (remark.trim()) {
    note = note ? `${note}；${remark}` : remark;
  }
  return { status: overall, note };
}

export interface ImportWaterRecordsModalProps {
  open: boolean;
  onClose: () => void;
  tanks: TankProfile[];
  onImport: (records: PreparedRecord[]) => Promise<void>;
}

type PreviewTab = "valid" | "error";

export function ImportWaterRecordsModal({
  open,
  onClose,
  tanks,
  onImport,
}: ImportWaterRecordsModalProps) {
  const [csvText, setCsvText] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [activeTab, setActiveTab] = useState<PreviewTab>("valid");
  const [isImporting, setIsImporting] = useState(false);
  const [showMissingWarning, setShowMissingWarning] = useState(false);

  const handleParse = useCallback(() => {
    if (!csvText.trim()) {
      setParseResult(null);
      return;
    }
    const result = parseWaterRecordsCsv(csvText);
    setParseResult(result);
    setActiveTab(result.validRows.length > 0 ? "valid" : "error");
  }, [csvText]);

  const handleLoadSample = () => {
    setCsvText(SAMPLE_CSV);
  };

  const handleClear = () => {
    setCsvText("");
    setParseResult(null);
  };

  const prepareRecords = useCallback((): PreparedRecord[] => {
    if (!parseResult) return [];
    return parseResult.validRows.map((row: ValidRow) => {
      const existingTank = tanks.find((t) => t.name === row.data.tankName);
      const { status, note } = evaluateRecordStatus(row.data.metrics, row.data.remark);
      return {
        tankName: row.data.tankName,
        tankId: existingTank?.id,
        recordedAt: row.data.recordedAt,
        metrics: { ...row.data.metrics },
        status,
        note,
      };
    });
  }, [parseResult, tanks]);

  const handleImport = async () => {
    if (!parseResult || parseResult.validRows.length === 0) return;
    
    const allMissingFields = parseResult.errorRows.flatMap((r) => r.missingFields);
    if (allMissingFields.length > 0 && !showMissingWarning) {
      setShowMissingWarning(true);
      return;
    }
    
    setIsImporting(true);
    try {
      const records = prepareRecords();
      await onImport(records);
      setCsvText("");
      setParseResult(null);
      setShowMissingWarning(false);
      onClose();
    } finally {
      setIsImporting(false);
    }
  };

  const totalMissingFields = useMemo(() => {
    if (!parseResult) return 0;
    const errorMissing = parseResult.errorRows.reduce(
      (sum, r) => sum + r.missingFields.length,
      0
    );
    const validMissing = parseResult.validRows.reduce(
      (sum, r) => sum + r.missingFields.length,
      0
    );
    return errorMissing + validMissing;
  }, [parseResult]);

  const missingFieldSummary = useMemo((): MissingFieldSummary[] => {
    if (!parseResult) return [];
    return getMissingFieldSummary(parseResult);
  }, [parseResult]);

  const autoFillCount = useMemo(() => {
    return missingFieldSummary
      .filter((s) => s.category === "autoFill")
      .reduce((sum, s) => sum + s.count, 0);
  }, [missingFieldSummary]);

  const emptyMetricCount = useMemo(() => {
    return missingFieldSummary
      .filter((s) => s.category === "empty")
      .reduce((sum, s) => sum + s.count, 0);
  }, [missingFieldSummary]);

  const getMissingCategoryClass = (category: string): string => {
    switch (category) {
      case "required":
        return "missing-cat-required";
      case "autoFill":
        return "missing-cat-autofill";
      case "empty":
        return "missing-cat-empty";
      case "optional":
        return "missing-cat-optional";
      default:
        return "";
    }
  };

  const getStatusClass = (status: RecordStatus) => {
    switch (status) {
      case "稳定":
        return "preview-status-ok";
      case "关注":
        return "preview-status-watch";
      case "异常":
        return "preview-status-danger";
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content import-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>导入水质检测记录</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="import-modal-body">
          <div className="import-input-section">
            <div className="import-input-header">
              <label>
                <span>粘贴 CSV 格式数据</span>
              </label>
              <div className="import-input-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={handleLoadSample}
                >
                  加载示例
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={handleClear}
                  disabled={!csvText}
                >
                  清空
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleParse}
                  disabled={!csvText.trim()}
                >
                  解析预览
                </button>
              </div>
            </div>
            <textarea
              className="import-textarea"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`支持的字段顺序（可自定义表头）：
鱼缸名称, 检测时间, pH, 氨氮, 亚硝酸盐, 硝酸盐, 硬度, 温度, 备注

示例：
草缸A,2026-06-15 09:30,6.8,0,0,18,8,26,正常
海缸B,2026-06-15 10:00,8.1,0.02,0.01,5,12,27,钙硬度偏低`}
              rows={8}
              spellCheck={false}
            />
            <div className="import-hint">
              <p>
                <strong>提示：</strong>
                第一行为表头（可选），支持中英文字段名；日期格式支持
                YYYY-MM-DD、YYYY-MM-DD HH:mm 等；留空字段（除鱼缸名称外）将使用默认值。
              </p>
            </div>
          </div>

          {parseResult && (
            <div className="import-preview-section">
              <div className="import-summary-bar">
                <div className="import-summary-item import-summary-total">
                  <span className="summary-label">总行数</span>
                  <span className="summary-value">{parseResult.totalRows}</span>
                </div>
                <div className="import-summary-item import-summary-valid">
                  <span className="summary-label">有效行</span>
                  <span className="summary-value">{parseResult.validRows.length}</span>
                </div>
                <div className="import-summary-item import-summary-error">
                  <span className="summary-label">错误行</span>
                  <span className="summary-value">{parseResult.errorRows.length}</span>
                </div>
                {totalMissingFields > 0 && (
                  <div className="import-summary-item import-summary-missing">
                    <span className="summary-label">字段缺失</span>
                    <span className="summary-value">{totalMissingFields}</span>
                  </div>
                )}
              </div>

              {missingFieldSummary.length > 0 && (
                <div className="missing-summary-bar">
                  <div className="missing-summary-title">
                    <span className="missing-summary-icon">ℹ️</span>
                    <span>字段缺失说明</span>
                  </div>
                  <div className="missing-summary-list">
                    {missingFieldSummary.map((item) => (
                      <div
                        key={item.field}
                        className={`missing-summary-item ${getMissingCategoryClass(item.category)}`}
                        title={item.description}
                      >
                        <span className="missing-item-label">{item.label}</span>
                        <span className="missing-item-count">×{item.count}</span>
                        <span className="missing-item-badge">
                          {CATEGORY_LABEL[item.category] || item.category}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="missing-summary-desc">
                    {autoFillCount > 0 && (
                      <span className="missing-desc-item">
                        <strong>自动填充：</strong>系统自动补充默认值，可正常导入
                      </span>
                    )}
                    {emptyMetricCount > 0 && (
                      <span className="missing-desc-item">
                        <strong>无数据：</strong>该指标留空，不参与状态评估
                      </span>
                    )}
                    {missingFieldSummary.some((s) => s.category === "required") && (
                      <span className="missing-desc-item missing-desc-error">
                        <strong>必填缺失：</strong>必须填写，对应行无法导入
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="preview-tabs">
                <button
                  className={`preview-tab ${activeTab === "valid" ? "preview-tab-active" : ""}`}
                  onClick={() => setActiveTab("valid")}
                >
                  有效行 ({parseResult.validRows.length})
                </button>
                <button
                  className={`preview-tab ${activeTab === "error" ? "preview-tab-active" : ""}`}
                  onClick={() => setActiveTab("error")}
                >
                  错误行 ({parseResult.errorRows.length})
                  {parseResult.errorRows.length > 0 && (
                    <span className="preview-tab-badge">{parseResult.errorRows.length}</span>
                  )}
                </button>
              </div>

              <div className="preview-content">
                {activeTab === "valid" ? (
                  parseResult.validRows.length === 0 ? (
                    <div className="preview-empty">
                      <div className="preview-empty-icon">✓</div>
                      <p>暂无有效行</p>
                    </div>
                  ) : (
                    <div className="preview-table-wrapper">
                      <table className="preview-table">
                        <thead>
                          <tr>
                            <th>行号</th>
                            <th>鱼缸名称</th>
                            <th>检测时间</th>
                            <th>pH</th>
                            <th>氨氮</th>
                            <th>亚硝</th>
                            <th>硝</th>
                            <th>硬度</th>
                            <th>温度</th>
                            <th>状态</th>
                            <th>备注</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parseResult.validRows.map((row: ValidRow) => {
                            const { status, note } = evaluateRecordStatus(
                              row.data.metrics,
                              row.data.remark
                            );
                            return (
                              <Fragment key={row.rowIndex}>
                                <tr>
                                  <td className="row-index">{row.rowIndex}</td>
                                  <td className="cell-strong">{row.data.tankName}</td>
                                  <td
                                    className={
                                      row.missingFields.includes("recordedAt")
                                        ? "cell-muted cell-missing cell-missing-autofill"
                                        : "cell-muted"
                                    }
                                    title={
                                      row.missingFields.includes("recordedAt")
                                        ? MISSING_DESCRIPTION["recordedAt"]
                                        : ""
                                    }
                                  >
                                    <span className="cell-value">{row.data.recordedAt}</span>
                                    {row.missingFields.includes("recordedAt") && (
                                      <span className="cell-autofill-badge">自动填充</span>
                                    )}
                                  </td>
                                  <td
                                    className={row.missingFields.includes("ph") ? "cell-missing cell-metric" : ""}
                                    title={row.missingFields.includes("ph") ? MISSING_DESCRIPTION["ph"] : ""}
                                  >
                                    {row.data.metrics.ph || <span className="cell-empty">— 未测</span>}
                                  </td>
                                  <td
                                    className={row.missingFields.includes("ammonia") ? "cell-missing cell-metric" : ""}
                                    title={row.missingFields.includes("ammonia") ? MISSING_DESCRIPTION["ammonia"] : ""}
                                  >
                                    {row.data.metrics.ammonia || <span className="cell-empty">— 未测</span>}
                                  </td>
                                  <td
                                    className={row.missingFields.includes("nitrite") ? "cell-missing cell-metric" : ""}
                                    title={row.missingFields.includes("nitrite") ? MISSING_DESCRIPTION["nitrite"] : ""}
                                  >
                                    {row.data.metrics.nitrite || <span className="cell-empty">— 未测</span>}
                                  </td>
                                  <td
                                    className={row.missingFields.includes("nitrate") ? "cell-missing cell-metric" : ""}
                                    title={row.missingFields.includes("nitrate") ? MISSING_DESCRIPTION["nitrate"] : ""}
                                  >
                                    {row.data.metrics.nitrate || <span className="cell-empty">— 未测</span>}
                                  </td>
                                  <td
                                    className={row.missingFields.includes("hardness") ? "cell-missing cell-metric" : ""}
                                    title={row.missingFields.includes("hardness") ? MISSING_DESCRIPTION["hardness"] : ""}
                                  >
                                    {row.data.metrics.hardness || <span className="cell-empty">— 未测</span>}
                                  </td>
                                  <td
                                    className={row.missingFields.includes("temperature") ? "cell-missing cell-metric" : ""}
                                    title={row.missingFields.includes("temperature") ? MISSING_DESCRIPTION["temperature"] : ""}
                                  >
                                    {row.data.metrics.temperature || <span className="cell-empty">— 未测</span>}
                                  </td>
                                  <td>
                                    <span className={`preview-status ${getStatusClass(status)}`}>
                                      {status}
                                    </span>
                                  </td>
                                  <td className="cell-note">{note}</td>
                                </tr>
                                {row.missingFields.filter((f) => f !== "tankName").length > 0 && (
                                  <tr className="valid-row-missing">
                                    <td colSpan={11}>
                                      <div className="missing-tag-group">
                                        {row.missingFields
                                          .filter((f) => f !== "tankName")
                                          .map((field) => {
                                            const label = FIELD_LABELS[field] || field;
                                            const category =
                                              (MISSING_CATEGORY as Record<string, string>)[field] || "optional";
                                            const description =
                                              MISSING_DESCRIPTION[field] || "未填写";
                                            return (
                                              <span
                                                key={field}
                                                className={`missing-tag ${getMissingCategoryClass(category)}`}
                                                title={description}
                                              >
                                                <span className="missing-tag-label">{label}</span>
                                                <span className="missing-tag-desc">{description}</span>
                                              </span>
                                            );
                                          })}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : parseResult.errorRows.length === 0 ? (
                  <div className="preview-empty preview-empty-ok">
                    <div className="preview-empty-icon">✓</div>
                    <p>无错误行</p>
                  </div>
                ) : (
                  <div className="error-list">
                    {parseResult.errorRows.map((row: ErrorRow) => (
                      <div key={row.rowIndex} className="error-card">
                        <div className="error-card-header">
                          <span className="error-row-index">第 {row.rowIndex} 行</span>
                          {row.missingFields.length > 0 && (
                            <span className="error-missing-count">
                              缺失 {row.missingFields.length} 个字段
                            </span>
                          )}
                        </div>
                        {row.missingFields.length > 0 && (
                          <div className="error-missing-list">
                            {row.missingFields.map((field) => {
                              const label = FIELD_LABELS[field] || field;
                              const category =
                                (MISSING_CATEGORY as Record<string, string>)[field] || "optional";
                              const description =
                                MISSING_DESCRIPTION[field] || "未填写";
                              return (
                                <div
                                  key={field}
                                  className={`error-missing-item ${getMissingCategoryClass(category)}`}
                                >
                                  <span className="error-missing-name">
                                    {label}
                                  </span>
                                  <span className="error-missing-badge">
                                    {CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL] || category}
                                  </span>
                                  <span className="error-missing-desc">
                                    {description}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="error-raw-line">{row.rawLine}</div>
                        {row.errors.length > 0 && (
                          <ul className="error-details">
                            {row.errors.map((err, idx) => (
                              <li key={idx}>⚠️ {err}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="modal-footer import-modal-footer">
          {showMissingWarning && parseResult && parseResult.errorRows.length > 0 && (
            <div className="missing-warning-bar">
              ⚠️ 有 {parseResult.errorRows.length} 行存在错误或字段缺失，
              将仅导入 {parseResult.validRows.length} 条有效记录。确认继续？
              <button
                type="button"
                className="secondary-action"
                onClick={() => setShowMissingWarning(false)}
              >
                返回修改
              </button>
            </div>
          )}
          <div className="footer-actions">
            <button type="button" onClick={onClose} disabled={isImporting}>
              取消
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={handleImport}
              disabled={!parseResult || parseResult.validRows.length === 0 || isImporting}
            >
              {isImporting
                ? "导入中..."
                : `确认导入 (${parseResult?.validRows.length || 0})`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
