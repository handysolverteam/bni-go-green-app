import { describe, expect, it } from "vitest";
import { parseSponsorReport } from "../sponsor-import";

describe("parseSponsorReport", () => {
  it("extracts sponsor rows and report metadata from a SpreadsheetML report", () => {
    const xml = `<?xml version="1.0"?>
<Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Report">
    <Table>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">Chapter:</Data></Cell>
        <Cell ss:Index="7"><Data ss:Type="String">Influencers</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">From:</Data></Cell>
        <Cell ss:Index="7"><Data ss:Type="DateTime">2014-04-01T00:00:00</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">To:</Data></Cell>
        <Cell ss:Index="7"><Data ss:Type="DateTime">2026-04-22T00:00:00</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">Run At</Data></Cell>
        <Cell ss:Index="3"><Data ss:Type="DateTime">2026-04-22T12:27:42</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">Sponsor First Name</Data></Cell>
        <Cell ss:Index="2"><Data ss:Type="String">Sponsor Last Name</Data></Cell>
        <Cell ss:Index="4"><Data ss:Type="String">Total Members Sponsored</Data></Cell>
        <Cell ss:Index="5"><Data ss:Type="String">Sponsored First Name</Data></Cell>
        <Cell ss:Index="7"><Data ss:Type="String">Sponsored Last Name</Data></Cell>
        <Cell ss:Index="9"><Data ss:Type="String">Sponsored Region</Data></Cell>
        <Cell ss:Index="10"><Data ss:Type="String">Sponsored Chapter</Data></Cell>
        <Cell ss:Index="12"><Data ss:Type="String">Application Date</Data></Cell>
      </Row>
      <Row>
        <Cell ss:Index="1"><Data ss:Type="String">Pranav</Data></Cell>
        <Cell ss:Index="2"><Data ss:Type="String">Agarwal</Data></Cell>
        <Cell ss:Index="4"><Data ss:Type="Number">2</Data></Cell>
        <Cell ss:Index="5"><Data ss:Type="String">Jasmeet</Data></Cell>
        <Cell ss:Index="7"><Data ss:Type="String">Singh</Data></Cell>
        <Cell ss:Index="9"><Data ss:Type="String">Gurgaon</Data></Cell>
        <Cell ss:Index="10"><Data ss:Type="String">Influencers</Data></Cell>
        <Cell ss:Index="12"><Data ss:Type="DateTime">2025-03-12T00:00:00</Data></Cell>
      </Row>
    </Table>
  </Worksheet>
</Workbook>`;

    const parsed = parseSponsorReport(xml);

    expect(parsed.chapterName).toBe("Influencers");
    expect(parsed.reportFrom).toBe("2014-04-01");
    expect(parsed.reportTo).toBe("2026-04-22");
    expect(parsed.runAt).toBe("2026-04-22T12:27:42");
    expect(parsed.rows).toEqual([
      {
        sponsorFirstName: "Pranav",
        sponsorLastName: "Agarwal",
        sponsorFullName: "Pranav Agarwal",
        totalMembersSponsored: 2,
        sponsoredFirstName: "Jasmeet",
        sponsoredLastName: "Singh",
        sponsoredFullName: "Jasmeet Singh",
        sponsoredRegion: "Gurgaon",
        sponsoredChapter: "Influencers",
        applicationDate: "2025-03-12",
      },
    ]);
  });
});
