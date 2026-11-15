export const DEFAULT_CHUNK_TOKENS = 500;
export const DEFAULT_CHUNK_OVERLAP_TOKENS = 75;
export const DEFAULT_MAX_HISTORY_TOKENS = 3000;
export const DEFAULT_AGENT_MAX_STEPS = 6;
export const DEFAULT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_UPLOAD_MAX_ROWS = 5000;
export const DEFAULT_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_IMAGE_MAX_WIDTH = 1280;
export const DEFAULT_IMAGE_QUALITY = 80;
export const DEFAULT_CONFIRMATION_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const DEFAULT_IMPORT_BATCH_SIZE = 50;

export const ALLOWED_SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const;
export const ALLOWED_SPREADSHEET_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/octet-stream',
] as const;

export const ALLOWED_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
] as const;

export const RTL_LANGUAGE_CODES = new Set(['ar', 'he', 'fa', 'ur']);

export const SUPPORTED_LANGUAGES = {
  en: 'English',
  ml: 'Malayalam',
} as const;
