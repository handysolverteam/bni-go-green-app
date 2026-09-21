import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validatePalmsReportWindow } from "../palms-validation";
import {
  buildPalmsReportIdentity,
  matchPalmsRowMembers,
  parsePalmsChapterSummaryReport,
  type ParsedPalmsReport,
} from "../palms-import";

const sampleReport =
  "C:\\Users\\rahul\\Downloads\\Chapter_Summary_PALMS_Report_21-04-2026_10-59_AM.xls";
const julyMonthlyReport =
  "C:\\Users\\rahul\\Downloads\\Chapter_Summary_PALMS_Report_04-08-2026_7-06_PM.xls";

describe("parsePalmsChapterSummaryReport", () => {
  const sampleReportTest = existsSync(sampleReport) ? it : it.skip;

  sampleReportTest("extracts report metadata and member rows from the provided sample report", () => {
    expect(existsSync(sampleReport)).toBe(true);

    const parsed = parsePalmsChapterSummaryReport(readFileSync(sampleReport, "utf8"));

    expect(parsed.chapterName).toBe("Influencers");
    expect(parsed.reportFrom).toBe("2015-10-01");
    expect(parsed.reportTo).toBe("2026-03-31");
    expect(parsed.runAt).toBe("2026-04-21T05:29:34.000Z");
    expect(parsed.rows[0]).toMatchObject({
      firstName: "Garima",
      lastName: "Agarwal",
      name: "Garima Agarwal",
      presentCount: 93,
      absentCount: 0,
      referralsGivenInside: 84,
      referralsGivenOutside: 44,
      visitors: 18,
      oneToOnes: 163,
      tyfcb: 4130635,
      ceu: 19,
      trainings: 8,
    });
  });

  it("matches rows to members by normalized full name", () => {
    const rows = [
      {
        firstName: "Garima",
        lastName: "Agarwal",
        name: "Garima Agarwal",
        presentCount: 1,
        absentCount: 0,
        lateCount: 0,
        medicalCount: 0,
        substituteCount: 0,
        referralsGivenInside: 0,
        referralsGivenOutside: 0,
        referralsReceivedInside: 0,
        referralsReceivedOutside: 0,
        visitors: 0,
        oneToOnes: 0,
        tyfcb: null,
        ceu: 0,
        trainings: 0,
      },
    ];

    const matched = matchPalmsRowMembers(rows, [{ name: "  garima   agarwal " }]);

    expect(matched[0].matches).toHaveLength(1);
  });

  sampleReportTest("builds a stable report identity from the chapter and report window", () => {
    const parsed = parsePalmsChapterSummaryReport(readFileSync(sampleReport, "utf8"));

    expect(buildPalmsReportIdentity(parsed)).toBe("Influencers|2015-10-01|2026-03-31");
  });

  const julyMonthlyReportTest = existsSync(julyMonthlyReport) ? it : it.skip;

  julyMonthlyReportTest("recognizes the August 4 export as the July monthly PALMS report", () => {
    const parsed = parsePalmsChapterSummaryReport(readFileSync(julyMonthlyReport, "utf8"));

    expect(parsed.chapterName).toBe("Influencers");
    expect(parsed.reportFrom).toBe("2026-07-01");
    expect(parsed.reportTo).toBe("2026-07-31");
    expect(() => validatePalmsReportWindow(parsed, "monthly")).not.toThrow();
  });
});

describe("validatePalmsReportWindow", () => {
  const baseReport: ParsedPalmsReport = {
    chapterName: "Influencers",
    reportFrom: "2015-10-01",
    reportTo: "2026-03-31",
    runAt: null,
    rows: [],
  };

  it("accepts broad PALMS windows for lifetime imports", () => {
    expect(() => validatePalmsReportWindow(baseReport, "lifetime")).not.toThrow();
  });

  it("rejects broad PALMS windows for monthly imports", () => {
    expect(() => validatePalmsReportWindow(baseReport, "monthly")).toThrow(
      "This PALMS file is not a single calendar month.",
    );
  });

  it("rejects exact monthly PALMS windows for lifetime imports", () => {
    expect(() =>
      validatePalmsReportWindow(
        {
          ...baseReport,
          reportFrom: "2026-04-01",
          reportTo: "2026-04-30",
        },
        "lifetime",
      ),
    ).toThrow("This is a monthly PALMS file. Use the monthly PALMS upload instead.");
  });

  it("accepts PALMS datetime values when checking monthly report windows", () => {
    expect(() =>
      validatePalmsReportWindow(
        {
          ...baseReport,
          reportFrom: "2026-07-01T00:00:00",
          reportTo: "2026-07-31T00:00:00",
        },
        "monthly",
      ),
    ).not.toThrow();
  });
});
