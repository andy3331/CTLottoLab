import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { CT_LOTTO_CONFIG } from "@shared/game";
import { config } from "../config.js";

let database: Database.Database | null = null;

export function getDb() {
  if (database) {
    return database;
  }

  const dbDir = path.dirname(config.databasePath);
  fs.mkdirSync(dbDir, { recursive: true });
  database = new Database(config.databasePath);
  database.pragma("foreign_keys = ON");
  initializeDatabase(database);
  return database;
}

function initializeDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      number_min INTEGER NOT NULL,
      number_max INTEGER NOT NULL,
      pick_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS draws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      draw_date TEXT NOT NULL,
      source_file_name TEXT,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(game_id, draw_date),
      FOREIGN KEY(game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS draw_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draw_id INTEGER NOT NULL,
      number_value INTEGER NOT NULL,
      position INTEGER NOT NULL,
      UNIQUE(draw_id, number_value),
      FOREIGN KEY(draw_id) REFERENCES draws(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      rows_found INTEGER NOT NULL,
      rows_inserted INTEGER NOT NULL,
      rows_skipped_duplicate_date INTEGER NOT NULL,
      rows_failed INTEGER NOT NULL,
      notes TEXT,
      FOREIGN KEY(game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS picker_backtest_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      generated_for_date TEXT NOT NULL,
      target_draw_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      evaluated_at TEXT,
      UNIQUE(game_id, mode, generated_for_date),
      FOREIGN KEY(game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS picker_backtest_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      ticket_index INTEGER NOT NULL,
      numbers_json TEXT NOT NULL,
      score INTEGER NOT NULL,
      human_likeness_score INTEGER NOT NULL DEFAULT 0,
      human_likeness_reasons_json TEXT NOT NULL DEFAULT '[]',
      explanation TEXT NOT NULL,
      match_count INTEGER,
      matched_numbers_json TEXT,
      exact_match INTEGER,
      UNIQUE(run_id, ticket_index),
      FOREIGN KEY(run_id) REFERENCES picker_backtest_runs(id) ON DELETE CASCADE
    );
  `);

  ensureColumn(db, "picker_backtest_tickets", "human_likeness_score", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(
    db,
    "picker_backtest_tickets",
    "human_likeness_reasons_json",
    "TEXT NOT NULL DEFAULT '[]'",
  );

  db.prepare(
    `
      INSERT INTO games (code, name, number_min, number_max, pick_count)
      VALUES (@code, @name, @numberMin, @numberMax, @pickCount)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name,
        number_min = excluded.number_min,
        number_max = excluded.number_max,
        pick_count = excluded.pick_count
    `,
  ).run(CT_LOTTO_CONFIG);
}

export function resetDbForTests(db: Database.Database) {
  db.exec(`
    DELETE FROM draw_numbers;
    DELETE FROM draws;
    DELETE FROM imports;
    DELETE FROM picker_backtest_tickets;
    DELETE FROM picker_backtest_runs;
    DELETE FROM app_settings;
    DELETE FROM games;
  `);
  initializeDatabase(db);
}

function ensureColumn(db: Database.Database, tableName: string, columnName: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
