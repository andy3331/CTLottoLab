import { PICKER_MODES } from "@shared/game";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "../src/db/database.js";
import { ensureBacktestRunsForDate, evaluatePendingBacktestRuns, getPickerBacktestSummary } from "../src/services/pickerBacktestService.js";
import { importCtLottoFile } from "../src/services/importService.js";

describe("picker backtest service", () => {
  beforeEach(() => {
    resetDbForTests(getDb());
  });

  it("stores one daily backtest run per picker mode", () => {
    ensureBacktestRunsForDate("2026-06-01");

    const summary = getPickerBacktestSummary();
    expect(summary.modeSummaries).toHaveLength(PICKER_MODES.length);
    expect(summary.modeSummaries.every((row) => row.totalRuns === 1)).toBe(true);
    expect(summary.modeSummaries.some((row) => row.mode === "low_split")).toBe(true);
    expect(summary.modeSummaries.every((row) => row.averageHumanLikenessScore >= 0)).toBe(true);
    expect(summary.recentRuns).toHaveLength(PICKER_MODES.length);
    expect(summary.recentRuns.every((run) => run.humanLikenessScore >= 0)).toBe(true);
    expect(summary.humanLikenessTrend).toHaveLength(1);
  }, 10000);

  it("evaluates pending backtest runs against the next available draw", () => {
    ensureBacktestRunsForDate("2026-06-01");
    importCtLottoFile({
      fileName: "draw.html",
      content: `
        <table id="gvWinningNumbers">
          <tbody>
            <tr><td>6/5/2026</td><td>2 - 9 - 13 - 24 - 31 - 34</td><td>View</td></tr>
          </tbody>
        </table>
      `,
    });

    evaluatePendingBacktestRuns();

    const summary = getPickerBacktestSummary();
    expect(summary.modeSummaries.every((row) => row.evaluatedRuns === 1)).toBe(true);
    expect(summary.recentRuns.every((run) => run.status === "evaluated")).toBe(true);
    expect(summary.recentRuns.every((run) => run.targetDrawDate === "2026-06-05")).toBe(true);
    expect(summary.humanLikenessTrend[0]?.modeScores.low_split).toBeTypeOf("number");
  }, 15000);
});
