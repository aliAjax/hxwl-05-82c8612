import type { WaterMetrics } from "../db/types";
import type {
  ParseResult,
  ParsedWaterRecord,
  RowResult,
  ValidRow,
  ErrorRow,
} from "./types";

const FIELD_ALIASES: Record<keyof ParsedWaterRecord | keyof WaterMetrics, string[]> = {
  tankName: ["鱼缸名称", "鱼缸", "缸名", "tank", "tankname", "name"],
  recordedAt: ["检测时间", "时间", "日期", "检测日期", "recordedat", "time", "date", "datetime"],
  ph: ["pH", "ph", "PH", "酸碱度", "ph值"],
  ammonia: ["氨氮", "氨", "ammonia", "nh3", "nh4"],
  nitrite: ["亚硝酸盐", "亚硝", "nitrite", "no2"],
  nitrate: ["硝酸盐", "硝", "nitrate", "no3"],
  hardness: ["硬度", "gh", "hardness", "dgh"],
  temperature: ["温度", "水温", "temp", "temperature", "t"],
  waterChange: [],
  remark: ["备注", "说明", "note", "remark", "comment", "注释"],
};

const NUMERIC_FIELDS: (keyof WaterMetrics)[] = [
  "ph",
  "ammonia",
  "nitrite",
  "nitrate",
  "hardness",
  "temperature",
];

const METRIC_KEYS = [...NUMERIC_FIELDS, "waterChange"] as const;

const REQUIRED_FIELDS = ["tankName"] as const;

const LABEL_MAP: Record<string, string> = {
  tankName: "鱼缸名称",
  recordedAt: "检测时间",
  ph: "pH",
  ammonia: "氨氮",
  nitrite: "亚硝酸盐",
  nitrate: "硝酸盐",
  hardness: "硬度",
  temperature: "温度",
  waterChange: "换水量",
  remark: "备注",
};

function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s_/()-]/g, "")
    .replace(/（/g, "")
    .replace(/）/g, "");
}

function matchField(header: string): keyof ParsedWaterRecord | keyof WaterMetrics | null {
  const normalized = normalizeText(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const fieldNormalized = normalizeText(field);
    if (normalized === fieldNormalized) return field as keyof ParsedWaterRecord | keyof WaterMetrics;
    for (const alias of aliases) {
      if (normalized === normalizeText(alias)) return field as keyof ParsedWaterRecord | keyof WaterMetrics;
    }
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === "," || char === "\t") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result.map((v) => v.trim());
}

function parseDateTime(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  
  const formats = [
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/,
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/,
  ];
  
  for (const fmt of formats) {
    const m = cleaned.match(fmt);
    if (m) {
      let y: number, mo: number, d: number, h: number, mi: number;
      if (/^\d{4}/.test(cleaned)) {
        y = parseInt(m[1]);
        mo = parseInt(m[2]) - 1;
        d = parseInt(m[3]);
        h = m[4] ? parseInt(m[4]) : 0;
        mi = m[5] ? parseInt(m[5]) : 0;
      } else {
        d = parseInt(m[1]);
        mo = parseInt(m[2]) - 1;
        y = parseInt(m[3]);
        h = m[4] ? parseInt(m[4]) : 0;
        mi = m[5] ? parseInt(m[5]) : 0;
      }
      const dt = new Date(y, mo, d, h, mi);
      if (!isNaN(dt.getTime())) {
        return `${y}-${pad(mo + 1)}-${pad(d)} ${pad(h)}:${pad(mi)}`;
      }
    }
  }
  
  const isoMatch = cleaned.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (isoMatch) {
    const dt = new Date(isoMatch[1]);
    if (!isNaN(dt.getTime())) {
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    }
  }
  
  const ts = Date.parse(cleaned);
  if (!isNaN(ts)) {
    const dt = new Date(ts);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }
  
  return null;
}

function cleanNumeric(raw: string): string {
  if (!raw) return "";
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return "";
  const num = parseFloat(cleaned);
  if (isNaN(num)) return "";
  return String(num);
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  
  if (nonEmptyLines.length === 0) {
    return { headers: [], rows: [] };
  }
  
  const hasHeader = /鱼缸|tank|pH|ph|氨氮|亚硝酸盐|硝酸盐|硬度|温度|检测时间|时间|日期/i.test(nonEmptyLines[0]);
  
  if (hasHeader) {
    const headers = parseCsvLine(nonEmptyLines[0]);
    const rows = nonEmptyLines.slice(1).map(parseCsvLine);
    return { headers, rows };
  } else {
    const defaultHeaders = ["鱼缸名称", "检测时间", "pH", "氨氮", "亚硝酸盐", "硝酸盐", "硬度", "温度", "备注"];
    const rows = nonEmptyLines.map(parseCsvLine);
    return { headers: defaultHeaders, rows };
  }
}

export function parseWaterRecordsCsv(text: string): ParseResult {
  const { headers, rows } = parseCsv(text);
  
  const columnMap = new Map<number, keyof ParsedWaterRecord | keyof WaterMetrics>();
  headers.forEach((header, idx) => {
    const field = matchField(header);
    if (field) {
      columnMap.set(idx, field);
    }
  });
  
  const validRows: ValidRow[] = [];
  const errorRows: ErrorRow[] = [];
  
  const pad = (n: number) => String(n).padStart(2, "0");
  
  rows.forEach((row, rowIdx) => {
    const rowIndex = rowIdx + 2;
    const rawLine = row.join(", ");
    const errors: string[] = [];
    const missingFields: string[] = [];
    
    const record: ParsedWaterRecord = {
      tankName: "",
      recordedAt: "",
      metrics: {
        ph: "",
        ammonia: "",
        nitrite: "",
        nitrate: "",
        hardness: "",
        temperature: "",
        waterChange: "",
      },
      remark: "",
    };
    
    columnMap.forEach((field, colIdx) => {
      const value = row[colIdx] || "";
      if (field === "tankName") {
        record.tankName = value;
      } else if (field === "recordedAt") {
        record.recordedAt = value;
      } else if (field === "remark") {
        record.remark = value;
      } else if (METRIC_KEYS.includes(field as keyof WaterMetrics)) {
        const metricKey = field as keyof WaterMetrics;
        if (NUMERIC_FIELDS.includes(metricKey)) {
          record.metrics[metricKey] = cleanNumeric(value);
        } else {
          record.metrics[metricKey] = value;
        }
      }
    });
    
    if (!record.tankName.trim()) {
      missingFields.push("tankName");
    }
    
    if (!record.recordedAt.trim()) {
      missingFields.push("recordedAt");
      const now = new Date();
      record.recordedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    } else {
      const parsedDate = parseDateTime(record.recordedAt);
      if (parsedDate) {
        record.recordedAt = parsedDate;
      } else {
        errors.push(`检测时间格式不正确: ${record.recordedAt}`);
      }
    }
    
    NUMERIC_FIELDS.forEach((field) => {
      if (!record.metrics[field].trim()) {
        missingFields.push(field);
      }
    });
    
    const hasAnyMetric = NUMERIC_FIELDS.some((k) => record.metrics[k].trim() !== "");
    if (!hasAnyMetric) {
      errors.push("至少需要一项水质指标(pH、氨氮、亚硝酸盐、硝酸盐、硬度、温度)");
    }
    
    if (record.metrics.ph) {
      const v = parseFloat(record.metrics.ph);
      if (v < 0 || v > 14) errors.push("pH 值应在 0-14 范围内");
    }
    if (record.metrics.ammonia) {
      const v = parseFloat(record.metrics.ammonia);
      if (v < 0) errors.push("氨氮不能为负数");
    }
    if (record.metrics.nitrite) {
      const v = parseFloat(record.metrics.nitrite);
      if (v < 0) errors.push("亚硝酸盐不能为负数");
    }
    if (record.metrics.nitrate) {
      const v = parseFloat(record.metrics.nitrate);
      if (v < 0) errors.push("硝酸盐不能为负数");
    }
    if (record.metrics.temperature) {
      const v = parseFloat(record.metrics.temperature);
      if (v < 0 || v > 50) errors.push("温度应在 0-50°C 范围内");
    }
    
    if (errors.length > 0 || missingFields.includes("tankName")) {
      errorRows.push({
        type: "error",
        rowIndex,
        rawLine,
        errors,
        missingFields,
      });
    } else {
      validRows.push({
        type: "valid",
        rowIndex,
        rawLine,
        data: record,
        missingFields,
      });
    }
  });
  
  return {
    validRows,
    errorRows,
    totalRows: rows.length,
  };
}

type MissingCategory = "required" | "autoFill" | "empty" | "optional";

const MISSING_CATEGORY: Record<string, MissingCategory> = {
  tankName: "required",
  recordedAt: "autoFill",
  ph: "empty",
  ammonia: "empty",
  nitrite: "empty",
  nitrate: "empty",
  hardness: "empty",
  temperature: "empty",
  waterChange: "optional",
  remark: "optional",
};

const MISSING_DESCRIPTION: Record<string, string> = {
  tankName: "必填字段，不能为空",
  recordedAt: "未填写，已自动填充为当前时间",
  ph: "未填写，按无数据处理，不参与状态评估",
  ammonia: "未填写，按无数据处理，不参与状态评估",
  nitrite: "未填写，按无数据处理，不参与状态评估",
  nitrate: "未填写，按无数据处理，不参与状态评估",
  hardness: "未填写，按无数据处理，不参与状态评估",
  temperature: "未填写，按无数据处理，不参与状态评估",
  waterChange: "未填写",
  remark: "未填写",
};

const CATEGORY_LABEL: Record<MissingCategory, string> = {
  required: "必填",
  autoFill: "自动填充",
  empty: "无数据",
  optional: "可选",
};

export { MISSING_DESCRIPTION, MISSING_CATEGORY, CATEGORY_LABEL };

export const FIELD_LABELS = LABEL_MAP;

export const SAMPLE_CSV = `鱼缸名称,检测时间,pH,氨氮,亚硝酸盐,硝酸盐,硬度,温度,备注
草缸A,2026-06-15 09:30,6.8,0,0,18,8,26,正常稳定
海缸B,2026-06-15 10:00,8.1,0.02,0.01,5,12,27,钙硬度偏低
繁殖缸C,2026-06-15 14:20,7.2,0.1,0.3,25,6,28,亚硝酸盐升高`;

export interface MissingFieldSummary {
  field: string;
  label: string;
  category: MissingCategory;
  description: string;
  count: number;
}

export function getMissingFieldSummary(result: ParseResult): MissingFieldSummary[] {
  const fieldCounts = new Map<string, number>();

  const allRows = [
    ...result.validRows.map((r) => r.missingFields),
    ...result.errorRows.map((r) => r.missingFields),
  ];

  for (const missingFields of allRows) {
    for (const field of missingFields) {
      fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
    }
  }

  const summary: MissingFieldSummary[] = [];
  for (const [field, count] of fieldCounts.entries()) {
    summary.push({
      field,
      label: LABEL_MAP[field] || field,
      category: MISSING_CATEGORY[field] || "optional",
      description: MISSING_DESCRIPTION[field] || "未填写",
      count,
    });
  }

  const order: MissingCategory[] = ["required", "autoFill", "empty", "optional"];
  summary.sort((a, b) => {
    const aOrder = order.indexOf(a.category);
    const bOrder = order.indexOf(b.category);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.count - a.count;
  });

  return summary;
}
