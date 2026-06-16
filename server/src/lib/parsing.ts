import * as cheerio from "cheerio";
import { z } from "zod";
import { CT_LOTTO_CONFIG } from "@shared/game";

const parsedRowSchema = z.object({
  drawDate: z.string(),
  numbers: z.array(z.number().int()).length(CT_LOTTO_CONFIG.pickCount),
});

export interface ParsedImportRow {
  drawDateRaw: string;
  drawDate: string;
  numbersRaw: string;
  numbers: number[];
}

export interface RawImportRow {
  drawDateRaw: string;
  numbersRaw: string;
  payoutsDateToken?: string | null;
}

export interface ParsedCtLottoGameInfo {
  latestDrawDate: string | null;
  latestDrawNumbers: number[];
  nextDrawDate: string | null;
  estimatedJackpot: string | null;
  estimatedCashValue: string | null;
  payoutsDateToken: string | null;
}

export interface ParsedCtLottoPayoutSummary {
  jackpotWinnerCount: number | null;
  winningTicketsSold: number | null;
}

export function normalizeDrawDate(value: string): string {
  const trimmed = value.trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid draw date: ${value}`);
  }

  const [, month, day, year] = match;
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function parseWinningNumbers(value: string): number[] {
  const numbers = value
    .split("-")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));

  if (numbers.length !== CT_LOTTO_CONFIG.pickCount) {
    throw new Error(`Expected ${CT_LOTTO_CONFIG.pickCount} numbers`);
  }

  const uniqueNumbers = [...new Set(numbers)];
  if (uniqueNumbers.length !== numbers.length) {
    throw new Error("Duplicate numbers found in draw");
  }

  uniqueNumbers.forEach((numberValue) => {
    if (
      numberValue < CT_LOTTO_CONFIG.numberMin ||
      numberValue > CT_LOTTO_CONFIG.numberMax
    ) {
      throw new Error(`Number ${numberValue} is outside the CT Lotto! range`);
    }
  });

  return [...uniqueNumbers].sort((a, b) => a - b);
}

export function parseCtLottoHtml(content: string): ParsedImportRow[] {
  return extractCtLottoTableRows(content).map((row, index) => {
    try {
      const parsed = parsedRowSchema.parse({
        drawDate: normalizeDrawDate(row.drawDateRaw),
        numbers: parseWinningNumbers(row.numbersRaw),
      });
      return {
        drawDateRaw: row.drawDateRaw,
        drawDate: parsed.drawDate,
        numbersRaw: row.numbersRaw,
        numbers: parsed.numbers,
      };
    } catch (error) {
      throw new Error(`Row ${index + 1}: ${(error as Error).message}`);
    }
  });
}

export function extractCtLottoTableRows(content: string): RawImportRow[] {
  const $ = cheerio.load(content);
  const exactTable = $("#gvWinningNumbers").first();
  const fallbackTable = $("table").filter((_index, element) =>
    $(element).text().includes("Winning Numbers"),
  );
  const table = exactTable.length ? exactTable : fallbackTable.first();

  if (!table.length) {
    throw new Error("Could not locate a CT Lotto! results table in the file");
  }

  const rows: RawImportRow[] = [];
  table.find("tbody tr").each((index, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) {
      return;
    }
    const drawDateRaw = $(cells[0]).text().trim();
    const numbersRaw = $(cells[1]).text().trim();
    const payoutTokenMatch = /DisplayPayouts\(\d+,'(\d+)'/.exec($(cells[2]).find("a").attr("onclick") ?? "");

    if (!drawDateRaw || !numbersRaw) {
      return;
    }

    rows.push({
      drawDateRaw,
      numbersRaw,
      payoutsDateToken: payoutTokenMatch?.[1] ?? null,
    });
  });

  return rows;
}

export function parseCtLottoGameInfo(content: string): ParsedCtLottoGameInfo {
  const $ = cheerio.load(content);
  const latestDrawTime = $(".columns.style01 strong.title time[datetime]").first();
  const latestNumbers = $(".columns.style01 ul.numbers-list li span")
    .toArray()
    .map((element) => Number($(element).text().trim()))
    .filter((value) => Number.isFinite(value));
  const payoutLink = $(".columns.style01 ul.numbers-list a[onclick*='DisplayPayouts']").first();
  const payoutTokenMatch = /DisplayPayouts\(\d+,'(\d+)'/.exec(payoutLink.attr("onclick") ?? "");
  const nextDrawTime = $(".columns.style01 .title.text-uppercase time[datetime]").first();
  const nextDrawDate = nextDrawTime.attr("datetime")?.trim() ?? null;
  const estimatedJackpot = $(".columns.style01 strong.price").first().text().trim() || null;
  const cashValueText = $(".columns.style01 strong.title")
    .filter((_index, element) => $(element).text().includes("EST. CASH VALUE"))
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  const estimatedCashValue = cashValueText
    ? cashValueText.replace(/^EST\.\s*CASH\s*VALUE:\s*/i, "").trim()
    : null;

  if (!nextDrawDate && !estimatedJackpot && !estimatedCashValue) {
    throw new Error("Could not locate Lotto game info on the CT Lottery page");
  }

  return {
    latestDrawDate: latestDrawTime.attr("datetime")?.trim() ?? null,
    latestDrawNumbers: latestNumbers,
    nextDrawDate,
    estimatedJackpot,
    estimatedCashValue,
    payoutsDateToken: payoutTokenMatch?.[1] ?? null,
  };
}

export function parseCtLottoPayoutSummary(content: string): ParsedCtLottoPayoutSummary {
  const $ = cheerio.load(content);
  let jackpotWinnerCount: number | null = null;
  $("table tbody tr").each((_index, row) => {
    const cells = $(row).find("td");
    const tickets = $(cells[0]).text().trim();
    const match = $(cells[1]).text().trim();
    if (match === "6 of 6") {
      jackpotWinnerCount = Number.parseInt(tickets.replace(/,/g, ""), 10);
    }
  });

  const soldText = $(".info-text b").first().text().trim();
  const winningTicketsSold = soldText ? Number.parseInt(soldText.replace(/,/g, ""), 10) : null;

  return {
    jackpotWinnerCount: Number.isFinite(jackpotWinnerCount) ? jackpotWinnerCount : null,
    winningTicketsSold: Number.isFinite(winningTicketsSold) ? winningTicketsSold : null,
  };
}
