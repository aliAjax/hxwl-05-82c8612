import type { WaterMetrics, WaterRecord, RecordStatus } from "../db/types";

export interface ParsedWaterRecord {
  tankName: string;
  recordedAt: string;
  metrics: WaterMetrics;
  remark: string;
}

export interface ValidRow {
  type: "valid";
  rowIndex: number;
  rawLine: string;
  data: ParsedWaterRecord;
  missingFields: string[];
}

export interface ErrorRow {
  type: "error";
  rowIndex: number;
  rawLine: string;
  errors: string[];
  missingFields: string[];
}

export type RowResult = ValidRow | ErrorRow;

export interface ParseResult {
  validRows: ValidRow[];
  errorRows: ErrorRow[];
  totalRows: number;
}

export interface PreparedRecord {
  tankName: string;
  tankId?: string;
  recordedAt: string;
  metrics: WaterMetrics;
  status: RecordStatus;
  note: string;
}

export type TankMatchStatus = "matched" | "unmatched" | "manual" | "new";

export interface EditableRow {
  id: string;
  rowIndex: number;
  rawLine: string;
  tankName: string;
  recordedAt: string;
  metrics: WaterMetrics;
  remark: string;
  tankMatchStatus: TankMatchStatus;
  matchedTankId?: string;
  isError: boolean;
  errors: string[];
  missingFields: string[];
  isModified: boolean;
  originalTankName: string;
  originalRecordedAt: string;
  originalMetrics: WaterMetrics;
}

export interface EditableParseResult {
  rows: EditableRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  unmatchedTankCount: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  missingFields: string[];
}
