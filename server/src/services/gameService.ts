import { getDb } from "../db/database.js";

export function getCtLottoGame() {
  const db = getDb();
  const game = db
    .prepare(
      `SELECT id, code, name, number_min as numberMin, number_max as numberMax, pick_count as pickCount
       FROM games WHERE code = 'ct_lotto'`,
    )
    .get() as
    | {
        id: number;
        code: string;
        name: string;
        numberMin: number;
        numberMax: number;
        pickCount: number;
      }
    | undefined;

  if (!game) {
    throw new Error("CT Lotto! game has not been seeded");
  }

  return game;
}
