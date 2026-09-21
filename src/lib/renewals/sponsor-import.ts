export type ParsedSponsorRow = {
  sponsorFirstName: string;
  sponsorLastName: string;
  sponsorFullName: string;
  totalMembersSponsored: number | null;
  sponsoredFirstName: string;
  sponsoredLastName: string;
  sponsoredFullName: string;
  sponsoredRegion: string | null;
  sponsoredChapter: string | null;
  applicationDate: string;
};

export type ParsedSponsorReport = {
  chapterName: string | null;
  reportFrom: string | null;
  reportTo: string | null;
  runAt: string | null;
  rows: ParsedSponsorRow[];
};

type SpreadsheetCell = {
  index: number;
  value: string;
};

const requiredHeaders = [
  "Sponsor First Name",
  "Sponsor Last Name",
  "Sponsored First Name",
  "Sponsored Last Name",
  "Sponsored Region",
  "Sponsored Chapter",
  "Application Date",
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

function parseDateOnly(value: string): string {
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid sponsor application date: ${value}`);
  }

  return parsed.toISOString().slice(0, 10);
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

  throw new Error("Sponsor report headers were not found.");
}

function findParameterValue(rows: SpreadsheetCell[][], label: string): string | null {
  for (const row of rows) {
    const entries = [...cellsToMap(row).entries()].sort(([left], [right]) => left - right);
    const labelEntry = entries.find(([, value]) => value === label);

    if (!labelEntry) {
      continue;
    }

    const nextValue = entries
      .filter(([index]) => index > labelEntry[0])
      .map(([, value]) => value)
      .find((value) => value.length > 0);

    if (nextValue) {
      return nextValue;
    }
  }

  return null;
}

export function normalizeImportKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildPersonFullName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function parseSponsorReport(xml: string): ParsedSponsorReport {
  if (!xml.includes("<Workbook") || !xml.includes('ss:Name="Report"')) {
    throw new Error("Only SpreadsheetML .xls sponsor reports with a Report worksheet are supported.");
  }

  const rows = parseRows(xml);
  const headerIndexes = findHeaderIndexes(rows);
  const parsedRows: ParsedSponsorRow[] = [];

  for (const row of rows) {
    const cells = cellsToMap(row);
    const sponsorFirstName = cells.get(headerIndexes.get("Sponsor First Name")!)?.trim() ?? "";
    const sponsorLastName = cells.get(headerIndexes.get("Sponsor Last Name")!)?.trim() ?? "";
    const sponsoredFirstName = cells.get(headerIndexes.get("Sponsored First Name")!)?.trim() ?? "";
    const sponsoredLastName = cells.get(headerIndexes.get("Sponsored Last Name")!)?.trim() ?? "";
    const applicationDate = cells.get(headerIndexes.get("Application Date")!)?.trim() ?? "";

    if (
      !sponsorFirstName ||
      !sponsorLastName ||
      sponsorFirstName === "Sponsor First Name" ||
      !sponsoredFirstName ||
      !applicationDate
    ) {
      continue;
    }

    parsedRows.push({
      sponsorFirstName,
      sponsorLastName,
      sponsorFullName: buildPersonFullName(sponsorFirstName, sponsorLastName),
      totalMembersSponsored: Number(cells.get(4) ?? "") || null,
      sponsoredFirstName,
      sponsoredLastName,
      sponsoredFullName: buildPersonFullName(sponsoredFirstName, sponsoredLastName),
      sponsoredRegion: cells.get(headerIndexes.get("Sponsored Region") ?? -1)?.trim() || null,
      sponsoredChapter: cells.get(headerIndexes.get("Sponsored Chapter")!)?.trim() || null,
      applicationDate: parseDateOnly(applicationDate),
    });
  }

  return {
    chapterName: findParameterValue(rows, "Chapter:"),
    reportFrom: findParameterValue(rows, "From:") ? parseDateOnly(findParameterValue(rows, "From:")!) : null,
    reportTo: findParameterValue(rows, "To:") ? parseDateOnly(findParameterValue(rows, "To:")!) : null,
    runAt: findParameterValue(rows, "Run At"),
    rows: parsedRows,
  };
}
