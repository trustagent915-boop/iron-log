import * as XLSX from "xlsx";

import { sanitizeText } from "@/lib/utils";
import type { ColumnMapping, MappingCompleteness, ParsedRow, ParsedSheetResult } from "@/lib/arm-tracker/types";

const columnAliases: Record<keyof ColumnMapping, string[]> = {
  date: ["date", "data", "fecha", "datum"],
  day: ["day", "giorno", "dia", "tag"],
  week: ["week", "settimana", "semana", "woche"],
  exercise: ["exercise", "esercizio", "ejercicio", "ubung", "exercice"],
  sets: ["sets", "set", "serie", "series"],
  reps: ["reps", "rep", "ripetizioni", "repeticiones", "repetitions"],
  weight: ["weight", "peso", "gewicht", "poids", "kg", "load", "carico"],
  notes: ["notes", "note", "notas", "notizen", "commento", "comment"]
};

type SheetCell = string | number | Date | boolean | null | undefined;

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sanitizeHeaderCell(value: SheetCell) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function extractSheetRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return { headerRowIndex: -1, rows: [] as SheetCell[][] };
  }

  const rows = XLSX.utils.sheet_to_json<SheetCell[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: false,
    defval: null
  });

  const headerRowIndex = rows.findIndex((row) => row.some((cell) => sanitizeHeaderCell(cell)));

  return { headerRowIndex, rows };
}

function toIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export function parseExcelDate(value: SheetCell): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsedDate = XLSX.SSF.parse_date_code(value);

    if (!parsedDate) {
      return null;
    }

    return toIsoDate(parsedDate.y, parsedDate.m, parsedDate.d);
  }

  const textValue = sanitizeText(value === null || value === undefined ? "" : String(value), 80);

  if (!textValue) {
    return null;
  }

  const isoMatch = textValue.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

  if (isoMatch) {
    return toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const euMatch = textValue.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);

  if (euMatch) {
    const day = Number(euMatch[1]);
    const month = Number(euMatch[2]);
    const year = euMatch[3].length === 2 ? 2000 + Number(euMatch[3]) : Number(euMatch[3]);

    return toIsoDate(year, month, day);
  }

  const fallbackDate = new Date(textValue);

  if (!Number.isNaN(fallbackDate.getTime())) {
    return fallbackDate.toISOString().slice(0, 10);
  }

  return null;
}

export function parseNum(value: SheetCell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value === null || value === undefined || value === false) {
    return null;
  }

  const rawText = sanitizeText(String(value), 80);

  if (!rawText) {
    return null;
  }

  let normalizedText = rawText.replace(/\s+/g, "");

  if (normalizedText.includes(",") && normalizedText.includes(".")) {
    normalizedText = normalizedText.replace(/\./g, "").replace(",", ".");
  } else {
    normalizedText = normalizedText.replace(",", ".");
  }

  const numericMatch = normalizedText.match(/-?\d+(?:\.\d+)?/);

  if (!numericMatch) {
    return null;
  }

  const parsedValue = Number(numericMatch[0]);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parseInteger(value: SheetCell): number | null {
  const parsedValue = parseNum(value);

  if (parsedValue === null) {
    return null;
  }

  return Math.round(parsedValue);
}

function getColumnIndex(headers: string[], headerName: string | null) {
  if (!headerName) {
    return -1;
  }

  return headers.findIndex((header) => header === headerName);
}

function getCellValue(row: SheetCell[], headers: string[], headerName: string | null) {
  const columnIndex = getColumnIndex(headers, headerName);
  return columnIndex >= 0 ? row[columnIndex] : null;
}

export function readWorkbook(buffer: ArrayBuffer) {
  return XLSX.read(buffer, { type: "array", cellDates: true });
}

export function getSheetNames(workbook: XLSX.WorkBook) {
  return workbook.SheetNames;
}

export function getSuggestedSheetName(sheetNames: string[]) {
  return (
    sheetNames.find((sheetName) => normalizeLabel(sheetName).includes("programma")) ??
    sheetNames.find((sheetName) => normalizeLabel(sheetName).includes("program")) ??
    sheetNames[0] ??
    ""
  );
}

export function getSheetHeaders(workbook: XLSX.WorkBook, sheetName: string) {
  const { headerRowIndex, rows } = extractSheetRows(workbook, sheetName);

  if (headerRowIndex < 0) {
    return [];
  }

  return rows[headerRowIndex].map(sanitizeHeaderCell).filter(Boolean);
}

export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    date: null,
    day: null,
    week: null,
    exercise: null,
    sets: null,
    reps: null,
    weight: null,
    notes: null
  };

  const usedHeaders = new Set<string>();

  (Object.keys(columnAliases) as Array<keyof ColumnMapping>).forEach((columnKey) => {
    const matchingHeader = headers.find((header) => {
      if (usedHeaders.has(header)) {
        return false;
      }

      const normalizedHeader = normalizeLabel(header);

      return columnAliases[columnKey].some((alias) => {
        const normalizedAlias = normalizeLabel(alias);
        return normalizedHeader.includes(normalizedAlias) || normalizedAlias.includes(normalizedHeader);
      });
    });

    if (matchingHeader) {
      mapping[columnKey] = matchingHeader;
      usedHeaders.add(matchingHeader);
    }
  });

  return mapping;
}

export function getMappingCompleteness(mapping: ColumnMapping): MappingCompleteness {
  const missingRequired: MappingCompleteness["missingRequired"] = [];

  if (!mapping.exercise) {
    missingRequired.push("exercise");
  }

  if (!mapping.date && !mapping.day) {
    missingRequired.push("date_or_day");
  }

  return {
    missingRequired,
    mappedCount: Object.values(mapping).filter(Boolean).length,
    totalCount: Object.keys(mapping).length
  };
}

export function parseSheet(workbook: XLSX.WorkBook, sheetName: string, mapping: ColumnMapping): ParsedSheetResult {
  const { headerRowIndex, rows } = extractSheetRows(workbook, sheetName);

  if (headerRowIndex < 0) {
    return {
      headers: [],
      rows: [],
      previewRows: [],
      warnings: ["Impossibile trovare un'intestazione valida nel foglio selezionato."],
      totalRows: 0,
      importedRows: 0,
      skippedRows: 0
    };
  }

  const headers = rows[headerRowIndex].map(sanitizeHeaderCell);
  const dataRows = rows.slice(headerRowIndex + 1);
  const parsedRows = dataRows.map<ParsedRow>((row, index) => {
    const warnings: string[] = [];
    const date = parseExcelDate(getCellValue(row, headers, mapping.date));
    const day = sanitizeText(String(getCellValue(row, headers, mapping.day) ?? ""), 80) || null;
    const week = parseInteger(getCellValue(row, headers, mapping.week));
    const exercise = sanitizeText(String(getCellValue(row, headers, mapping.exercise) ?? ""), 120) || null;
    const sets = parseInteger(getCellValue(row, headers, mapping.sets));
    const reps = parseInteger(getCellValue(row, headers, mapping.reps));
    const weight = parseNum(getCellValue(row, headers, mapping.weight));
    const notes = sanitizeText(String(getCellValue(row, headers, mapping.notes) ?? ""), 240) || null;

    if (!exercise) {
      warnings.push(`Riga ${index + headerRowIndex + 2}: esercizio mancante.`);
    }

    if (!date && !day) {
      warnings.push(`Riga ${index + headerRowIndex + 2}: serve almeno una data o un'etichetta giorno.`);
    } else if (!date && day) {
      warnings.push(`Riga ${index + headerRowIndex + 2}: data mancante, verrà stimata in importazione.`);
    }

    return {
      date,
      day,
      week,
      exercise,
      sets,
      reps,
      weight,
      notes,
      rowIndex: index + headerRowIndex + 2,
      warnings,
      valid: Boolean(exercise && (date || day))
    };
  });

  const warnings = parsedRows.flatMap((row) => row.warnings);
  const validRows = parsedRows.filter((row) => row.valid);

  return {
    headers,
    rows: parsedRows,
    previewRows: validRows.slice(0, 20),
    warnings,
    totalRows: parsedRows.length,
    importedRows: validRows.length,
    skippedRows: parsedRows.length - validRows.length
  };
}
