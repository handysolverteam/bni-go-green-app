import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";
import {
  getTrafficLightColor,
  parseTrafficLightReport,
  parseTrafficLightReportMonth,
  parseTrafficLightReportWindow,
  parseTrafficLightPdfScoreReport,
  parseTrafficLightXlsxReport,
} from "../traffic-lights";

const sampleXlsxReport = "C:\\Users\\rahul\\Downloads\\Influencers April '26.xlsx";
const sampleJunePdfReport = "C:\\Users\\rahul\\Downloads\\Influencers June '26 without TYFCB.pdf";

async function extractPdfTextForTest(filename: string): Promise<string> {
  PDFParse.setWorker(
    pathToFileURL(
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
    ).toString(),
  );
  const parser = new PDFParse({ data: readFileSync(filename) });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    void parser.destroy();
  }
}

const januaryText = `First Name Last Name P A L M S RGT RRT V T TYFCB Trainings WEEK Total
Neraj K Anand 26 0 0 0 0 108 120 19 2 1,06,74,768     3 26 95
Nitin Sharma- Chef 25 0 0 1 0 39 27 4 3 19,00,752         0 26 65
Sumit Jain 6 0 0 0 0 4 2 2 0 -                    2 6 45
Sunil Vashisht 22 0 0 1 3 7 25 1 0 3,02,630           0 26 20
MEMBER TRAFFIC LIGHTS OF INFLUENCERS CHAPTER FOR  AUG-25  TO  JAN-26`;

const marchText = `First Name Last Name P A L M S RGT RRT V T Trainings WEEK Total
Neraj K Anand 26 0 0 0 0 87 113 17 2 3 26 95
Dr. Hemesh Thakur 26 0 0 0 0 7 57 2 2 0 26 30
Sunil Vashisht 21 0 0 1 4 5 27 1 2 0 26 35
MEMBER TRAFFIC LIGHTS OF INFLUENCERS CHAPTER FOR  OCT-25  TO  MAR-26`;

const juneScorePdfText = `Chapter Name Total Score Attendance Score CEU Score 121 Score Referrals Given Score TYFCB Score Visitor Score Sponsor Score
Influencers Neraj K Anand 100 10 10 20 25 5 25 5
Influencers Richa Mongia 95 10 10 20 25 5 25 0
Influencers Nitin Sharma- Chef 94 10 5 20 25 4 25 5
MEMBER TRAFFIC LIGHTS OF INFLUENCERS CHAPTER FOR JUNE '26

-- 1 of 2 --

Influencers Dr. Hemesh Thakur 44 10 5 20 5 4 0 0
Influencers Sandeep Chopra 15 10 0 0 0 0 5 0

-- 2 of 2 --`;

describe("traffic-light parsing", () => {
  it("extracts the end month from the report footer", () => {
    expect(parseTrafficLightReportMonth(januaryText)).toBe("2026-01-01");
    expect(parseTrafficLightReportMonth(marchText)).toBe("2026-03-01");
  });

  it("extracts the full report window from the footer", () => {
    expect(parseTrafficLightReportWindow(januaryText)).toEqual({
      reportWindowStart: "2025-08-01",
      reportWindowEnd: "2026-01-01",
    });
    expect(parseTrafficLightReportWindow(marchText)).toEqual({
      reportWindowStart: "2025-10-01",
      reportWindowEnd: "2026-03-01",
    });
  });

  it("maps score bands to traffic-light colors", () => {
    expect(getTrafficLightColor(70)).toBe("green");
    expect(getTrafficLightColor(50)).toBe("yellow");
    expect(getTrafficLightColor(30)).toBe("red");
    expect(getTrafficLightColor(25)).toBe("grey");
  });

  it("parses rows with TYFCB", () => {
    const parsed = parseTrafficLightReport(januaryText);

    expect(parsed.hasTyfcb).toBe(true);
    expect(parsed.reportMonth).toBe("2026-01-01");
    expect(parsed.reportWindowStart).toBe("2025-08-01");
    expect(parsed.reportWindowEnd).toBe("2026-01-01");
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[0]).toMatchObject({
      name: "Neraj K Anand",
      presentCount: 26,
      referralsGiven: 108,
      referralsReceived: 120,
      tyfcb: 10674768,
      trainings: 3,
      weekCount: 26,
      score: 95,
      color: "green",
    });
    expect(parsed.rows[1].name).toBe("Nitin Sharma- Chef");
    expect(parsed.rows[2].tyfcb).toBeNull();
    expect(parsed.rows[3].color).toBe("grey");
  });

  it("parses rows without TYFCB", () => {
    const parsed = parseTrafficLightReport(marchText);

    expect(parsed.hasTyfcb).toBe(false);
    expect(parsed.reportMonth).toBe("2026-03-01");
    expect(parsed.reportWindowStart).toBe("2025-10-01");
    expect(parsed.reportWindowEnd).toBe("2026-03-01");
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[1]).toMatchObject({
      name: "Dr. Hemesh Thakur",
      tyfcb: null,
      trainings: 0,
      weekCount: 26,
      score: 30,
      color: "red",
    });
  });

  it("allows an explicit report month override", () => {
    const parsed = parseTrafficLightReport(marchText, "2026-02-01");
    expect(parsed.reportMonth).toBe("2026-02-01");
    expect(parsed.reportWindowStart).toBe("2025-10-01");
    expect(parsed.reportWindowEnd).toBe("2026-02-01");
  });

  it("parses score-only PDF traffic-light reports", () => {
    const parsed = parseTrafficLightPdfScoreReport(juneScorePdfText);

    expect(parsed.reportMonth).toBe("2026-06-01");
    expect(parsed.reportWindowStart).toBe("2026-06-01");
    expect(parsed.reportWindowEnd).toBe("2026-06-01");
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.rows[0]).toEqual({
      name: "Neraj K Anand",
      score: 100,
      color: "green",
    });
    expect(parsed.rows[2]).toEqual({
      name: "Nitin Sharma- Chef",
      score: 94,
      color: "green",
    });
    expect(parsed.rows.at(-1)).toEqual({
      name: "Sandeep Chopra",
      score: 15,
      color: "grey",
    });
  });

  it("allows an explicit score-only PDF report month override", () => {
    const parsed = parseTrafficLightPdfScoreReport(juneScorePdfText, "2026-07-01");

    expect(parsed.reportMonth).toBe("2026-07-01");
    expect(parsed.reportWindowStart).toBe("2026-07-01");
    expect(parsed.reportWindowEnd).toBe("2026-07-01");
  });

  const sampleJunePdfReportTest = existsSync(sampleJunePdfReport) ? it : it.skip;

  sampleJunePdfReportTest("parses the June score-only PDF report", async () => {
    const parsed = parseTrafficLightPdfScoreReport(await extractPdfTextForTest(sampleJunePdfReport));

    expect(parsed.reportMonth).toBe("2026-06-01");
    expect(parsed.rows).toHaveLength(79);
    expect(parsed.rows[0]).toEqual({
      name: "Neraj K Anand",
      score: 100,
      color: "green",
    });
    expect(parsed.rows.at(-1)).toEqual({
      name: "Sandeep Chopra",
      score: 15,
      color: "grey",
    });
  });

  const sampleXlsxReportTest = existsSync(sampleXlsxReport) ? it : it.skip;

  sampleXlsxReportTest("parses score-only XLSX traffic-light reports", () => {
    const parsed = parseTrafficLightXlsxReport(readFileSync(sampleXlsxReport));

    expect(parsed.reportMonth).toBe("2026-04-01");
    expect(parsed.reportWindowStart).toBe("2026-04-01");
    expect(parsed.reportWindowEnd).toBe("2026-04-01");
    expect(parsed.rows).toHaveLength(76);
    expect(parsed.rows[0]).toEqual({
      name: "Neraj K Anand",
      score: 100,
      color: "green",
    });
    expect(parsed.rows.at(-1)).toEqual({
      name: "Amit Chandna",
      score: 20,
      color: "grey",
    });
  });

  sampleXlsxReportTest("allows an explicit XLSX report month override", () => {
    const parsed = parseTrafficLightXlsxReport(readFileSync(sampleXlsxReport), "2026-05-01");

    expect(parsed.reportMonth).toBe("2026-05-01");
    expect(parsed.reportWindowStart).toBe("2026-05-01");
    expect(parsed.reportWindowEnd).toBe("2026-05-01");
  });
});
