import type { ImportSummary, LottoGameInfo, SyncStatus } from "@shared/types";
import { getDb } from "../db/database.js";
import { parseCtLottoGameInfo, parseCtLottoPayoutSummary } from "../lib/parsing.js";
import { importCtLottoContent } from "./importService.js";

const CT_LOTTO_GAME_NUMBER = 6;
const CT_LOTTO_BASE_URL = "https://www.ctlottery.org";
const CT_LOTTO_GAME_PAGE_URL = `${CT_LOTTO_BASE_URL}/lotto!`;
const HOURLY_POLL_MS = 60 * 60 * 1000;
const FALLBACK_SEED_START_DATE = "2020-06-07";

let syncTimer: NodeJS.Timeout | null = null;
let inFlightSync: Promise<ImportSummary> | null = null;

export function startCtLottoDailySync() {
  if (syncTimer) {
    return;
  }

  void syncCtLottoIfDue();
  syncTimer = setInterval(() => {
    void syncCtLottoIfDue();
  }, HOURLY_POLL_MS);
}

export async function syncCtLottoIfDue() {
  try {
    await refreshCtLottoGameInfo();
  } catch (_error) {
    // Keep the app usable even if the jackpot banner could not be refreshed.
  }

  const currentStatus = getSyncStatus();
  if (shouldSkipAutomaticSync(currentStatus, new Date())) {
    return null;
  }

  return runCtLottoSync();
}

export function shouldSkipAutomaticSync(
  currentStatus: SyncStatus,
  now: Date,
) {
  const today = localCalendarDate(now);
  const lastSuccessDay = currentStatus.lastSuccessAt
    ? localCalendarDate(new Date(currentStatus.lastSuccessAt))
    : null;

  return lastSuccessDay === today;
}

export async function runCtLottoSync() {
  if (inFlightSync) {
    return inFlightSync;
  }

  inFlightSync = runCtLottoSyncInternal().finally(() => {
    inFlightSync = null;
  });
  return inFlightSync;
}

export function getSyncStatus(): SyncStatus {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT key, value FROM app_settings WHERE key LIKE 'sync.ct_lotto.%'",
    )
    .all() as Array<{ key: string; value: string }>;

  const map = new Map(rows.map((row) => [row.key, row.value]));
  const lastStatusRaw = map.get("sync.ct_lotto.last_status");
  return {
    lastAttemptAt: map.get("sync.ct_lotto.last_attempt_at") ?? null,
    lastSuccessAt: map.get("sync.ct_lotto.last_success_at") ?? null,
    lastStatus:
      lastStatusRaw === "success" || lastStatusRaw === "error"
        ? lastStatusRaw
        : "idle",
    lastMessage: map.get("sync.ct_lotto.last_message") ?? null,
    lastRowsInserted: Number(map.get("sync.ct_lotto.last_rows_inserted") ?? "0"),
    lastImportedDrawDate: map.get("sync.ct_lotto.last_imported_draw_date") ?? null,
  };
}

export function getCtLottoGameInfo(): LottoGameInfo {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT key, value FROM app_settings WHERE key LIKE 'ct_lotto.game_info.%'",
    )
    .all() as Array<{ key: string; value: string }>;

  const map = new Map(rows.map((row) => [row.key, row.value]));
  const lastStatusRaw = map.get("ct_lotto.game_info.last_status");

  return {
    latestDrawDate: normalizeStoredValue(map.get("ct_lotto.game_info.latest_draw_date")),
    latestDrawNumbers: parseStoredNumbers(map.get("ct_lotto.game_info.latest_draw_numbers")),
    jackpotWinnerCount: parseStoredNumber(map.get("ct_lotto.game_info.jackpot_winner_count")),
    winningTicketsSold: parseStoredNumber(map.get("ct_lotto.game_info.winning_tickets_sold")),
    nextDrawDate: normalizeStoredValue(map.get("ct_lotto.game_info.next_draw_date")),
    estimatedJackpot: normalizeStoredValue(map.get("ct_lotto.game_info.estimated_jackpot")),
    estimatedCashValue: normalizeStoredValue(map.get("ct_lotto.game_info.estimated_cash_value")),
    lastRefreshedAt: normalizeStoredValue(map.get("ct_lotto.game_info.last_refreshed_at")),
    lastStatus:
      lastStatusRaw === "success" || lastStatusRaw === "error"
        ? lastStatusRaw
        : "idle",
    lastMessage: normalizeStoredValue(map.get("ct_lotto.game_info.last_message")),
  };
}

async function runCtLottoSyncInternal() {
  const attemptTime = new Date().toISOString();
  setSetting("sync.ct_lotto.last_attempt_at", attemptTime);

  try {
    const dateRange = getNextSyncRange();
    if (dateRange.startDate > dateRange.endDate) {
      const summary: ImportSummary = {
        rowsFound: 0,
        rowsInserted: 0,
        rowsSkippedDuplicateDate: 0,
        rowsFailed: 0,
        failedRows: [],
        dateRange: {
          earliest: null,
          latest: null,
        },
      };
      setSetting("sync.ct_lotto.last_success_at", new Date().toISOString());
      setSetting("sync.ct_lotto.last_status", "success");
      setSetting("sync.ct_lotto.last_message", "Results are already current through today.");
      setSetting("sync.ct_lotto.last_rows_inserted", "0");
      return summary;
    }
    const content = await fetchCtLotteryResults(dateRange.startDate, dateRange.endDate);
    const summary = importCtLottoContent({
      fileName: `ctlottery-sync-${dateRange.startDate}-to-${dateRange.endDate}.html`,
      content,
      note: `Automatic CT Lottery sync for ${dateRange.startDate} through ${dateRange.endDate}.`,
    });

    setSetting("sync.ct_lotto.last_success_at", new Date().toISOString());
    setSetting("sync.ct_lotto.last_status", "success");
    setSetting(
      "sync.ct_lotto.last_message",
      `Synced ${summary.rowsInserted} new draw(s), skipped ${summary.rowsSkippedDuplicateDate} duplicate date(s).`,
    );
    setSetting("sync.ct_lotto.last_rows_inserted", String(summary.rowsInserted));
    if (summary.dateRange.latest) {
      setSetting("sync.ct_lotto.last_imported_draw_date", summary.dateRange.latest);
    }
    await refreshCtLottoGameInfo();
    return summary;
  } catch (error) {
    setSetting("sync.ct_lotto.last_status", "error");
    setSetting("sync.ct_lotto.last_message", (error as Error).message);
    setSetting("sync.ct_lotto.last_rows_inserted", "0");
    throw error;
  }
}

export async function refreshCtLottoGameInfo() {
  try {
    const response = await fetch(CT_LOTTO_GAME_PAGE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 CTLottoLab/1.0",
        Referer: `${CT_LOTTO_BASE_URL}/WinningNumbers/Lotto!`,
      },
    });

    if (!response.ok) {
      throw new Error(`CT Lottery game info refresh failed with HTTP ${response.status}`);
    }

    const html = await response.text();
    const parsed = parseCtLottoGameInfo(html);
    const payoutSummary = parsed.payoutsDateToken
      ? await fetchCtLottoPayoutSummary(parsed.payoutsDateToken)
      : { jackpotWinnerCount: null, winningTicketsSold: null };

    setSetting("ct_lotto.game_info.latest_draw_date", parsed.latestDrawDate ?? "");
    setSetting("ct_lotto.game_info.latest_draw_numbers", JSON.stringify(parsed.latestDrawNumbers));
    setSetting("ct_lotto.game_info.jackpot_winner_count", String(payoutSummary.jackpotWinnerCount ?? ""));
    setSetting("ct_lotto.game_info.winning_tickets_sold", String(payoutSummary.winningTicketsSold ?? ""));
    setSetting("ct_lotto.game_info.next_draw_date", parsed.nextDrawDate ?? "");
    setSetting("ct_lotto.game_info.estimated_jackpot", parsed.estimatedJackpot ?? "");
    setSetting("ct_lotto.game_info.estimated_cash_value", parsed.estimatedCashValue ?? "");
    setSetting("ct_lotto.game_info.last_refreshed_at", new Date().toISOString());
    setSetting("ct_lotto.game_info.last_status", "success");
    setSetting("ct_lotto.game_info.last_message", "Refreshed next draw and jackpot details.");

    return {
      ...parsed,
      ...payoutSummary,
    };
  } catch (error) {
    setSetting("ct_lotto.game_info.last_status", "error");
    setSetting("ct_lotto.game_info.last_message", (error as Error).message);
    throw error;
  }
}

async function fetchCtLottoPayoutSummary(payoutDateToken: string) {
  const response = await fetch(
    `${CT_LOTTO_BASE_URL}/ajax/getPayouts?numbers=true&game=${CT_LOTTO_GAME_NUMBER}&ddate=${payoutDateToken}`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 CTLottoLab/1.0",
        Referer: CT_LOTTO_GAME_PAGE_URL,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`CT Lottery payout refresh failed with HTTP ${response.status}`);
  }

  return parseCtLottoPayoutSummary(await response.text());
}

export function getNextSyncRange() {
  const db = getDb();
  const latestDrawDate = (
    db.prepare("SELECT MAX(draw_date) as latestDrawDate FROM draws").get() as {
      latestDrawDate: string | null;
    }
  ).latestDrawDate;

  const startDate = latestDrawDate
    ? addDays(latestDrawDate, 1)
    : FALLBACK_SEED_START_DATE;
  const endDate = todayIsoDate();

  return {
    startDate,
    endDate,
  };
}

async function fetchCtLotteryResults(startDateIso: string, endDateIso: string) {
  const url =
    `${CT_LOTTO_BASE_URL}/ajax/getWinningNumbers` +
    `?g=${CT_LOTTO_GAME_NUMBER}` +
    `&s=${encodeURIComponent(formatCtLotteryDate(startDateIso))}` +
    `&e=${encodeURIComponent(formatCtLotteryDate(endDateIso))}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 CTLottoLab/1.0",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${CT_LOTTO_BASE_URL}/WinningNumbers/Lotto!`,
    },
  });

  if (!response.ok) {
    throw new Error(`CT Lottery sync failed with HTTP ${response.status}`);
  }

  const html = await response.text();
  if (html.includes("No Access")) {
    throw new Error("CT Lottery sync was denied by the remote site");
  }

  return html;
}

function formatCtLotteryDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function localCalendarDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function normalizeStoredValue(value: string | undefined) {
  return value && value.trim().length > 0 ? value : null;
}

function parseStoredNumbers(value: string | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as number[];
    return Array.isArray(parsed) ? parsed.filter((item) => Number.isFinite(item)) : [];
  } catch {
    return [];
  }
}

function parseStoredNumber(value: string | undefined) {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
