import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMembershipDuesReport } from "../import";

const sampleReport =
  "C:\\Users\\rahul\\Downloads\\Chapter_Membership_Dues_Report_14-04-2026-12-13-PM.xls";

describe("parseMembershipDuesReport", () => {
  const sampleReportTest = existsSync(sampleReport) ? it : it.skip;

  sampleReportTest("extracts the provided sample report rows", () => {
    expect(existsSync(sampleReport)).toBe(true);

    const parsed = parseMembershipDuesReport(readFileSync(sampleReport, "utf8"));

    expect(parsed.rows).toHaveLength(74);
    expect(parsed.reportDate).toBe("2026-04-14");
    expect(parsed.rows[0]).toEqual({
      name: "Ashutosh Nagar",
      industry: "Civil Law",
      reportRole: "President, Member",
      membershipStatus: "Active",
      dueDate: "2027-09-01",
      autoRenewalEnabled: false,
    });
  });

  it("maps auto-renewal Y values to true", () => {
    const xml = `<?xml version="1.0"?>
<Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Report">
    <Table>
      <Row>
        <Cell ss:Index="2"><Data ss:Type="String">Member Name</Data></Cell>
        <Cell ss:Index="9"><Data ss:Type="String">Industry</Data></Cell>
        <Cell ss:Index="12"><Data ss:Type="String">Type</Data></Cell>
        <Cell ss:Index="15"><Data ss:Type="String">Membership Status</Data></Cell>
        <Cell ss:Index="18"><Data ss:Type="String">Due Date</Data></Cell>
        <Cell ss:Index="22"><Data ss:Type="String">AutoRenewal Enabled</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="2"><Data ss:Type="String">Asha Mehta</Data></Cell>
        <Cell ss:Index="9"><Data ss:Type="String">Finance</Data></Cell>
        <Cell ss:Index="12"><Data ss:Type="String">Member</Data></Cell>
        <Cell ss:Index="15"><Data ss:Type="String">Active</Data></Cell>
        <Cell ss:Index="18"><Data ss:Type="DateTime">2026-08-01T00:00:00.000</Data></Cell>
        <Cell ss:Index="22"><Data ss:Type="String">Y</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
</Workbook>`;

    expect(parseMembershipDuesReport(xml).rows[0].autoRenewalEnabled).toBe(true);
  });
});
