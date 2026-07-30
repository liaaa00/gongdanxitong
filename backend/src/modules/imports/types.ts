import { FieldConfig, ImportJob, OrderType } from 'src/entities';

export interface CandidateField {
  fieldCode: string;
  fieldName: string;
  fieldType: string;
  required: boolean;
}

export interface MappingSuggestion {
  suggestion: Record<string, string>;
  confidence: Record<string, number>;
  unmatched: string[];
  missingRequired: string[];
  modelUsed: string;
  promptHash: string;
  localMatchedCount: number;
  llmMatchedCount: number;
  fallbackReason?: 'no_api_key' | '401' | '403' | '404' | 'timeout' | 'network' | 'other' | 'rate_limit' | 'schema_invalid' | 'provider_error';
  raw?: unknown;
}

export interface MappingItemInput {
  header: string;
  fieldCode: string;
  defaultValue?: string;
}

export interface ParsedAttachmentLink {
  rowIndex: number;
  columnIndex: number;
  header: string;
  text: string;
  hyperlink: string;
}

export interface ParsedSheet {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  meta: {
    sheetName: string;
    totalRows: number;
    headerRows: number;
    // 0-based physical row numbers aligned with rows; used for drawing/vml attachment anchors.
    rowNumbers: number[];
    // Hyperlinks in attachment-like columns; rowIndex is a 0-based physical row number.
    attachmentLinks?: ParsedAttachmentLink[];
  };
}

export interface ImportPreviewResult {
  fileId: string;
  orderType: OrderType;
  headers: string[];
  rowCount: number;
  preview: Array<Record<string, unknown>>;
  suggestion: Record<string, string>;
  confidence: Record<string, number>;
  unmatched: string[];
  missingRequired: string[];
  availableFields: CandidateField[];
  modelUsed: string;
  localMatchedCount: number;
  llmMatchedCount: number;
  fallbackReason?: string | null;
  mapping?: Array<{ excelColumn: string; systemFieldCode: string; systemFieldName: string; confidence?: number }>;
  suggestedMapping?: Record<string, string>;
  previewRows?: Array<Record<string, unknown>>;
  totalRows?: number;
  unmatchedHeaders?: string[];
}

export interface RowValidationWarning {
  fieldCode: string;
  message: string;
  code?: string;
  originalValue?: unknown;
  normalizedValue?: unknown;
}

export interface RowValidationResult {
  ok: boolean;
  rowNo: number;
  errors: Array<{ fieldCode: string; reason: string; message: string }>;
  warnings: RowValidationWarning[];
  normalized: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface ImportValidationErrorItem {
  row: number;
  field?: string;
  message: string;
  code?: string;
  existedOrderNo?: string | null;
}

export interface ImportWarningItem {
  row: number;
  field: string;
  message: string;
  code?: string;
  originalValue?: unknown;
  normalizedValue?: unknown;
}

export interface ImportJobStatusVo {
  id: string;
  status: string;
  totalRows: number;
  successRows: number;
  failRows: number;
  progress: number;
  fieldMapping: Record<string, string> | null;
  errorReportUrl?: string | null;
  validationErrors?: ImportValidationErrorItem[];
  warnings?: ImportWarningItem[];
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

export interface ImportJobWithProgress extends ImportJob {
  progress: number;
}
