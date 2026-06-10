import type { DrawRecord } from "@shared/types";
import { getDb } from "../db/database.js";
import { getCtLottoGame } from "./gameService.js";

export function listDraws(filters: { date?: string; number?: number }): DrawRecord[] {
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

  const rows = db
    .prepare(
      `
      SELECT
        d.id,
        d.draw_date as drawDate,
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
      sourceFileName: string | null;
      importedAt: string;
      numbersCsv: string;
    }>;

  return rows.map((row) => ({
    id: row.id,
    drawDate: row.drawDate,
    sourceFileName: row.sourceFileName,
    importedAt: row.importedAt,
    numbers: row.numbersCsv.split(",").map(Number).sort((a, b) => a - b),
  }));
}
