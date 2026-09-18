import { normalizeImportKey } from "./import";

type SpreadsheetCell = {
  index: number;
  value: string;
};

export type ParsedPalmsRow = {
  firstName: string;
  lastName: string;
  name: string;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  medicalCount: number;
  substituteCount: number;
  referralsGivenInside: number;
  referralsGivenOutside: number;
  referralsReceivedInside: number;
  referralsReceivedOutside: number;
  visitors: number;
  oneToOnes: number;
  tyfcb: number | null;
  ceu: number;
  trainings: number;
};

export type ParsedPalmsReport = {
  chapterName: string | null;
  reportFrom: string | null;
  reportTo: string | null;
  runAt: string | null;
  rows: ParsedPalmsRow[];
};

export function buildPalmsReportIdentity(report: Pick<ParsedPalmsReport, "chapterName" | "reportFrom" | "reportTo">): string {
  return [
    report.chapterName ?? "Unknown chapter",
    report.reportFrom ?? "unknown-from",
    report.reportTo ?? "unknown-to",
  ].join("|");
}

const requiredHeaders = [
  "First Name",
  "Last Name",
  "P",
  "A",
  "L",
  "M",
  "S",
  "RGI",
  "RGO",
  "RRI",
  "RRO",
  "V",
  "1-2-1",
  "TYFCB",
  "CEU",
  "T",
] as const;

function getAttribute(source: string, name: string): string | null {
  const match = source.match(new RegExp(`${name}="([^"]+)"`));
  return match?.[1] ?? null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function parseRows(xml: string): SpreadsheetCell[][] {
  const reportWorksheetMatch = xml.match(
    /<Worksheet\b[^>]*?(?:ss:Name|Name)="Report"[\s\S]*?<(?:ss:)?Table\b[^>]*>([\s\S]*?)<\/(?:ss:)?Table>[\s\S]*?<\/Worksheet>/i,
  );

  if (!reportWorksheetMatch) {
    throw new Error("PALMS chapter summary Report worksheet was not found.");
  }

  const rowMatches = reportWorksheetMatch[1].matchAll(/<Row\b[\s\S]*?<\/Row>/g);
  const rows: SpreadsheetCell[][] = [];

  for (const rowMatch of rowMatches) {
    const rowXml = rowMatch[0];
    const cells: SpreadsheetCell[] = [];
    let nextIndex = 1;

    for (const cellMatch of rowXml.matchAll(/<Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Cell>)/g)) {
      const attributes = cellMatch[1] ?? "";
      const explicitIndex = getAttribute(attributes, "ss:Index") ?? getAttribute(attributes, "Index");
      const mergeAcross = Number(
        getAttribute(attributes, "ss:MergeAcross") ?? getAttribute(attributes, "MergeAcross") ?? 0,
      );
      const index = explicitIndex ? Number(explicitIndex) : nextIndex;
      const dataXml = cellMatch[2] ?? "";
      const dataMatch = dataXml.match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/);
      const value = dataMatch ? decodeXml(stripTags(dataMatch[1])).trim() : "";

      cells.push({ index, value });
      nextIndex = index + mergeAcross + 1;
    }

    rows.push(cells);
  }

  return rows;
}

function cellsToMap(cells: SpreadsheetCell[]): Map<number, string> {
  return new Map(cells.map((cell) => [cell.index, cell.value]));
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function findHeaderIndexes(rows: SpreadsheetCell[][]): Map<string, number> {
  for (const row of rows) {
    const indexes = new Map<string, number>();

    for (const cell of row) {
      const header = normalizeHeader(cell.value);
      if (requiredHeaders.includes(header as (typeof requiredHeaders)[number])) {
        indexes.set(header, cell.index);
      }
    }

    if (requiredHeaders.every((header) => indexes.has(header))) {
      return indexes;
    }
  }

  throw new Error("PALMS report headers were not found.");
}

function parseNumber(value: string): number {
  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return parsed;
}

function parseOptionalNumber(value: string): number | null {
  const normalized = value.trim();

  if (!normalized || normalized === "-") {
    return null;
  }

  return parseNumber(normalized);
}

function parseDateOnly(value: string): string {
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return parsed.toISOString().slice(0, 10);
}

function parseTimestamp(value: string): string | null {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function findRowValue(rows: SpreadsheetCell[][], label: string): string | null {
  for (const row of rows) {
    const values = row.map((cell) => cell.value);
    const labelIndex = values.findIndex((value) => value === label);

    if (labelIndex >= 0) {
      return values[labelIndex + 1] ?? null;
    }
  }

  return null;
}

function findValueBelowHeader(rows: SpreadsheetCell[][], header: string): string | null {
  for (let index = 0; index < rows.length - 1; index += 1) {
    const currentRow = rows[index];
    const nextRow = rows[index + 1];
    const headerCell = currentRow.find((cell) => cell.value === header);

    if (!headerCell) {
      continue;
    }

    return nextRow.find((cell) => cell.index === headerCell.index)?.value ?? null;
  }

  return null;
}

export function matchPalmsRowMembers<T extends { name: string }>(rows: ParsedPalmsRow[], members: T[]) {
  const membersByName = new Map<string, T[]>();

  for (const member of members) {
    const key = normalizeImportKey(member.name);
    membersByName.set(key, [...(membersByName.get(key) ?? []), member]);
  }

  return rows.map((row) => ({
    row,
    matches: membersByName.get(normalizeImportKey(row.name)) ?? [],
  }));
}

export function parsePalmsChapterSummaryReport(xml: string): ParsedPalmsReport {
  if (!xml.includes("<Workbook") || !xml.includes('ss:Name="Report"')) {
    throw new Error("Only SpreadsheetML .xls PALMS reports with a Report worksheet are supported.");
  }

  const rows = parseRows(xml);
  const headerIndexes = findHeaderIndexes(rows);
  const parsedRows: ParsedPalmsRow[] = [];

  for (const row of rows) {
    const cells = cellsToMap(row);
    const firstName = cells.get(headerIndexes.get("First Name")!)?.trim() ?? "";
    const lastName = cells.get(headerIndexes.get("Last Name")!)?.trim() ?? "";

    if (!firstName || !lastName || firstName === "First Name") {
      continue;
    }

    parsedRows.push({
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      presentCount: parseNumber(cells.get(headerIndexes.get("P")!) ?? "0"),
      absentCount: parseNumber(cells.get(headerIndexes.get("A")!) ?? "0"),
      lateCount: parseNumber(cells.get(headerIndexes.get("L")!) ?? "0"),
      medicalCount: parseNumber(cells.get(headerIndexes.get("M")!) ?? "0"),
      substituteCount: parseNumber(cells.get(headerIndexes.get("S")!) ?? "0"),
      referralsGivenInside: parseNumber(cells.get(headerIndexes.get("RGI")!) ?? "0"),
      referralsGivenOutside: parseNumber(cells.get(headerIndexes.get("RGO")!) ?? "0"),
      referralsReceivedInside: parseNumber(cells.get(headerIndexes.get("RRI")!) ?? "0"),
      referralsReceivedOutside: parseNumber(cells.get(headerIndexes.get("RRO")!) ?? "0"),
      visitors: parseNumber(cells.get(headerIndexes.get("V")!) ?? "0"),
      oneToOnes: parseNumber(cells.get(headerIndexes.get("1-2-1")!) ?? "0"),
      tyfcb: parseOptionalNumber(cells.get(headerIndexes.get("TYFCB")!) ?? ""),
      ceu: parseNumber(cells.get(headerIndexes.get("CEU")!) ?? "0"),
      trainings: parseNumber(cells.get(headerIndexes.get("T")!) ?? "0"),
    });
  }

  return {
    chapterName: findRowValue(rows, "Chapter:"),
    reportFrom: findRowValue(rows, "From:") ? parseDateOnly(findRowValue(rows, "From:")!) : null,
    reportTo: findRowValue(rows, "To:") ? parseDateOnly(findRowValue(rows, "To:")!) : null,
    runAt: parseTimestamp(findValueBelowHeader(rows, "Run At") ?? ""),
    rows: parsedRows,
  };
}
