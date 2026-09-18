import { describe, expect, it } from "vitest";
import { parseTrainingReport } from "../training-import";

const trainingReportXml = `<?xml version="1.0"?>
<Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Report">
    <Table>
      <Row>
        <Cell><Data ss:Type="String">Chapter ► Member Training Report</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">Running User</Data></Cell>
        <Cell ss:Index="4"><Data ss:Type="String">Run At</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">Rahul Matharu</Data></Cell>
        <Cell ss:Index="4"><Data ss:Type="String">2026-04-24T17:34:24</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">Chapter:</Data></Cell>
        <Cell ss:Index="9"><Data ss:Type="String">Influencers</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">From:</Data></Cell>
        <Cell ss:Index="9"><Data ss:Type="DateTime">2014-10-01T00:00:00</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">To:</Data></Cell>
        <Cell ss:Index="9"><Data ss:Type="DateTime">2026-03-31T00:00:00</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">Region Name</Data></Cell>
        <Cell ss:Index="2"><Data ss:Type="String">Chapter Name</Data></Cell>
        <Cell ss:Index="3"><Data ss:Type="String">First Name</Data></Cell>
        <Cell ss:Index="5"><Data ss:Type="String">Last Name</Data></Cell>
        <Cell ss:Index="6"><Data ss:Type="String">Event Date</Data></Cell>
        <Cell ss:Index="8"><Data ss:Type="String">Event Type</Data></Cell>
        <Cell ss:Index="10"><Data ss:Type="String">Role</Data></Cell>
        <Cell ss:Index="12"><Data ss:Type="String">Join Date</Data></Cell>
        <Cell ss:Index="16"><Data ss:Type="String">Induction Date</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">Gurgaon</Data></Cell>
        <Cell ss:Index="2"><Data ss:Type="String">Influencers</Data></Cell>
        <Cell ss:Index="3"><Data ss:Type="String">Pranav</Data></Cell>
        <Cell ss:Index="5"><Data ss:Type="String">Agarwal</Data></Cell>
        <Cell ss:Index="6"><Data ss:Type="DateTime">2023-08-19T00:00:00</Data></Cell>
        <Cell ss:Index="8"><Data ss:Type="String">*Member Success Program</Data></Cell>
        <Cell ss:Index="10"><Data ss:Type="String">Member</Data></Cell>
        <Cell ss:Index="12"><Data ss:Type="DateTime">2023-07-01T00:00:00</Data></Cell>
        <Cell ss:Index="16"><Data ss:Type="DateTime">2023-06-21T00:00:00</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">Gurgaon</Data></Cell>
        <Cell ss:Index="2"><Data ss:Type="String">Influencers</Data></Cell>
        <Cell ss:Index="3"><Data ss:Type="String">Garima</Data></Cell>
        <Cell ss:Index="5"><Data ss:Type="String">Agarwal</Data></Cell>
        <Cell ss:Index="6"><Data ss:Type="DateTime">2025-06-07T00:00:00</Data></Cell>
        <Cell ss:Index="8"><Data ss:Type="String">Leadership Team Roundtable - India</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
</Workbook>`;

describe("parseTrainingReport", () => {
  it("extracts metadata and attendance rows from the report worksheet", () => {
    const parsed = parseTrainingReport(trainingReportXml);

    expect(parsed.chapterName).toBe("Influencers");
    expect(parsed.reportFrom).toBe("2014-10-01");
    expect(parsed.reportTo).toBe("2026-03-31");
    expect(parsed.runAt).toBe("2026-04-24T17:34:24");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({
      regionName: "Gurgaon",
      chapterName: "Influencers",
      firstName: "Pranav",
      lastName: "Agarwal",
      memberName: "Pranav Agarwal",
      eventDate: "2023-08-19",
      eventType: "*Member Success Program",
      role: "Member",
      joinDate: "2023-07-01",
      inductionDate: "2023-06-21",
    });
    expect(parsed.rows[1].joinDate).toBeNull();
    expect(parsed.rows[1].inductionDate).toBeNull();
  });
});
