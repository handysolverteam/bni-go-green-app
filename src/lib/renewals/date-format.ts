const shortMonths = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDisplayDate(date: string | null | undefined): string {
  if (!date) {
    return "-";
  }

  const [yearText, monthText, dayText] = date.slice(0, 10).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return "-";
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return "-";
  }

  return `${day} ${shortMonths[month - 1]} ${year}`;
}

export function formatDisplayMonth(date: string | null | undefined): string {
  if (!date) {
    return "-";
  }

  const [yearText, monthText] = date.slice(0, 10).split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return "-";
  }

  return `${shortMonths[month - 1]} ${year}`;
}

export function formatTenure(
  memberSince: string | null | undefined,
  today = new Date(),
): string {
  if (!memberSince) {
    return "Tenure not set";
  }

  const [yearText, monthText, dayText] = memberSince.slice(0, 10).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return "Tenure not set";
  }

  const start = new Date(Date.UTC(year, month - 1, day));

  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== day
  ) {
    return "Tenure not set";
  }

  const comparisonDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  if (start.getTime() > comparisonDate.getTime()) {
    return "Tenure not set";
  }

  let years = comparisonDate.getUTCFullYear() - start.getUTCFullYear();
  let months = comparisonDate.getUTCMonth() - start.getUTCMonth();

  if (comparisonDate.getUTCDate() < start.getUTCDate()) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0 && months <= 0) {
    return "Less than 1 month";
  }

  if (years <= 0) {
    return `${months} month${months === 1 ? "" : "s"}`;
  }

  if (months <= 0) {
    return `${years} year${years === 1 ? "" : "s"}`;
  }

  return `${years} year${years === 1 ? "" : "s"} ${months} month${months === 1 ? "" : "s"}`;
}
