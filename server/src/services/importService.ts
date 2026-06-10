import type { ImportFailure, ImportSummary } from "@shared/types";
import { getDb } from "../db/database.js";
import {
  extractCtLottoTableRows,
  normalizeDrawDate,
  parseWinningNumbers,
} from "../lib/parsing.js";
import { getCtLottoGame } from "./gameService.js";

export function importCtLottoFile(input: { fileName: string; content: string }): ImportSummary {
  return importCtLottoContent(input);
}

export function importCtLottoContent(input: {
  fileName: string;
  content: string;
  note?: string | null;
}): ImportSummary {
  const rows = parseRowsLenient(input.content);
  const db = getDb();
  const game = getCtLottoGame();
  const failures: ImportFailure[] = [];
  let rowsInserted = 0;
  let rowsSkippedDuplicateDate = 0;

  const insertDraw = db.prepare(
    `
      INSERT INTO draws (game_id, draw_date, source_file_name)
      VALUES (@gameId, @drawDate, @sourceFileName)
    `,
  );
  const insertNumber = db.prepare(
    `
      INSERT INTO draw_numbers (draw_id, number_value, position)
      VALUES (@drawId, @numberValue, @position)
    `,
  );
  const existingCheck = db.prepare(
    "SELECT id FROM draws WHERE game_id = ? AND draw_date = ?",
  );

  const transaction = db.transaction((parsedRows: ReturnType<typeof parseRowsLenient>) => {
    parsedRows.forEach((row) => {
      if (!row.ok) {
        failures.push(row.failure);
        return;
      }

      const existing = existingCheck.get(game.id, row.value.drawDate);
      if (existing) {
        rowsSkippedDuplicateDate += 1;
        return;
      }

      const drawResult = insertDraw.run({
        gameId: game.id,
        drawDate: row.value.drawDate,
        sourceFileName: input.fileName,
      });

      row.value.numbers.forEach((numberValue, index) => {
        insertNumber.run({
          drawId: Number(drawResult.lastInsertRowid),
          numberValue,
          position: index + 1,
        });
      });
      rowsInserted += 1;
    });
  });

  transaction(rows);

  const successfulRows = rows.filter((row) => row.ok).map((row) => row.value.drawDate);
  const dates = successfulRows.sort();

  db.prepare(
    `
      INSERT INTO imports (
        game_id, file_name, rows_found, rows_inserted, rows_skipped_duplicate_date, rows_failed, notes
      ) VALUES (
        @gameId, @fileName, @rowsFound, @rowsInserted, @rowsSkippedDuplicateDate, @rowsFailed, @notes
      )
    `,
  ).run({
    gameId: game.id,
    fileName: input.fileName,
    rowsFound: rows.length,
    rowsInserted,
    rowsSkippedDuplicateDate,
    rowsFailed: failures.length,
    notes:
      input.note ??
      (failures.length > 0 ? `${failures.length} row(s) failed validation.` : null),
  });

  return {
    rowsFound: rows.length,
    rowsInserted,
    rowsSkippedDuplicateDate,
    rowsFailed: failures.length,
    failedRows: failures,
    dateRange: {
      earliest: dates[0] ?? null,
      latest: dates[dates.length - 1] ?? null,
    },
  };
}

function parseRowsLenient(content: string) {
  const extractedRows = extractCtLottoTableRows(content);
  return extractedRows.map((row, index) => {
    try {
      return {
        ok: true as const,
        value: {
          drawDateRaw: row.drawDateRaw,
          drawDate: normalizeDrawDate(row.drawDateRaw),
          numbersRaw: row.numbersRaw,
          numbers: parseWinningNumbers(row.numbersRaw),
        },
      };
    } catch (error) {
      return {
        ok: false as const,
        failure: {
          rowIndex: index + 1,
          drawDate: row.drawDateRaw,
          rawNumbers: row.numbersRaw,
          reason: (error as Error).message,
        },
      };
    }
  });
}
