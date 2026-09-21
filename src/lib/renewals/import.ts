import type { ImportMemberRow } from "./types";

type SpreadsheetCell = {
  index: number;
  value: string;
};

export type ParsedMembershipReport = {
  reportDate: string | null;
  rows: ImportMemberRow[];
};

const requiredHeaders = [
  "Member Name",
  "Industry",
  "Type",
  "Membership Status",
  "Due Date",
  "AutoRenewal Enabled",
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
  const rowMatches = xml.matchAll(/<Row\b[\s\S]*?<\/Row>/g);
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

  throw new Error("Membership dues report headers were not found.");
}

function parseDateOnly(value: string): string {
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid due date: ${value}`);
  }

  return parsed.toISOString().slice(0, 10);
}

function parseBoolean(value: string): boolean {
  return ["y", "yes", "true", "1"].includes(value.trim().toLowerCase());
}

function findReportDate(rows: SpreadsheetCell[][]): string | null {
  for (const row of rows) {
    const current = cellsToMap(row);
    const entries = [...current.entries()].sort(([left], [right]) => left - right);
    const reportDateEntry = entries.find(([, value]) => value === "Report Date:");

    if (reportDateEntry) {
      const candidate = entries
        .filter(([index]) => index > reportDateEntry[0])
        .map(([, value]) => value)
        .find((value) => /^\d{4}-\d{2}-\d{2}/.test(value));
      return candidate ? parseDateOnly(candidate) : null;
    }
  }

  return null;
}

export function parseMembershipDuesReport(xml: string): ParsedMembershipReport {
  if (!xml.includes("<Workbook") || !xml.includes('ss:Name="Report"')) {
    throw new Error("Only SpreadsheetML .xls reports with a Report worksheet are supported.");
  }

  const rows = parseRows(xml);
  const headerIndexes = findHeaderIndexes(rows);
  const parsedRows: ImportMemberRow[] = [];

  for (const row of rows) {
    const cells = cellsToMap(row);
    const name = cells.get(headerIndexes.get("Member Name")!)?.trim() ?? "";
    const dueDate = cells.get(headerIndexes.get("Due Date")!)?.trim() ?? "";

    if (!name || name === "Member Name" || !dueDate) {
      continue;
    }

    parsedRows.push({
      name,
      industry: cells.get(headerIndexes.get("Industry")!)?.trim() ?? "",
      reportRole: cells.get(headerIndexes.get("Type")!)?.trim() ?? "",
      membershipStatus: cells.get(headerIndexes.get("Membership Status")!)?.trim() ?? "",
      dueDate: parseDateOnly(dueDate),
      autoRenewalEnabled: parseBoolean(cells.get(headerIndexes.get("AutoRenewal Enabled")!) ?? ""),
    });
  }

  return {
    reportDate: findReportDate(rows),
    rows: parsedRows,
  };
}

export function normalizeImportKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
