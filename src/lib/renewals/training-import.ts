type SpreadsheetCell = {
  index: number;
  value: string;
};

export type ParsedTrainingRow = {
  regionName: string | null;
  chapterName: string | null;
  firstName: string;
  lastName: string;
  memberName: string;
  eventDate: string;
  eventType: string;
  role: string | null;
  joinDate: string | null;
  inductionDate: string | null;
};

export type ParsedTrainingReport = {
  chapterName: string | null;
  reportFrom: string | null;
  reportTo: string | null;
  runAt: string | null;
  rows: ParsedTrainingRow[];
};

const requiredHeaders = [
  "Region Name",
  "Chapter Name",
  "First Name",
  "Last Name",
  "Event Date",
  "Event Type",
  "Role",
  "Join Date",
  "Induction Date",
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
    throw new Error("Training report worksheet was not found.");
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

function parseDateOnly(value: string): string {
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid training date: ${value}`);
  }

  return parsed.toISOString().slice(0, 10);
}

function parseOptionalDate(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return parseDateOnly(normalized);
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

  throw new Error("Training report headers were not found.");
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

function buildMemberFullName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function parseTrainingReport(xml: string): ParsedTrainingReport {
  if (!xml.includes("<Workbook") || !xml.includes('ss:Name="Report"')) {
    throw new Error("Only SpreadsheetML .xls training reports with a Report worksheet are supported.");
  }

  const rows = parseRows(xml);
  const headerIndexes = findHeaderIndexes(rows);
  const parsedRows: ParsedTrainingRow[] = [];

  for (const row of rows) {
    const cells = cellsToMap(row);
    const firstName = cells.get(headerIndexes.get("First Name")!)?.trim() ?? "";
    const lastName = cells.get(headerIndexes.get("Last Name")!)?.trim() ?? "";
    const eventDate = cells.get(headerIndexes.get("Event Date")!)?.trim() ?? "";
    const eventType = cells.get(headerIndexes.get("Event Type")!)?.trim() ?? "";

    if (
      !firstName ||
      !lastName ||
      firstName === "First Name" ||
      !eventDate ||
      !eventType
    ) {
      continue;
    }

    parsedRows.push({
      regionName: cells.get(headerIndexes.get("Region Name")!)?.trim() || null,
      chapterName: cells.get(headerIndexes.get("Chapter Name")!)?.trim() || null,
      firstName,
      lastName,
      memberName: buildMemberFullName(firstName, lastName),
      eventDate: parseDateOnly(eventDate),
      eventType,
      role: cells.get(headerIndexes.get("Role")!)?.trim() || null,
      joinDate: parseOptionalDate(cells.get(headerIndexes.get("Join Date")!) ?? ""),
      inductionDate: parseOptionalDate(cells.get(headerIndexes.get("Induction Date")!) ?? ""),
    });
  }

  return {
    chapterName: findParameterValue(rows, "Chapter:"),
    reportFrom: findParameterValue(rows, "From:") ? parseDateOnly(findParameterValue(rows, "From:")!) : null,
    reportTo: findParameterValue(rows, "To:") ? parseDateOnly(findParameterValue(rows, "To:")!) : null,
    runAt: findValueBelowHeader(rows, "Run At"),
    rows: parsedRows,
  };
}
