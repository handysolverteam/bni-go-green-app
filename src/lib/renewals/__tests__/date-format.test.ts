import { describe, expect, it } from "vitest";
import { formatDisplayDate, formatDisplayMonth, formatTenure } from "../date-format";

describe("formatDisplayDate", () => {
  it("formats ISO date strings for display", () => {
    expect(formatDisplayDate("2022-10-21")).toBe("21 Oct 2022");
  });

  it("formats single-digit days and months without leading zeroes", () => {
    expect(formatDisplayDate("2022-01-05")).toBe("5 Jan 2022");
  });

  it("returns a dash for missing or invalid dates", () => {
    expect(formatDisplayDate(null)).toBe("-");
    expect(formatDisplayDate(undefined)).toBe("-");
    expect(formatDisplayDate("")).toBe("-");
    expect(formatDisplayDate("not-a-date")).toBe("-");
    expect(formatDisplayDate("2022-02-31")).toBe("-");
  });
});

describe("formatDisplayMonth", () => {
  it("formats ISO month strings for display", () => {
    expect(formatDisplayMonth("2026-03-01")).toBe("Mar 2026");
  });

  it("returns a dash for missing or invalid months", () => {
    expect(formatDisplayMonth(null)).toBe("-");
    expect(formatDisplayMonth(undefined)).toBe("-");
    expect(formatDisplayMonth("")).toBe("-");
    expect(formatDisplayMonth("not-a-date")).toBe("-");
    expect(formatDisplayMonth("2026-13-01")).toBe("-");
  });
});

describe("formatTenure", () => {
  const today = new Date(Date.UTC(2026, 3, 21));

  it("formats multiple years and months", () => {
    expect(formatTenure("2018-01-15", today)).toBe("8 years 3 months");
  });

  it("formats durations under one year", () => {
    expect(formatTenure("2025-05-10", today)).toBe("11 months");
  });

  it("formats very recent dates as less than one month", () => {
    expect(formatTenure("2026-04-10", today)).toBe("Less than 1 month");
  });

  it("returns a clear fallback for missing or invalid dates", () => {
    expect(formatTenure(null, today)).toBe("Tenure not set");
    expect(formatTenure(undefined, today)).toBe("Tenure not set");
    expect(formatTenure("", today)).toBe("Tenure not set");
    expect(formatTenure("invalid", today)).toBe("Tenure not set");
    expect(formatTenure("2026-13-01", today)).toBe("Tenure not set");
  });
});
