import express from "express";
import multer from "multer";
import { z } from "zod";
import { PICKER_MODES } from "@shared/game";
import { getFrequencyAnalytics, getSummaryAnalytics } from "../services/analyticsService.js";
import { listDrawsForHistory } from "../services/drawService.js";
import { importCtLottoFile } from "../services/importService.js";
import { evaluatePendingBacktestRuns, getPickerBacktestSummary, runDailyPickerBacktestCycle } from "../services/pickerBacktestService.js";
import { generateTickets } from "../services/pickerService.js";
import { getSyncStatus, runCtLottoSync } from "../services/syncService.js";

const upload = multer();
export const apiRouter = express.Router();

apiRouter.get("/health", (_request, response) => {
  response.json({ ok: true });
});

apiRouter.post("/imports/ct-lotto", upload.single("file"), (request, response) => {
  if (!request.file) {
    response.status(400).json({ message: "Please upload an HTML or TXT file." });
    return;
  }

  try {
    const summary = importCtLottoFile({
      fileName: request.file.originalname,
      content: request.file.buffer.toString("utf-8"),
    });
    response.json(summary);
  } catch (error) {
    response.status(400).json({ message: (error as Error).message });
  }
});

apiRouter.get("/draws", async (request, response) => {
  const querySchema = z.object({
    date: z.string().optional(),
    number: z.coerce.number().int().min(1).max(44).optional(),
    jackpotWinnerCount: z.coerce.number().int().min(0).optional(),
  });
  const query = querySchema.parse(request.query);
  response.json(await listDrawsForHistory(query));
});

apiRouter.get("/analytics/frequency", (_request, response) => {
  response.json(getFrequencyAnalytics());
});

apiRouter.get("/analytics/summary", (_request, response) => {
  response.json(getSummaryAnalytics());
});

apiRouter.get("/analytics/backtest", (_request, response) => {
  response.json(getPickerBacktestSummary());
});

apiRouter.get("/sync/status", (_request, response) => {
  response.json(getSyncStatus());
});

apiRouter.post("/sync/ct-lotto", async (_request, response) => {
  try {
    const summary = await runCtLottoSync();
    evaluatePendingBacktestRuns();
    response.json(summary);
  } catch (error) {
    response.status(502).json({ message: (error as Error).message });
  }
});

apiRouter.post("/backtest/run-daily", async (_request, response) => {
  try {
    const summary = await runDailyPickerBacktestCycle({ force: true });
    response.json(summary);
  } catch (error) {
    response.status(500).json({ message: (error as Error).message });
  }
});

apiRouter.post("/picks/generate", (request, response) => {
  const requestSchema = z.object({
    mode: z.enum(PICKER_MODES),
    ticketCount: z.number().int().min(1).max(20),
    excludePreviousWinningCombinations: z.boolean(),
    balanceOddEven: z.boolean(),
    balanceLowHigh: z.boolean(),
    avoidFourOrMoreConsecutive: z.boolean(),
    preferHistoricalNormalSumRange: z.boolean(),
  });

  const payload = requestSchema.parse(request.body);
  response.json(generateTickets(payload));
});
