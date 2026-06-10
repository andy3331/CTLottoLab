import { PICKER_MODES, type PickerMode } from "@shared/game";
import type {
  PickerBacktestHumanLikenessPoint,
  PickerBacktestModeSummary,
  PickerBacktestRun,
  PickerBacktestSummary,
} from "@shared/types";
import { getDb } from "../db/database.js";
import { listDraws } from "./drawService.js";
import { getCtLottoGame } from "./gameService.js";
import { generateTickets, getDefaultBacktestPickerRequest } from "./pickerService.js";
import { runCtLottoSync } from "./syncService.js";

export async function runDailyPickerBacktestCycle(options?: { force?: boolean; skipSync?: boolean }) {
  const today = todayIsoDate();
  const lastCycleDate = getSetting("picker_backtest.last_cycle_date");

  if (!options?.force && lastCycleDate === today) {
    return getPickerBacktestSummary();
  }

  if (!options?.skipSync) {
    try {
      await runCtLottoSync();
    } catch (_error) {
      // Keep the app usable and still generate/evaluate daily runs from existing local data.
    }
  }

  evaluatePendingBacktestRuns();
  ensureBacktestRunsForDate(today);
  setSetting("picker_backtest.last_cycle_date", today);

  return getPickerBacktestSummary();
}

export function evaluatePendingBacktestRuns() {
  const db = getDb();
  const game = getCtLottoGame();
  const pendingRuns = db
    .prepare(
      `
        SELECT id, mode, generated_for_date as generatedForDate
        FROM picker_backtest_runs
        WHERE game_id = ? AND status = 'pending'
        ORDER BY generated_for_date ASC, mode ASC
      `,
    )
    .all(game.id) as Array<{ id: number; mode: PickerMode; generatedForDate: string }>;

  const updateRun = db.prepare(
    `
      UPDATE picker_backtest_runs
      SET target_draw_date = @targetDrawDate,
          status = 'evaluated',
          evaluated_at = CURRENT_TIMESTAMP
      WHERE id = @runId
    `,
  );
  const updateTicket = db.prepare(
    `
      UPDATE picker_backtest_tickets
      SET match_count = @matchCount,
          matched_numbers_json = @matchedNumbersJson,
          exact_match = @exactMatch
      WHERE run_id = @runId
    `,
  );

  pendingRuns.forEach((run) => {
    const targetDraw = getNextDrawAfterDate(run.generatedForDate);
    if (!targetDraw) {
      return;
    }

    const ticket = db
      .prepare(
        `
          SELECT numbers_json as numbersJson
          FROM picker_backtest_tickets
          WHERE run_id = ?
          ORDER BY ticket_index ASC
          LIMIT 1
        `,
      )
      .get(run.id) as { numbersJson: string } | undefined;

    if (!ticket) {
      return;
    }

    const ticketNumbers = JSON.parse(ticket.numbersJson) as number[];
    const matchedNumbers = ticketNumbers.filter((number) => targetDraw.numbers.includes(number));

    updateRun.run({
      runId: run.id,
      targetDrawDate: targetDraw.drawDate,
    });
    updateTicket.run({
      runId: run.id,
      matchCount: matchedNumbers.length,
      matchedNumbersJson: JSON.stringify(matchedNumbers),
      exactMatch: matchedNumbers.length === targetDraw.numbers.length ? 1 : 0,
    });
  });
}

export function ensureBacktestRunsForDate(generatedForDate: string) {
  const db = getDb();
  const game = getCtLottoGame();
  const existingModes = new Set(
    (
      db
        .prepare(
          `
            SELECT mode
            FROM picker_backtest_runs
            WHERE game_id = ? AND generated_for_date = ?
          `,
        )
        .all(game.id, generatedForDate) as Array<{ mode: PickerMode }>
    ).map((row) => row.mode),
  );

  const insertRun = db.prepare(
    `
      INSERT INTO picker_backtest_runs (game_id, mode, generated_for_date)
      VALUES (@gameId, @mode, @generatedForDate)
    `,
  );
  const insertTicket = db.prepare(
    `
      INSERT INTO picker_backtest_tickets (
        run_id, ticket_index, numbers_json, score, human_likeness_score, human_likeness_reasons_json, explanation
      ) VALUES (
        @runId, @ticketIndex, @numbersJson, @score, @humanLikenessScore, @humanLikenessReasonsJson, @explanation
      )
    `,
  );

  PICKER_MODES.forEach((mode) => {
    if (existingModes.has(mode)) {
      return;
    }

    const generated = generateTickets(getDefaultBacktestPickerRequest(mode))[0];
    if (!generated) {
      return;
    }

    const runResult = insertRun.run({
      gameId: game.id,
      mode,
      generatedForDate,
    });

    insertTicket.run({
      runId: Number(runResult.lastInsertRowid),
      ticketIndex: 0,
      numbersJson: JSON.stringify(generated.numbers),
      score: generated.score,
      humanLikenessScore: generated.humanLikenessScore,
      humanLikenessReasonsJson: JSON.stringify(generated.humanLikenessReasons),
      explanation: generated.explanation,
    });
  });
}

export function getPickerBacktestSummary(): PickerBacktestSummary {
  const db = getDb();
  const game = getCtLottoGame();
  const rows = db
    .prepare(
      `
        SELECT
          r.mode as mode,
          r.generated_for_date as generatedForDate,
          r.target_draw_date as targetDrawDate,
          r.status as status,
          t.numbers_json as ticketNumbersJson,
          t.score as ticketScore,
          t.human_likeness_score as humanLikenessScore,
          t.human_likeness_reasons_json as humanLikenessReasonsJson,
          t.match_count as matchCount,
          t.matched_numbers_json as matchedNumbersJson,
          t.exact_match as exactMatch
        FROM picker_backtest_runs r
        JOIN picker_backtest_tickets t ON t.run_id = r.id
        WHERE r.game_id = ?
        ORDER BY r.generated_for_date DESC, r.mode ASC
      `,
    )
    .all(game.id) as Array<{
      mode: PickerMode;
      generatedForDate: string;
      targetDrawDate: string | null;
      status: "pending" | "evaluated";
      ticketNumbersJson: string;
      ticketScore: number;
      humanLikenessScore: number;
      humanLikenessReasonsJson: string;
      matchCount: number | null;
      matchedNumbersJson: string | null;
      exactMatch: number | null;
    }>;

  const recentRuns: PickerBacktestRun[] = rows.slice(0, 18).map((row) => ({
    mode: row.mode,
    generatedForDate: row.generatedForDate,
    targetDrawDate: row.targetDrawDate,
    status: row.status,
    ticketNumbers: JSON.parse(row.ticketNumbersJson) as number[],
    ticketScore: row.ticketScore,
    humanLikenessScore: row.humanLikenessScore,
    humanLikenessReasons: JSON.parse(row.humanLikenessReasonsJson) as string[],
    matchCount: row.matchCount,
    matchedNumbers: row.matchedNumbersJson ? (JSON.parse(row.matchedNumbersJson) as number[]) : [],
    exactMatch: row.exactMatch === null ? null : row.exactMatch === 1,
  }));

  const modeSummaries = PICKER_MODES.map((mode) => summarizeMode(mode, recentRuns, rows));

  return {
    lastDailyCycleDate: getSetting("picker_backtest.last_cycle_date"),
    modeSummaries,
    recentRuns,
    humanLikenessTrend: buildHumanLikenessTrend(rows),
  };
}

function summarizeMode(
  mode: PickerMode,
  recentRuns: PickerBacktestRun[],
  allRows: Array<{
    mode: PickerMode;
    generatedForDate: string;
    targetDrawDate: string | null;
      status: "pending" | "evaluated";
      ticketNumbersJson: string;
      ticketScore: number;
      humanLikenessScore: number;
      humanLikenessReasonsJson: string;
      matchCount: number | null;
      matchedNumbersJson: string | null;
      exactMatch: number | null;
  }>,
): PickerBacktestModeSummary {
  void recentRuns;
  const modeRows = allRows.filter((row) => row.mode === mode);
  const evaluatedRows = modeRows.filter((row) => row.status === "evaluated" && row.matchCount !== null);
  const matchSum = evaluatedRows.reduce((sum, row) => sum + (row.matchCount ?? 0), 0);
  const humanLikenessSum = modeRows.reduce((sum, row) => sum + row.humanLikenessScore, 0);

  return {
    mode,
    totalRuns: modeRows.length,
    evaluatedRuns: evaluatedRows.length,
    averageMatchedNumbers:
      evaluatedRows.length > 0 ? round2(matchSum / evaluatedRows.length) : 0,
    averageHumanLikenessScore: modeRows.length > 0 ? round2(humanLikenessSum / modeRows.length) : 0,
    bestMatchCount: evaluatedRows.reduce((best, row) => Math.max(best, row.matchCount ?? 0), 0),
    exactMatchCount: evaluatedRows.filter((row) => row.exactMatch === 1).length,
    lastGeneratedForDate: modeRows[0]?.generatedForDate ?? null,
    lastTargetDrawDate: modeRows.find((row) => row.targetDrawDate)?.targetDrawDate ?? null,
  };
}

function buildHumanLikenessTrend(
  allRows: Array<{
    mode: PickerMode;
    generatedForDate: string;
    targetDrawDate: string | null;
    status: "pending" | "evaluated";
    ticketNumbersJson: string;
    ticketScore: number;
    humanLikenessScore: number;
    humanLikenessReasonsJson: string;
    matchCount: number | null;
    matchedNumbersJson: string | null;
    exactMatch: number | null;
  }>,
): PickerBacktestHumanLikenessPoint[] {
  const byDate = new Map<string, Partial<Record<PickerMode, number>>>();

  [...allRows]
    .sort((a, b) => a.generatedForDate.localeCompare(b.generatedForDate))
    .forEach((row) => {
      const current = byDate.get(row.generatedForDate) ?? {};
      current[row.mode] = row.humanLikenessScore;
      byDate.set(row.generatedForDate, current);
    });

  return [...byDate.entries()].slice(-14).map(([generatedForDate, modeScores]) => ({
    generatedForDate,
    modeScores,
  }));
}

function getNextDrawAfterDate(date: string) {
  return listDraws({}).find((draw) => draw.drawDate > date) ?? null;
}

function getSetting(key: string) {
  const db = getDb();
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string) {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `,
  ).run(key, value);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
