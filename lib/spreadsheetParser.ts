import * as XLSX from "xlsx";

export function isUsableHeader(header: string) {
  const trimmed = header.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > 80) return false;
  if (/^__EMPTY(_\d+)?$/i.test(trimmed)) return false;
  if (/^column\s*\d+$/i.test(trimmed)) return false;
  return true;
}

export function dropEmptyColumns(
  headers: string[],
  rows: Array<Record<string, unknown>>,
): { headers: string[]; rows: Array<Record<string, unknown>> } {
  const keepHeaders = headers.filter(isUsableHeader);
  if (keepHeaders.length === headers.length) {
    return { headers, rows };
  }
  const filteredRows = rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const header of keepHeaders) {
      next[header] = row[header];
    }
    return next;
  });
  return { headers: keepHeaders, rows: filteredRows };
}

/**
 * Detects the "real" header row even when the file has a title / merged row at
 * the top, and returns all data rows below it.
 *
 * Strategy: read the top ~15 rows as a matrix and score each one as a "header
 * candidate" using these signals:
 *  - number of short, non-empty text cells (positive)
 *  - ratio of text cells to numeric cells (positive — headers are rarely mostly
 *    numbers)
 *  - number of distinct values (positive — headers don't repeat)
 *  - a penalty if any cell is very long (title rows tend to have one giant
 *    concatenated cell)
 *  - a bonus if the next row contains at least one numeric value and at least
 *    as many filled cells (a real header is usually followed by data)
 * The first row with the highest score wins; ties break toward the earliest row
 * so we don't mistake a data row for a header on tables that start with text
 * columns.
 */
export function smartExtractSheet(sheet: XLSX.WorkSheet): {
  headers: string[];
  rows: Array<Record<string, unknown>>;
} {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return { headers: [], rows: [] };
  }

  const scanLimit = Math.min(15, matrix.length);

  const scoreRow = (rowIndex: number): number => {
    const row = Array.isArray(matrix[rowIndex]) ? (matrix[rowIndex] as unknown[]) : [];
    if (row.length === 0) return -1;

    let nonEmpty = 0;
    let shortText = 0;
    let numericLike = 0;
    let veryLong = 0;
    const distinct = new Set<string>();

    for (const cell of row) {
      const text = cell == null ? "" : String(cell).trim();
      if (text.length === 0) continue;
      nonEmpty += 1;
      distinct.add(text.toLowerCase());
      if (text.length > 80) {
        veryLong += 1;
        continue;
      }
      const numeric = Number(text.replace(/[, ]/g, ""));
      if (!Number.isNaN(numeric) && /^-?[\d.,\s]+$/.test(text)) {
        numericLike += 1;
      } else {
        shortText += 1;
      }
    }

    if (nonEmpty === 0) return -1;
    // Title rows typically have 1 cell; skip as header.
    if (nonEmpty === 1) return -1;

    let score = shortText * 2 + distinct.size;
    score -= numericLike * 2;
    score -= veryLong * 5;

    const next = Array.isArray(matrix[rowIndex + 1]) ? (matrix[rowIndex + 1] as unknown[]) : null;
    if (next) {
      let nextFilled = 0;
      let nextNumeric = 0;
      for (const cell of next) {
        const text = cell == null ? "" : String(cell).trim();
        if (text.length === 0) continue;
        nextFilled += 1;
        const numeric = Number(text.replace(/[, ]/g, ""));
        if (!Number.isNaN(numeric) && /^-?[\d.,\s]+$/.test(text)) {
          nextNumeric += 1;
        }
      }
      if (nextFilled >= nonEmpty) score += 2;
      if (nextNumeric > 0) score += 1;
    }

    return score;
  };

  let headerIndex = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < scanLimit; i++) {
    const score = scoreRow(i);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  }
  if (bestScore <= 0) {
    return { headers: [], rows: [] };
  }

  const headerRow = Array.isArray(matrix[headerIndex]) ? (matrix[headerIndex] as unknown[]) : [];
  const dataRows = matrix.slice(headerIndex + 1) as unknown[][];

  let columnCount = headerRow.length;
  for (const row of dataRows) {
    if (Array.isArray(row) && row.length > columnCount) columnCount = row.length;
  }

  const rawHeaders: string[] = Array.from({ length: columnCount }, (_, i) => {
    const cell = headerRow[i];
    return cell == null ? "" : String(cell).trim();
  });

  const columnKeep: boolean[] = rawHeaders.map((h, i) => {
    if (isUsableHeader(h)) return true;
    return dataRows.some((row) => {
      const v = Array.isArray(row) ? row[i] : undefined;
      return v != null && String(v).trim().length > 0;
    });
  });

  const seen = new Map<string, number>();
  const finalHeaders: string[] = [];
  const srcIndexes: number[] = [];
  for (let i = 0; i < rawHeaders.length; i++) {
    if (!columnKeep[i]) continue;
    const base = rawHeaders[i].length > 0 ? rawHeaders[i] : `Column ${i + 1}`;
    const lower = base.toLowerCase();
    const count = seen.get(lower) ?? 0;
    seen.set(lower, count + 1);
    const uniqueName = count > 0 ? `${base} (${count + 1})` : base;
    finalHeaders.push(uniqueName);
    srcIndexes.push(i);
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const row of dataRows) {
    const obj: Record<string, unknown> = {};
    let hasAny = false;
    for (let j = 0; j < finalHeaders.length; j++) {
      const value = Array.isArray(row) ? row[srcIndexes[j]] : undefined;
      const normalized = value == null ? "" : value;
      if (typeof normalized === "string") {
        if (normalized.trim().length > 0) hasAny = true;
      } else if (typeof normalized === "number" || typeof normalized === "boolean") {
        hasAny = true;
      }
      obj[finalHeaders[j]] = normalized;
    }
    if (hasAny) rows.push(obj);
  }

  return { headers: finalHeaders, rows };
}

export function parseCsvForPreview(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 1) {
    return { headers: [] as string[], rows: [] as Array<Record<string, unknown>>, rowCount: 0 };
  }
  const rawHeaders = lines[0].split(",").map((entry) => entry.trim());
  const dataLines = lines.slice(1);
  const rawRows = dataLines.map((line) => {
    const cells = line.split(",");
    return rawHeaders.reduce<Record<string, unknown>>((accumulator, header, index) => {
      accumulator[header] = cells[index]?.trim() ?? "";
      return accumulator;
    }, {});
  });
  const { headers, rows } = dropEmptyColumns(rawHeaders, rawRows);
  return { headers, rows, rowCount: rows.length };
}

/**
 * Extract all rows from a spreadsheet buffer (used for full imports).
 * Returns the first sheet's headers + all data rows.
 */
export function extractAllRowsFromBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType: string,
): { headers: string[]; rows: Array<Record<string, unknown>> } {
  const lower = fileName.toLowerCase();
  const extension = lower.split(".").pop() ?? "";
  if (extension === "csv" || mimeType === "text/csv") {
    const text = new TextDecoder("utf-8").decode(buffer);
    const { headers, rows } = parseCsvForPreview(text);
    return { headers, rows };
  }
  if (extension === "xlsx" || extension === "xls" || mimeType.includes("spreadsheet")) {
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstName = workbook.SheetNames[0];
    if (!firstName) return { headers: [], rows: [] };
    const sheet = workbook.Sheets[firstName];
    if (!sheet) return { headers: [], rows: [] };
    return smartExtractSheet(sheet);
  }
  return { headers: [], rows: [] };
}
