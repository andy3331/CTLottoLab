import type { DrawRecord, DrawsQuery } from "@shared/types";
import { getDb } from "../db/database.js";
import { getCtLottoGame } from "./gameService.js";
import { fetchCtLottoPayoutSummaryForDrawDate } from "./syncService.js";

const HISTORY_ENRICH_LIMIT = 30;

export async function backfillUncheckedDrawJackpotWinners(limit = 120) {
  await enrichMissingDrawJackpotWinners({}, limit);
}

export function listDraws(filters: DrawsQuery): DrawRecord[] {
  const db = getDb();
  const game = getCtLottoGame();

  const clauses = ["d.game_id = @gameId"];
  const params: Record<string, string | number> = { gameId: game.id };

  if (filters.date) {
    clauses.push("d.draw_date LIKE @date");
    params.date = `%${filters.date}%`;
  }

  if (filters.number) {
    clauses.push(
      "EXISTS (SELECT 1 FROM draw_numbers dn2 WHERE dn2.draw_id = d.id AND dn2.number_value = @number)",
    );
    params.number = filters.number;
  }

  if (filters.jackpotWinnerCount !== undefined) {
    clauses.push("d.jackpot_winner_count = @jackpotWinnerCount");
    params.jackpotWinnerCount = filters.jackpotWinnerCount;
  }

  const rows = db
    .prepare(
      `
      SELECT
        d.id,
        d.draw_date as drawDate,
        d.jackpot_winner_count as jackpotWinnerCount,
        d.source_file_name as sourceFileName,
        d.imported_at as importedAt,
        GROUP_CONCAT(dn.number_value, ',') as numbersCsv
      FROM draws d
      JOIN draw_numbers dn ON dn.draw_id = d.id
      WHERE ${clauses.join(" AND ")}
      GROUP BY d.id
      ORDER BY d.draw_date DESC
    `,
    )
    .all(params) as Array<{
      id: number;
      drawDate: string;
      jackpotWinnerCount: number | null;
      sourceFileName: string | null;
      importedAt: string;
      numbersCsv: string;
    }>;

  return rows.map((row) => ({
    id: row.id,
    drawDate: row.drawDate,
    jackpotWinnerCount: row.jackpotWinnerCount,
    sourceFileName: row.sourceFileName,
    importedAt: row.importedAt,
    numbers: row.numbersCsv.split(",").map(Number).sort((a, b) => a - b),
  }));
}

export async function listDrawsForHistory(filters: DrawsQuery): Promise<DrawRecord[]> {
  await enrichMissingDrawJackpotWinners(filters, HISTORY_ENRICH_LIMIT);
  return listDraws(filters);
}

async function enrichMissingDrawJackpotWinners(filters: DrawsQuery, limit: number) {
  const db = getDb();
  const game = getCtLottoGame();
  const clauses = ["d.game_id = @gameId", "d.jackpot_winner_checked_at IS NULL"];
  const params: Record<string, string | number> = { gameId: game.id };

  if (filters.date) {
    clauses.push("d.draw_date LIKE @date");
    params.date = `%${filters.date}%`;
  }

  if (filters.number) {
    clauses.push(
      "EXISTS (SELECT 1 FROM draw_numbers dn2 WHERE dn2.draw_id = d.id AND dn2.number_value = @number)",
    );
    params.number = filters.number;
  }

  const candidates = db
    .prepare(
      `
        SELECT d.id, d.draw_date as drawDate
        FROM draws d
        WHERE ${clauses.join(" AND ")}
        ORDER BY d.draw_date DESC
        LIMIT ${limit}
      `,
    )
    .all(params) as Array<{ id: number; drawDate: string }>;

  for (const candidate of candidates) {
    try {
      const payoutSummary = await fetchCtLottoPayoutSummaryForDrawDate(candidate.drawDate);
      db.prepare(
        `
          UPDATE draws
          SET jackpot_winner_count = ?,
              jackpot_winner_checked_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
      ).run(payoutSummary.jackpotWinnerCount, candidate.id);
    } catch {
      // Leave it unchecked so a later session can retry if the remote site was temporarily unavailable.
    }
  }
}
