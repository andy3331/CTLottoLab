import { describe, expect, it } from "vitest";
import { normalizeDrawDate, parseCtLottoHtml, parseWinningNumbers } from "../src/lib/parsing.js";

describe("parser utilities", () => {
  it("normalizes draw dates", () => {
    expect(normalizeDrawDate("6/5/2026")).toBe("2026-06-05");
  });

  it("parses and sorts winning numbers", () => {
    expect(parseWinningNumbers("34 - 2 - 24 - 31 - 13 - 9")).toEqual([2, 9, 13, 24, 31, 34]);
  });

  it("parses the table rows from html", () => {
    const html = `
      <table id="gvWinningNumbers">
        <tbody>
          <tr><td>6/5/2026</td><td>2 - 9 - 13 - 24 - 31 - 34</td><td>View</td></tr>
        </tbody>
      </table>
    `;
    expect(parseCtLottoHtml(html)).toEqual([
      {
        drawDateRaw: "6/5/2026",
        drawDate: "2026-06-05",
        numbersRaw: "2 - 9 - 13 - 24 - 31 - 34",
        numbers: [2, 9, 13, 24, 31, 34],
      },
    ]);
  });
});
