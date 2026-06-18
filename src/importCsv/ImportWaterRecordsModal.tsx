import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  parseWaterRecordsCsv,
  FIELD_LABELS,
  MISSING_DESCRIPTION,
  MISSING_CATEGORY,
  CATEGORY_LABEL,
  SAMPLE_CSV,
  convertToEditableRows,
  buildEditableParseResult,
  validateAndUpdateRow,
  cleanNumeric,
  parseDateTime,
} from "./csvParser";
import type { EditableRow, EditableParseResult, ImportRecordItem, PreparedRecord } from "./types";
import type { TankProfile, RecordStatus, WaterMetrics } from "../db/types";
import { generateAlertsFromRecord } from "../alertCenter/AlertCenter";
import type { AlertItem, AlertMetricValues } from "../alertCenter/types";
import { getEffectiveThresholds } from "../db/tankTemplates";
import { TEMPLATE_METRIC_UNITS, TEMPLATE_METRIC_LABELS } from "../db/tankTemplates";

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

const CUSTOMIZABLE_METRICS = ["ph", "nitrate", "hardness", "temperature"] as const;

function evaluateMetric(
  key: keyof Omit<WaterMetrics, "waterChange">,
  raw: string,
  tank?: TankProfile
): RecordStatus {
  const value = parseFloat(raw);
  if (isNaN(value)) return "稳定";
  
  let range = METRIC_RANGES[key];
  if (tank && CUSTOMIZABLE_METRICS.includes(key as typeof CUSTOMIZABLE_METRICS[number])) {
    const eff = getEffectiveThresholds(tank, key as typeof CUSTOMIZABLE_METRICS[number]);
    const unit = TEMPLATE_METRIC_UNITS[key as typeof CUSTOMIZABLE_METRICS[number]];
    const label = TEMPLATE_METRIC_LABELS[key as typeof CUSTOMIZABLE_METRICS[number]];
    range = { ok: eff.ok, watch: eff.watch, unit, label };
  }
  
  if (value < range.watch[0] || value > range.watch[1]) return "异常";
  if (value < range.ok[0] || value > range.ok[1]) return "关注";
  return "稳定";
}

function evaluateRecordStatus(
  metrics: WaterMetrics,
  remark: string,
  tank?: TankProfile
): { status: RecordStatus; note: string } {
  const metricKeys = Object.keys(METRIC_RANGES) as (keyof Omit<WaterMetrics, "waterChange">)[];
  const issues: { key: keyof Omit<WaterMetrics, "waterChange">; status: RecordStatus }[] = [];
  let overall: RecordStatus = "稳定";

  for (const key of metricKeys) {
    const raw = metrics[key];
    if (!raw.trim()) continue;
    const st = evaluateMetric(key, raw, tank);
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
  onImport: (items: ImportRecordItem[]) => Promise<void>;
}

type PreviewFilter = "all" | "valid" | "error" | "unmatched";

const METRIC_KEYS = ["ph", "ammonia", "nitrite", "nitrate", "hardness", "temperature"] as const;
const METRIC_LABELS = ["pH", "氨氮", "亚硝", "硝", "硬度", "温度"];
const METRIC_STEPS = ["0.1", "0.01", "0.01", "1", "1", "0.5"];

export function ImportWaterRecordsModal({
  open,
  onClose,
  tanks,
  onImport,
}: ImportWaterRecordsModalProps) {
  const [csvText, setCsvText] = useState("");
  const [editableResult, setEditableResult] = useState<EditableParseResult | null>(null);
  const [activeFilter, setActiveFilter] = useState<PreviewFilter>("all");
  const [isImporting, setIsImporting] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [showMatchTankModal, setShowMatchTankModal] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCsvText("");
      setEditableResult(null);
      setActiveFilter("all");
      setEditingCell(null);
      setShowMatchTankModal(null);
    }
  }, [open]);

  const handleParse = useCallback(() => {
    if (!csvText.trim()) {
      setEditableResult(null);
      return;
    }
    const result = parseWaterRecordsCsv(csvText);
    const editableRows = convertToEditableRows(result, tanks);
    const editableParseResult = buildEditableParseResult(editableRows);
    setEditableResult(editableParseResult);
    setActiveFilter("all");
  }, [csvText, tanks]);

  const handleLoadSample = () => {
    setCsvText(SAMPLE_CSV);
  };

  const handleClear = () => {
    setCsvText("");
    setEditableResult(null);
    setEditingCell(null);
    setShowMatchTankModal(null);
  };

  const updateRowField = useCallback(
    (rowId: string, field: string, value: string) => {
      if (!editableResult) return;

      const updatedRows = editableResult.rows.map((row) => {
        if (row.id !== rowId) return row;

        let updatedRow = { ...row };

        if (field === "tankName") {
          updatedRow.tankName = value;
        } else if (field === "recordedAt") {
          const parsedDate = parseDateTime(value);
          updatedRow.recordedAt = parsedDate || value;
        } else if (field === "remark") {
          updatedRow.remark = value;
        } else if (field === "waterChange") {
          updatedRow.metrics = { ...updatedRow.metrics, waterChange: value };
        } else if (METRIC_KEYS.includes(field as typeof METRIC_KEYS[number])) {
          const cleaned = cleanNumeric(value);
          updatedRow.metrics = {
            ...updatedRow.metrics,
            [field]: cleaned,
          } as WaterMetrics;
        }

        return validateAndUpdateRow(updatedRow, tanks);
      });

      setEditableResult(buildEditableParseResult(updatedRows));
    },
    [editableResult, tanks]
  );

  const handleMatchTank = useCallback(
    (rowId: string, tankId: string | null) => {
      if (!editableResult) return;

      const updatedRows = editableResult.rows.map((row) => {
        if (row.id !== rowId) return row;

        let updatedRow = { ...row };

        if (tankId) {
          const matchedTank = tanks.find((t) => t.id === tankId);
          updatedRow.matchedTankId = tankId;
          updatedRow.tankMatchStatus = "manual";
          if (matchedTank && !row.tankName.trim()) {
            updatedRow.tankName = matchedTank.name;
          }
        } else {
          updatedRow.matchedTankId = undefined;
          const validated = validateAndUpdateRow(row, tanks);
          updatedRow.tankMatchStatus = validated.tankMatchStatus;
        }

        return validateAndUpdateRow(updatedRow, tanks);
      });

      setEditableResult(buildEditableParseResult(updatedRows));
      setShowMatchTankModal(null);
    },
    [editableResult, tanks]
  );

  const handleResetRow = useCallback(
    (rowId: string) => {
      if (!editableResult) return;

      const updatedRows = editableResult.rows.map((row) => {
        if (row.id !== rowId) return row;

        const resetRow: EditableRow = {
          ...row,
          tankName: row.originalTankName,
          recordedAt: row.originalRecordedAt,
          metrics: { ...row.originalMetrics },
          isModified: false,
        };

        return validateAndUpdateRow(resetRow, tanks);
      });

      setEditableResult(buildEditableParseResult(updatedRows));
    },
    [editableResult, tanks]
  );

  const handleDeleteRow = useCallback(
    (rowId: string) => {
      if (!editableResult) return;

      if (!window.confirm("确定删除该行吗？")) return;

      const updatedRows = editableResult.rows.filter((row) => row.id !== rowId);
      setEditableResult(buildEditableParseResult(updatedRows));
    },
    [editableResult]
  );

  const filteredRows = useMemo(() => {
    if (!editableResult) return [];

    switch (activeFilter) {
      case "valid":
        return editableResult.rows.filter((r) => !r.isError);
      case "error":
        return editableResult.rows.filter((r) => r.isError);
      case "unmatched":
        return editableResult.rows.filter(
          (r) => r.tankMatchStatus === "unmatched" && r.tankName.trim() !== ""
        );
      default:
        return editableResult.rows;
    }
  }, [editableResult, activeFilter]);

  const prepareRecords = useCallback((): ImportRecordItem[] => {
    if (!editableResult) return [];

    const validRows = editableResult.rows.filter((r) => !r.isError && r.tankName.trim());
    const items: ImportRecordItem[] = [];

    for (const row of validRows) {
      const tank = row.matchedTankId
        ? tanks.find((t) => t.id === row.matchedTankId)
        : tanks.find((t) => t.name === row.tankName);

      const { status, note } = evaluateRecordStatus(row.metrics, row.remark, tank);

      const tankName = tank?.name || row.tankName;
      const tankId = tank?.id;

      const record: PreparedRecord = {
        tankName,
        tankId,
        recordedAt: row.recordedAt,
        metrics: { ...row.metrics },
        status,
        note,
      };

      const tankType = tank?.tankType || "草缸";
      const customThresholds = tank?.customThresholds;
      const recordAlerts = generateAlertsFromRecord(
        "",
        tankName,
        tankId,
        tankType,
        row.metrics as unknown as AlertMetricValues,
        row.recordedAt,
        customThresholds
      );

      items.push({
        record,
        alerts: recordAlerts.map((a) => ({ ...a, id: undefined! } as Omit<AlertItem, "id">)),
      });
    }

    return items;
  }, [editableResult, tanks]);

  const handleImport = async () => {
    if (!editableResult) return;

    const validRows = editableResult.rows.filter((r) => !r.isError && r.tankName.trim());
    if (validRows.length === 0) {
      alert("没有可导入的有效记录，请先修正错误行。");
      return;
    }

    const errorRows = editableResult.rows.filter((r) => r.isError);
    if (errorRows.length > 0) {
      if (
        !window.confirm(
          `有 ${errorRows.length} 行存在错误，将不会被导入。确认导入 ${validRows.length} 条有效记录？`
        )
      ) {
        return;
      }
    }

    setIsImporting(true);
    try {
      const items = prepareRecords();
      await onImport(items);
      handleClear();
      onClose();
    } finally {
      setIsImporting(false);
    }
  };

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

  const getTankMatchStatusClass = (status: string) => {
    switch (status) {
      case "matched":
        return "tank-match-matched";
      case "manual":
        return "tank-match-manual";
      case "unmatched":
        return "tank-match-unmatched";
      case "new":
        return "tank-match-new";
      default:
        return "";
    }
  };

  const getTankMatchStatusText = (status: string) => {
    switch (status) {
      case "matched":
        return "已匹配";
      case "manual":
        return "手动关联";
      case "unmatched":
        return "未匹配";
      case "new":
        return "新建";
      default:
        return "";
    }
  };

  const handleCellEdit = (rowId: string, field: string) => {
    setEditingCell({ rowId, field });
  };

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowId: string, field: string, value: string) => {
    if (e.key === "Enter") {
      updateRowField(rowId, field, value);
      setEditingCell(null);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content import-modal-content import-modal-large"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>导入水质检测记录 - 校对模式</h2>
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
                  disabled={!csvText && !editableResult}
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
              rows={5}
              spellCheck={false}
            />
            <div className="import-hint">
              <p>
                <strong>提示：</strong>
                解析后可直接在表格中编辑修正数据，未匹配的鱼缸可手动关联到已有鱼缸。
                错误行（红色背景）需要修正后才能导入。
              </p>
            </div>
          </div>

          {editableResult && (
            <div className="import-preview-section">
              <div className="import-summary-bar">
                <div className="import-summary-item import-summary-total">
                  <span className="summary-label">总行数</span>
                  <span className="summary-value">{editableResult.totalRows}</span>
                </div>
                <div className="import-summary-item import-summary-valid">
                  <span className="summary-label">可导入</span>
                  <span className="summary-value">{editableResult.validCount}</span>
                </div>
                <div className="import-summary-item import-summary-error">
                  <span className="summary-label">错误行</span>
                  <span className="summary-value">{editableResult.errorCount}</span>
                </div>
                {editableResult.unmatchedTankCount > 0 && (
                  <div className="import-summary-item import-summary-missing">
                    <span className="summary-label">未匹配鱼缸</span>
                    <span className="summary-value">{editableResult.unmatchedTankCount}</span>
                  </div>
                )}
              </div>

              <div className="preview-filter-tabs">
                <button
                  className={`preview-filter-tab ${activeFilter === "all" ? "tab-active" : ""}`}
                  onClick={() => setActiveFilter("all")}
                >
                  全部 ({editableResult.totalRows})
                </button>
                <button
                  className={`preview-filter-tab ${activeFilter === "valid" ? "tab-active" : ""}`}
                  onClick={() => setActiveFilter("valid")}
                >
                  可导入 ({editableResult.validCount})
                </button>
                <button
                  className={`preview-filter-tab ${activeFilter === "error" ? "tab-active" : ""}`}
                  onClick={() => setActiveFilter("error")}
                >
                  错误行 ({editableResult.errorCount})
                  {editableResult.errorCount > 0 && (
                    <span className="tab-badge">{editableResult.errorCount}</span>
                  )}
                </button>
                <button
                  className={`preview-filter-tab ${activeFilter === "unmatched" ? "tab-active" : ""}`}
                  onClick={() => setActiveFilter("unmatched")}
                >
                  未匹配鱼缸 ({editableResult.unmatchedTankCount})
                  {editableResult.unmatchedTankCount > 0 && (
                    <span className="tab-badge tab-badge-warning">{editableResult.unmatchedTankCount}</span>
                  )}
                </button>
              </div>

              <div className="preview-content">
                {filteredRows.length === 0 ? (
                  <div className="preview-empty">
                    <div className="preview-empty-icon">📋</div>
                    <p>当前筛选条件下无数据</p>
                  </div>
                ) : (
                  <div className="preview-table-wrapper">
                    <table className="preview-table editable-preview-table">
                      <thead>
                        <tr>
                          <th>行号</th>
                          <th>鱼缸名称</th>
                          <th>鱼缸匹配</th>
                          <th>检测时间</th>
                          <th>pH</th>
                          <th>氨氮</th>
                          <th>亚硝</th>
                          <th>硝</th>
                          <th>硬度</th>
                          <th>温度</th>
                          <th>状态</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row) => {
                          const tank = row.matchedTankId
                            ? tanks.find((t) => t.id === row.matchedTankId)
                            : tanks.find((t) => t.name === row.tankName);
                          const { status, note } = evaluateRecordStatus(
                            row.metrics,
                            row.remark,
                            tank
                          );

                          return (
                            <React.Fragment key={row.id}>
                              <tr className={row.isError ? "row-error" : row.isModified ? "row-modified" : ""}>
                                <td className="row-index">
                                  {row.rowIndex}
                                  {row.isModified && <span className="modified-badge">✏️</span>}
                                </td>
                                <td className="cell-editable" onClick={() => handleCellEdit(row.id, "tankName")}>
                                  {editingCell?.rowId === row.id && editingCell?.field === "tankName" ? (
                                    <input
                                      type="text"
                                      defaultValue={row.tankName}
                                      autoFocus
                                      onBlur={(e) => {
                                        updateRowField(row.id, "tankName", e.target.value);
                                        handleCellBlur();
                                      }}
                                      onKeyDown={(e) =>
                                        handleKeyDown(e, row.id, "tankName", e.currentTarget.value)
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      className="cell-input"
                                      placeholder="输入鱼缸名称"
                                    />
                                  ) : (
                                    <span className={!row.tankName.trim() ? "cell-empty" : "cell-strong"}>
                                      {row.tankName || "点击填写"}
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <div className="tank-match-cell">
                                    <span
                                      className={`tank-match-badge ${getTankMatchStatusClass(row.tankMatchStatus)}`}
                                    >
                                      {getTankMatchStatusText(row.tankMatchStatus)}
                                    </span>
                                    {row.tankName.trim() && (
                                      <button
                                        type="button"
                                        className="tank-match-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowMatchTankModal(row.id);
                                        }}
                                      >
                                        {row.matchedTankId ? "重新关联" : "关联鱼缸"}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="cell-editable cell-muted" onClick={() => handleCellEdit(row.id, "recordedAt")}>
                                  {editingCell?.rowId === row.id && editingCell?.field === "recordedAt" ? (
                                    <input
                                      type="text"
                                      defaultValue={row.recordedAt}
                                      autoFocus
                                      onBlur={(e) => {
                                        updateRowField(row.id, "recordedAt", e.target.value);
                                        handleCellBlur();
                                      }}
                                      onKeyDown={(e) =>
                                        handleKeyDown(e, row.id, "recordedAt", e.currentTarget.value)
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      className="cell-input"
                                      placeholder="YYYY-MM-DD HH:mm"
                                    />
                                  ) : (
                                    <span className={row.missingFields.includes("recordedAt") ? "cell-missing cell-missing-autofill" : ""}>
                                      {row.recordedAt || "点击填写"}
                                      {row.missingFields.includes("recordedAt") && (
                                        <span className="cell-autofill-badge">自动填充</span>
                                      )}
                                    </span>
                                  )}
                                </td>
                                {METRIC_KEYS.map((metric, idx) => (
                                  <td
                                    key={metric}
                                    className={`cell-editable cell-metric ${
                                      row.missingFields.includes(metric) ? "cell-missing" : ""
                                    }`}
                                    onClick={() => handleCellEdit(row.id, metric)}
                                  >
                                    {editingCell?.rowId === row.id && editingCell?.field === metric ? (
                                      <input
                                        type="number"
                                        step={METRIC_STEPS[idx]}
                                        defaultValue={row.metrics[metric]}
                                        autoFocus
                                        onBlur={(e) => {
                                          updateRowField(row.id, metric, e.target.value);
                                          handleCellBlur();
                                        }}
                                        onKeyDown={(e) =>
                                          handleKeyDown(e, row.id, metric, e.currentTarget.value)
                                        }
                                        onClick={(e) => e.stopPropagation()}
                                        className="cell-input cell-input-numeric"
                                        placeholder={METRIC_LABELS[idx]}
                                      />
                                    ) : (
                                      <span>
                                        {row.metrics[metric] || <span className="cell-empty">— 未测</span>}
                                      </span>
                                    )}
                                  </td>
                                ))}
                                <td>
                                  <span className={`preview-status ${getStatusClass(status)}`}>
                                    {row.isError ? "错误" : status}
                                  </span>
                                </td>
                                <td className="cell-actions">
                                  <button
                                    type="button"
                                    className="row-action-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResetRow(row.id);
                                    }}
                                    title="重置为原始值"
                                    disabled={!row.isModified}
                                  >
                                    ↺
                                  </button>
                                  <button
                                    type="button"
                                    className="row-action-btn row-action-delete"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteRow(row.id);
                                    }}
                                    title="删除该行"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                              {row.isError && row.errors.length > 0 && (
                                <tr className="row-error-detail">
                                  <td colSpan={12}>
                                    <div className="error-tag-group">
                                      {row.errors.map((err, idx) => (
                                        <span key={idx} className="error-tag">
                                          ⚠️ {err}
                                        </span>
                                      ))}
                                      {row.missingFields
                                        .filter((f) => f === "tankName")
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
                              {!row.isError && row.remark && (
                                <tr className="row-remark">
                                  <td colSpan={12}>
                                    <span className="remark-label">备注：</span>
                                    <span onClick={() => handleCellEdit(row.id, "remark")} className="cell-editable">
                                      {editingCell?.rowId === row.id && editingCell?.field === "remark" ? (
                                        <input
                                          type="text"
                                          defaultValue={row.remark}
                                          autoFocus
                                          onBlur={(e) => {
                                            updateRowField(row.id, "remark", e.target.value);
                                            handleCellBlur();
                                          }}
                                          onKeyDown={(e) =>
                                            handleKeyDown(e, row.id, "remark", e.currentTarget.value)
                                          }
                                          onClick={(e) => e.stopPropagation()}
                                          className="cell-input cell-input-wide"
                                          placeholder="输入备注"
                                        />
                                      ) : (
                                        <span>{row.remark}</span>
                                      )}
                                    </span>
                                    <span className="remark-note">状态评估：{note}</span>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="modal-footer import-modal-footer">
          <div className="footer-legend">
            <span className="legend-item legend-error">红底 = 错误行，需修正</span>
            <span className="legend-item legend-modified">✏️ = 已修改</span>
            <span className="legend-item legend-click">点击单元格可编辑</span>
          </div>
          <div className="footer-actions">
            <button type="button" onClick={onClose} disabled={isImporting}>
              取消
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={handleImport}
              disabled={
                !editableResult ||
                editableResult.validCount === 0 ||
                isImporting
              }
            >
              {isImporting
                ? "导入中..."
                : `确认导入 (${editableResult?.validCount || 0})`}
            </button>
          </div>
        </footer>
      </div>

      {showMatchTankModal && (
        <div className="modal-overlay" onClick={() => setShowMatchTankModal(null)}>
          <div
            className="modal-content match-tank-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>关联到已有鱼缸</h2>
              <button className="modal-close" onClick={() => setShowMatchTankModal(null)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              {(() => {
                const row = editableResult?.rows.find((r) => r.id === showMatchTankModal);
                if (!row) return null;
                return (
                  <>
                    <div className="match-tank-current">
                      <p>
                        当前鱼缸名称：<strong>{row.tankName || "(未填写)"}</strong>
                      </p>
                      <p className="match-tank-hint">
                        选择一个已有鱼缸进行关联，关联后将使用该鱼缸的参数阈值进行评估。
                      </p>
                    </div>
                    {tanks.length === 0 ? (
                      <div className="empty-state">
                        <p>暂无已建档的鱼缸</p>
                      </div>
                    ) : (
                      <div className="match-tank-list">
                        {row.matchedTankId && (
                          <button
                            type="button"
                            className="match-tank-item match-tank-clear"
                            onClick={() => handleMatchTank(showMatchTankModal, null)}
                          >
                            <span className="match-tank-clear-icon">✕</span>
                            <span>取消关联</span>
                          </button>
                        )}
                        {tanks.map((tank) => (
                          <button
                            key={tank.id}
                            type="button"
                            className={`match-tank-item ${
                              row.matchedTankId === tank.id ? "match-tank-selected" : ""
                            }`}
                            onClick={() => handleMatchTank(showMatchTankModal, tank.id)}
                          >
                            <span className={`tank-type-tag tank-type-${tank.tankType}`}>
                              {tank.tankType}
                            </span>
                            <span className="match-tank-name">{tank.name}</span>
                            {row.matchedTankId === tank.id && (
                              <span className="match-tank-check">✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setShowMatchTankModal(null)}
              >
                关闭
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
