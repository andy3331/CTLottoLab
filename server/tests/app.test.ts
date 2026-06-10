import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "../src/db/database.js";
import { getFrequencyAnalytics, getSummaryAnalytics } from "../src/services/analyticsService.js";
import { importCtLottoFile } from "../src/services/importService.js";
import { generateTickets } from "../src/services/pickerService.js";

const sampleHtml = `
  <table id="gvWinningNumbers">
    <tbody>
      <tr><td>6/5/2026</td><td>2 - 9 - 13 - 24 - 31 - 34</td><td>View</td></tr>
      <tr><td>6/2/2026</td><td>6 - 25 - 32 - 36 - 37 - 43</td><td>View</td></tr>
      <tr><td>5/29/2026</td><td>10 - 11 - 12 - 19 - 31 - 42</td><td>View</td></tr>
    </tbody>
  </table>
`;

describe("imports, analytics, and picker", () => {
  beforeEach(() => {
    resetDbForTests(getDb());
  });

  it("skips duplicate draw dates on re-import", () => {
    const firstImport = importCtLottoFile({
      fileName: "sample.html",
      content: sampleHtml,
    });
    const secondImport = importCtLottoFile({
      fileName: "sample.html",
      content: sampleHtml,
    });

    expect(firstImport.rowsInserted).toBe(3);
    expect(secondImport.rowsInserted).toBe(0);
    expect(secondImport.rowsSkippedDuplicateDate).toBe(3);
  });

  it("reports invalid rows without failing the whole import", () => {
    const html = `
      <table id="gvWinningNumbers">
        <tbody>
          <tr><td>6/5/2026</td><td>2 - 9 - 13 - 24 - 31 - 34</td><td>View</td></tr>
          <tr><td>6/2/2026</td><td>6 - 25 - 32 - 36 - 37</td><td>View</td></tr>
        </tbody>
      </table>
    `;

    const summary = importCtLottoFile({
      fileName: "bad.html",
      content: html,
    });

    expect(summary.rowsFound).toBe(2);
    expect(summary.rowsInserted).toBe(1);
    expect(summary.rowsFailed).toBe(1);
    expect(summary.failedRows[0]?.reason).toContain("Expected 6 numbers");
  });

  it("calculates frequency stats across imported draws", () => {
    importCtLottoFile({
      fileName: "sample.html",
      content: sampleHtml,
    });

    const frequency = getFrequencyAnalytics();
    const number31 = frequency.find((row) => row.number === 31);
    const number44 = frequency.find((row) => row.number === 44);

    expect(number31?.timesDrawn).toBe(2);
    expect(number31?.lastSeenDate).toBe("2026-06-05");
    expect(number44?.timesDrawn).toBe(0);
  });

  it("generates valid tickets that can exclude historical winning combinations", () => {
    importCtLottoFile({
      fileName: "sample.html",
      content: sampleHtml,
    });

    const tickets = generateTickets({
      mode: "smart",
      ticketCount: 5,
      excludePreviousWinningCombinations: true,
      balanceOddEven: true,
      balanceLowHigh: true,
      avoidFourOrMoreConsecutive: true,
      preferHistoricalNormalSumRange: true,
    });

    const history = new Set([
      "2-9-13-24-31-34",
      "6-25-32-36-37-43",
      "10-11-12-19-31-42",
    ]);

    tickets.forEach((ticket) => {
      expect(ticket.numbers).toHaveLength(6);
      expect(ticket.numbers).toEqual([...ticket.numbers].sort((a, b) => a - b));
      expect(new Set(ticket.numbers).size).toBe(6);
      expect(ticket.numbers.every((value) => value >= 1 && value <= 44)).toBe(true);
      expect(history.has(ticket.numbers.join("-"))).toBe(false);
    });
  });

  it("surfaces winning combinations that repeated", () => {
    importCtLottoFile({
      fileName: "repeat-a.html",
      content: `
        <table id="gvWinningNumbers">
          <tbody>
            <tr><td>6/5/2026</td><td>2 - 9 - 13 - 24 - 31 - 34</td><td>View</td></tr>
            <tr><td>6/2/2026</td><td>6 - 25 - 32 - 36 - 37 - 43</td><td>View</td></tr>
          </tbody>
        </table>
      `,
    });

    importCtLottoFile({
      fileName: "repeat-b.html",
      content: `
        <table id="gvWinningNumbers">
          <tbody>
            <tr><td>5/26/2026</td><td>2 - 9 - 13 - 24 - 31 - 34</td><td>View</td></tr>
          </tbody>
        </table>
      `,
    });

    const summary = getSummaryAnalytics();
    expect(summary.repeatedCombinations).toEqual([
      {
        numbers: [2, 9, 13, 24, 31, 34],
        timesDrawn: 2,
        drawDates: ["2026-06-05", "2026-05-26"],
      },
    ]);
    expect(summary.lottoGameInfo?.estimatedJackpot ?? null).toBeNull();
  });
});
