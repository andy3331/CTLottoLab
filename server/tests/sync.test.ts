import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "../src/db/database.js";
import { parseCtLottoGameInfo, parseCtLottoPayoutSummary } from "../src/lib/parsing.js";
import { importCtLottoFile } from "../src/services/importService.js";
import * as syncService from "../src/services/syncService.js";

describe("sync scheduling data", () => {
  beforeEach(() => {
    resetDbForTests(getDb());
  });

  it("uses the fallback seeded start date when no draws exist", () => {
    expect(syncService.getNextSyncRange().startDate).toBe("2020-06-07");
  });

  it("starts the next sync window after the latest stored draw", () => {
    importCtLottoFile({
      fileName: "sample.html",
      content: `
        <table id="gvWinningNumbers">
          <tbody>
            <tr><td>6/5/2026</td><td>2 - 9 - 13 - 24 - 31 - 34</td><td>View</td></tr>
          </tbody>
        </table>
      `,
    });

    expect(syncService.getNextSyncRange().startDate).toBe("2026-06-06");
  });

  it("exposes an idle sync status before any run", () => {
    expect(syncService.getSyncStatus()).toEqual({
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastStatus: "idle",
      lastMessage: null,
      lastRowsInserted: 0,
      lastImportedDrawDate: null,
    });
  });

  it("does not treat a failed same-day attempt as done for the day", async () => {
    expect(
      syncService.shouldSkipAutomaticSync(
        {
          lastAttemptAt: new Date().toISOString(),
          lastSuccessAt: null,
          lastStatus: "error",
          lastMessage: "network failure",
          lastRowsInserted: 0,
          lastImportedDrawDate: null,
        },
        new Date(),
      ),
    ).toBe(false);
  });

  it("does skip further automatic sync after a same-day success", () => {
    expect(
      syncService.shouldSkipAutomaticSync(
        {
          lastAttemptAt: new Date().toISOString(),
          lastSuccessAt: new Date().toISOString(),
          lastStatus: "success",
          lastMessage: "ok",
          lastRowsInserted: 1,
          lastImportedDrawDate: "2026-06-10",
        },
        new Date(),
      ),
    ).toBe(true);
  });

  it("parses next draw and jackpot details from the Lotto page", () => {
    const parsed = parseCtLottoGameInfo(`
      <div class="columns style01 d-flex align-items-center">
        <div class="mx-auto">
          <strong class="title">Tuesday, <time datetime="2026-06-09">Jun. 9, 2026</time></strong>
          <ul class="numbers-list">
            <li><span>1</span></li>
            <li><span>15</span></li>
            <li><span>19</span></li>
            <li><span>30</span></li>
            <li><span>32</span></li>
            <li><span>41</span></li>
            <li class="btn-holder"><a href="#" onclick="javascript: return DisplayPayouts(6,'06092026',true);">payouts</a></li>
          </ul>
        </div>
      </div>
      <div class="columns style01 d-flex align-items-center">
        <div class="mx-auto">
          <span class="title text-uppercase"><span>NEXT DRAWING:</span> <time datetime="2026-06-12">Friday, Jun. 12</time></span>
          <span class="text">ESTIMATED JACKPOT</span>
          <strong class="price">$3,400,000</strong>
          <strong class="title"><span>EST. CASH VALUE: </span>$1.85 million</strong>
        </div>
      </div>
    `);

    expect(parsed).toEqual({
      latestDrawDate: "2026-06-09",
      latestDrawNumbers: [1, 15, 19, 30, 32, 41],
      nextDrawDate: "2026-06-12",
      estimatedJackpot: "$3,400,000",
      estimatedCashValue: "$1.85 million",
      payoutsDateToken: "06092026",
    });
  });

  it("parses jackpot winner counts from the payout markup", () => {
    const parsed = parseCtLottoPayoutSummary(`
      <table>
        <tbody>
          <tr><td>0</td><td>6 of 6</td><td class="R">$0</td></tr>
          <tr><td>4</td><td>5 of 6</td><td>$2,882</td></tr>
        </tbody>
      </table>
      <span class="info-text text-center">Winning tickets sold: <b>4,026</b></span>
    `);

    expect(parsed).toEqual({
      jackpotWinnerCount: 0,
      winningTicketsSold: 4026,
    });
  });
});
