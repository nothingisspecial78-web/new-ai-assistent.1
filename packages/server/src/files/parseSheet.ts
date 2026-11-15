import path from 'node:path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedSheetData {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  totalRows: number;
  truncated: boolean;
}

export function parseSpreadsheetBuffer(
  buffer: Buffer,
  filename: string,
  maxRows = 5000
): ParsedSheetData {
  const ext = path.extname(filename).toLowerCase();

  let rawRows: Array<Record<string, unknown>> = [];

  if (ext === '.csv') {
    const csvText = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const parsed = Papa.parse<Record<string, unknown>>(csvText, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    });
    rawRows = parsed.data || [];
  } else {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { headers: [], rows: [], totalRows: 0, truncated: false };
    }
    const sheet = workbook.Sheets[firstSheetName];
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });
  }

  // Filter out completely blank rows
  const nonEmptyRows = rawRows.filter((row) =>
    Object.values(row).some((v) => String(v ?? '').trim().length > 0)
  );

  const totalRows = nonEmptyRows.length;
  const truncated = totalRows > maxRows;
  const slicedRows = truncated ? nonEmptyRows.slice(0, maxRows) : nonEmptyRows;

  const headerSet = new Set<string>();
  for (const row of slicedRows) {
    for (const key of Object.keys(row)) {
      const trimmed = key.trim();
      if (trimmed) headerSet.add(trimmed);
    }
  }

  return {
    headers: Array.from(headerSet),
    rows: slicedRows,
    totalRows,
    truncated,
  };
}
