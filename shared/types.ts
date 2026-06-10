import type { PickerMode } from "./game";

export interface DrawRecord {
  id: number;
  drawDate: string;
  numbers: number[];
  sourceFileName: string | null;
  importedAt: string;
}

export interface ImportFailure {
  rowIndex: number;
  drawDate?: string;
  rawNumbers?: string;
  reason: string;
}

export interface ImportSummary {
  rowsFound: number;
  rowsInserted: number;
  rowsSkippedDuplicateDate: number;
  rowsFailed: number;
  failedRows: ImportFailure[];
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
}

export interface FrequencyRow {
  number: number;
  timesDrawn: number;
  drawPercentage: number;
  expectedCount: number;
  differenceFromExpected: number;
  lastSeenDate: string | null;
  drawsSinceLastSeen: number | null;
  trendLabel: "Hot" | "Cold" | "Neutral";
}

export interface SummaryResponse {
  totalDrawings: number;
  earliestDrawDate: string | null;
  latestDrawDate: string | null;
  lastImportedDraw: string | null;
  syncStatus: SyncStatus | null;
  lottoGameInfo: LottoGameInfo | null;
  dashboardSuggestions: DashboardSuggestion[];
  repeatedCombinations: RepeatedCombination[];
  pickerBacktest: PickerBacktestSummary;
  mostFrequentNumber: FrequencyRow | null;
  leastFrequentNumber: FrequencyRow | null;
  topHotNumbers: FrequencyRow[];
  topColdNumbers: FrequencyRow[];
  frequencyChart: Array<Pick<FrequencyRow, "number" | "timesDrawn">>;
}

export interface LottoGameInfo {
  latestDrawDate: string | null;
  latestDrawNumbers: number[];
  jackpotWinnerCount: number | null;
  winningTicketsSold: number | null;
  nextDrawDate: string | null;
  estimatedJackpot: string | null;
  estimatedCashValue: string | null;
  lastRefreshedAt: string | null;
  lastStatus: "idle" | "success" | "error";
  lastMessage: string | null;
}

export interface DashboardSuggestion {
  mode: PickerMode;
  generatedForDate: string;
  ticket: {
    numbers: number[];
    score: number;
    humanLikenessScore: number;
    humanLikenessReasons: string[];
    explanation: string;
  };
}

export interface RepeatedCombination {
  numbers: number[];
  timesDrawn: number;
  drawDates: string[];
}

export interface PickerRequest {
  mode: PickerMode;
  ticketCount: number;
  excludePreviousWinningCombinations: boolean;
  balanceOddEven: boolean;
  balanceLowHigh: boolean;
  avoidFourOrMoreConsecutive: boolean;
  preferHistoricalNormalSumRange: boolean;
}

export interface GeneratedTicket {
  numbers: number[];
  score: number;
  humanLikenessScore: number;
  humanLikenessReasons: string[];
  explanation: string;
  breakdown: {
    frequencyScore: number;
    recencyScore: number;
    balanceScore: number;
    historicalShapeScore: number;
    noveltyScore: number;
  };
}

export interface DrawsQuery {
  date?: string;
  number?: number;
}

export interface SyncStatus {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: "idle" | "success" | "error";
  lastMessage: string | null;
  lastRowsInserted: number;
  lastImportedDrawDate: string | null;
}

export interface PickerBacktestSummary {
  lastDailyCycleDate: string | null;
  modeSummaries: PickerBacktestModeSummary[];
  recentRuns: PickerBacktestRun[];
  humanLikenessTrend: PickerBacktestHumanLikenessPoint[];
}

export interface PickerBacktestModeSummary {
  mode: PickerMode;
  totalRuns: number;
  evaluatedRuns: number;
  averageMatchedNumbers: number;
  averageHumanLikenessScore: number;
  bestMatchCount: number;
  exactMatchCount: number;
  lastGeneratedForDate: string | null;
  lastTargetDrawDate: string | null;
}

export interface PickerBacktestRun {
  mode: PickerMode;
  generatedForDate: string;
  targetDrawDate: string | null;
  status: "pending" | "evaluated";
  ticketNumbers: number[];
  ticketScore: number;
  humanLikenessScore: number;
  humanLikenessReasons: string[];
  matchCount: number | null;
  matchedNumbers: number[];
  exactMatch: boolean | null;
}

export interface PickerBacktestHumanLikenessPoint {
  generatedForDate: string;
  modeScores: Partial<Record<PickerMode, number>>;
}
