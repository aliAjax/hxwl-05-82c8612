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
