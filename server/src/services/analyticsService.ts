import type { DashboardSuggestion, FrequencyRow, RepeatedCombination, SummaryResponse } from "@shared/types";
import { CT_LOTTO_CONFIG } from "@shared/game";
import { getDb } from "../db/database.js";
import { getCtLottoGame } from "./gameService.js";
import { getLatestStoredDashboardSuggestions, getPickerBacktestSummary } from "./pickerBacktestService.js";
import { getCtLottoGameInfo, getSyncStatus } from "./syncService.js";
import { listDraws } from "./drawService.js";

export function getFrequencyAnalytics(): FrequencyRow[] {
  const db = getDb();
  const game = getCtLottoGame();
  const totalDraws =
    (db
      .prepare("SELECT COUNT(*) as count FROM draws WHERE game_id = ?")
      .get(game.id) as { count: number }).count ?? 0;

  const stats = db
    .prepare(
      `
      SELECT
        dn.number_value as number,
        COUNT(*) as timesDrawn,
        MAX(d.draw_date) as lastSeenDate
      FROM draw_numbers dn
      JOIN draws d ON d.id = dn.draw_id
      WHERE d.game_id = ?
      GROUP BY dn.number_value
    `,
    )
    .all(game.id) as Array<{
      number: number;
      timesDrawn: number;
      lastSeenDate: string | null;
    }>;

  const latestDrawDate =
    (db
      .prepare("SELECT MAX(draw_date) as latest FROM draws WHERE game_id = ?")
      .get(game.id) as { latest: string | null }).latest ?? null;

  const map = new Map(stats.map((row) => [row.number, row]));
  const expectedCount = totalDraws * (CT_LOTTO_CONFIG.pickCount / CT_LOTTO_CONFIG.numberMax);

  return Array.from(
    { length: CT_LOTTO_CONFIG.numberMax },
    (_unused, index): FrequencyRow => {
      const number = index + 1;
      const stat = map.get(number);
      const timesDrawn = stat?.timesDrawn ?? 0;
      const differenceFromExpected = timesDrawn - expectedCount;
      const drawsSinceLastSeen =
        stat?.lastSeenDate && latestDrawDate
          ? countDrawsSinceDate(stat.lastSeenDate, latestDrawDate)
          : null;

      return {
        number,
        timesDrawn,
        drawPercentage: totalDraws === 0 ? 0 : timesDrawn / totalDraws,
        expectedCount,
        differenceFromExpected,
        lastSeenDate: stat?.lastSeenDate ?? null,
        drawsSinceLastSeen,
        trendLabel:
          differenceFromExpected > 2
            ? "Hot"
            : differenceFromExpected < -2
              ? "Cold"
              : "Neutral",
      };
    },
  );
}

export function getSummaryAnalytics(): SummaryResponse {
  const db = getDb();
  const game = getCtLottoGame();
  const frequency = getFrequencyAnalytics();
  const totals = db
    .prepare(
      `
      SELECT
        COUNT(*) as totalDrawings,
        MIN(draw_date) as earliestDrawDate,
        MAX(draw_date) as latestDrawDate,
        MAX(imported_at) as lastImportedDraw
      FROM draws
      WHERE game_id = ?
    `,
    )
    .get(game.id) as {
    totalDrawings: number;
    earliestDrawDate: string | null;
    latestDrawDate: string | null;
    lastImportedDraw: string | null;
  };

  const sortedByHot = [...frequency].sort((a, b) => b.timesDrawn - a.timesDrawn || a.number - b.number);
  const sortedByCold = [...frequency].sort((a, b) => a.timesDrawn - b.timesDrawn || a.number - b.number);

  return {
    totalDrawings: totals.totalDrawings,
    earliestDrawDate: totals.earliestDrawDate,
    latestDrawDate: totals.latestDrawDate,
    lastImportedDraw: totals.lastImportedDraw,
    syncStatus: getSyncStatus(),
    lottoGameInfo: getCtLottoGameInfo(),
    dashboardSuggestions: getDashboardSuggestions(),
    repeatedCombinations: getRepeatedCombinations(),
    pickerBacktest: getPickerBacktestSummary(),
    mostFrequentNumber: sortedByHot[0] ?? null,
    leastFrequentNumber: sortedByCold[0] ?? null,
    topHotNumbers: sortedByHot.slice(0, 10),
    topColdNumbers: sortedByCold.slice(0, 10),
    frequencyChart: frequency.map((row) => ({ number: row.number, timesDrawn: row.timesDrawn })),
  };
}

function getDashboardSuggestions(): DashboardSuggestion[] {
  return getLatestStoredDashboardSuggestions();
}

export function getRepeatedCombinations(): RepeatedCombination[] {
  const draws = listDraws({});
  const counts = new Map<
    string,
    {
      numbers: number[];
      timesDrawn: number;
      drawDates: string[];
    }
  >();

  draws.forEach((draw) => {
    const key = draw.numbers.join("-");
    const existing = counts.get(key);
    if (existing) {
      existing.timesDrawn += 1;
      existing.drawDates.push(draw.drawDate);
      return;
    }

    counts.set(key, {
      numbers: draw.numbers,
      timesDrawn: 1,
      drawDates: [draw.drawDate],
    });
  });

  return [...counts.values()]
    .filter((entry) => entry.timesDrawn > 1)
    .sort((a, b) => b.timesDrawn - a.timesDrawn || b.drawDates[0].localeCompare(a.drawDates[0]))
    .map((entry) => ({
      numbers: entry.numbers,
      timesDrawn: entry.timesDrawn,
      drawDates: [...entry.drawDates].sort((a, b) => b.localeCompare(a)),
    }));
}

function countDrawsSinceDate(lastSeenDate: string, latestDrawDate: string) {
  const db = getDb();
  const game = getCtLottoGame();
  return (
    db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM draws
      WHERE game_id = ? AND draw_date > ? AND draw_date <= ?
    `,
      )
      .get(game.id, lastSeenDate, latestDrawDate) as { count: number }
  ).count;
}
