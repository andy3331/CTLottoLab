import { createApp } from "./app.js";
import { getDb } from "./db/database.js";
import { config } from "./config.js";
import { backfillUncheckedDrawJackpotWinners } from "./services/drawService.js";
import { runDailyPickerBacktestCycle } from "./services/pickerBacktestService.js";
import { refreshCtLottoGameInfo, startCtLottoDailySync } from "./services/syncService.js";

async function bootstrap() {
  getDb();
  try {
    await refreshCtLottoGameInfo();
  } catch (error) {
    console.error(`CT Lotto game info refresh failed: ${(error as Error).message}`);
  }
  try {
    await runDailyPickerBacktestCycle();
  } catch (error) {
    console.error(`Daily picker backtest cycle failed: ${(error as Error).message}`);
  }
  void backfillUncheckedDrawJackpotWinners().catch((error) => {
    console.error(`Draw history jackpot-winner backfill failed: ${(error as Error).message}`);
  });
  startCtLottoDailySync();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`CT Lotto Lab server running on http://localhost:${config.port}`);
  });
}

void bootstrap();
