import { useState, useMemo, useCallback } from "react";
import { parseWaterRecordsCsv, FIELD_LABELS, SAMPLE_CSV } from "./csvParser";
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
    return parseResult.errorRows.reduce((sum, r) => sum + r.missingFields.length, 0);
  }, [parseResult]);

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
                              <tr key={row.rowIndex}>
                                <td className="row-index">{row.rowIndex}</td>
                                <td className="cell-strong">{row.data.tankName}</td>
                                <td className="cell-muted">{row.data.recordedAt}</td>
                                <td>{row.data.metrics.ph || "—"}</td>
                                <td>{row.data.metrics.ammonia || "—"}</td>
                                <td>{row.data.metrics.nitrite || "—"}</td>
                                <td>{row.data.metrics.nitrate || "—"}</td>
                                <td>{row.data.metrics.hardness || "—"}</td>
                                <td>{row.data.metrics.temperature || "—"}</td>
                                <td>
                                  <span className={`preview-status ${getStatusClass(status)}`}>
                                    {status}
                                  </span>
                                </td>
                                <td className="cell-note">{note}</td>
                              </tr>
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
                            <span className="error-missing-tag">
                              缺失: {row.missingFields.map((f) => FIELD_LABELS[f] || f).join(", ")}
                            </span>
                          )}
                        </div>
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
