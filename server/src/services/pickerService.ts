import { CT_LOTTO_CONFIG, type PickerMode } from "@shared/game";
import type { GeneratedTicket, PickerRequest } from "@shared/types";
import { getFrequencyAnalytics } from "./analyticsService.js";
import { scoreHumanPickLikelihood, selectLowSplitCandidate } from "../lib/lowSplitStrategy.js";
import { listDraws } from "./drawService.js";

const midpoint = Math.floor((CT_LOTTO_CONFIG.numberMin + CT_LOTTO_CONFIG.numberMax) / 2);

export const DAILY_BACKTEST_TICKET_COUNT = 1;
const LOW_SPLIT_CANDIDATE_POOL_SIZE = 90;

export function generateTickets(request: PickerRequest, options?: { rng?: () => number }): GeneratedTicket[] {
  const rng = options?.rng ?? Math.random;
  const frequency = getFrequencyAnalytics();
  const previousDraws = listDraws({});
  const historySet = new Set(previousDraws.map((draw) => draw.numbers.join("-")));
  const sortedByFrequency = [...frequency].sort((a, b) => b.timesDrawn - a.timesDrawn);
  const hotPool = sortedByFrequency.slice(0, 15).map((row) => row.number);
  const coldPool = sortedByFrequency.slice(-15).map((row) => row.number);
  const neutralPool = frequency
    .filter((row) => row.trendLabel === "Neutral")
    .map((row) => row.number);
  const historicalSums = previousDraws.map((draw) => draw.numbers.reduce((sum, value) => sum + value, 0));
  const avgSum =
    historicalSums.length === 0
      ? 0
      : historicalSums.reduce((sum, value) => sum + value, 0) / historicalSums.length;
  const minNormalSum = avgSum - 15;
  const maxNormalSum = avgSum + 15;

  return Array.from({ length: request.ticketCount }, () => {
    let numbers: number[] = [];
    let attempts = 0;
    while (attempts < 500) {
      attempts += 1;
      numbers = pickNumbersByMode(request.mode, {
        frequency,
        hotPool,
        coldPool,
        neutralPool,
      }, rng);
      if (isValidTicket(numbers, request, historySet, minNormalSum, maxNormalSum)) {
        break;
      }
    }

    const explanation = describeTicket(request.mode, numbers, request, historySet, rng);
    return scoreTicket(numbers, explanation, frequency, historySet);
  });
}

export function getDefaultBacktestPickerRequest(mode: PickerMode): PickerRequest {
  return {
    mode,
    ticketCount: DAILY_BACKTEST_TICKET_COUNT,
    excludePreviousWinningCombinations: true,
    balanceOddEven: true,
    balanceLowHigh: true,
    avoidFourOrMoreConsecutive: true,
    preferHistoricalNormalSumRange: true,
  };
}

export function getDefaultDashboardPickerRequest(mode: PickerMode): PickerRequest {
  return {
    mode,
    ticketCount: 1,
    excludePreviousWinningCombinations: true,
    balanceOddEven: true,
    balanceLowHigh: true,
    avoidFourOrMoreConsecutive: true,
    preferHistoricalNormalSumRange: true,
  };
}

function pickNumbersByMode(
  mode: PickerMode,
  pools: {
    frequency: ReturnType<typeof getFrequencyAnalytics>;
    hotPool: number[];
    coldPool: number[];
    neutralPool: number[];
  },
  rng: () => number,
) {
  switch (mode) {
    case "random":
      return uniquePick(weightedPool(pools.frequency.map((row) => ({ number: row.number, weight: 1 }))), rng);
    case "hot":
      return uniquePick(weightedPool(pools.hotPool.map((number) => ({ number, weight: 3 })), pools.frequency), rng);
    case "cold":
      return uniquePick(weightedPool(pools.coldPool.map((number) => ({ number, weight: 3 })), pools.frequency, true), rng);
    case "low_split":
      return generateLowSplitTicket(pools.frequency, rng);
    case "balanced":
      return sortNumbers([
        ...pickFromPool(pools.hotPool, 2, rng),
        ...pickFromPool(pools.neutralPool, 2, rng),
        ...pickFromPool(pools.coldPool, 2, rng),
      ]);
    case "weighted":
      return uniquePick(weightedPool(pools.frequency.map((row) => ({
        number: row.number,
        weight: Math.max(row.timesDrawn, 1),
      }))), rng);
    case "smart":
      return uniquePick(
        weightedPool(
          pools.frequency.map((row) => ({
            number: row.number,
            weight:
              row.timesDrawn * 1.5 +
              (row.trendLabel === "Neutral" ? 3 : row.trendLabel === "Hot" ? 2 : 1) +
              (row.drawsSinceLastSeen === null ? 2 : Math.max(0, 8 - row.drawsSinceLastSeen)),
          })),
        ),
        rng,
      );
  }
}

function weightedPool(
  entries: Array<{ number: number; weight: number }>,
  frequency = getFrequencyAnalytics(),
  inverse = false,
) {
  const pool = new Map<number, number>();
  entries.forEach((entry) => {
    const stat = frequency.find((row) => row.number === entry.number);
    const weight = inverse
      ? Math.max(1, 20 - (stat?.timesDrawn ?? 0))
      : entry.weight;
    pool.set(entry.number, weight);
  });
  return pool;
}

function uniquePick(pool: Map<number, number>, rng: () => number) {
  const selected = new Set<number>();
  while (selected.size < CT_LOTTO_CONFIG.pickCount) {
    selected.add(weightedChoice(pool, rng));
  }
  return sortNumbers([...selected]);
}

function weightedChoice(pool: Map<number, number>, rng: () => number) {
  const entries = [...pool.entries()];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let threshold = rng() * total;
  for (const [number, weight] of entries) {
    threshold -= weight;
    if (threshold <= 0) {
      return number;
    }
  }
  return entries[entries.length - 1][0];
}

function pickFromPool(pool: number[], count: number, rng: () => number) {
  const copy = [...pool];
  const picked: number[] = [];
  while (picked.length < count && copy.length > 0) {
    const index = Math.floor(rng() * copy.length);
    picked.push(copy.splice(index, 1)[0]);
  }
  return picked;
}

function isValidTicket(
  numbers: number[],
  request: PickerRequest,
  historySet: Set<string>,
  minNormalSum: number,
  maxNormalSum: number,
) {
  if (numbers.length !== CT_LOTTO_CONFIG.pickCount) {
    return false;
  }
  if (new Set(numbers).size !== numbers.length) {
    return false;
  }
  if (request.excludePreviousWinningCombinations && historySet.has(numbers.join("-"))) {
    return false;
  }
  if (request.balanceOddEven) {
    const odd = numbers.filter((value) => value % 2 !== 0).length;
    if (odd < 2 || odd > 4) {
      return false;
    }
  }
  if (request.balanceLowHigh) {
    const low = numbers.filter((value) => value <= midpoint).length;
    if (low < 2 || low > 4) {
      return false;
    }
  }
  if (request.avoidFourOrMoreConsecutive) {
    let streak = 1;
    for (let index = 1; index < numbers.length; index += 1) {
      streak = numbers[index] === numbers[index - 1] + 1 ? streak + 1 : 1;
      if (streak >= 4) {
        return false;
      }
    }
  }
  if (request.preferHistoricalNormalSumRange) {
    const sum = numbers.reduce((accumulator, value) => accumulator + value, 0);
    if (sum < minNormalSum || sum > maxNormalSum) {
      return false;
    }
  }
  return true;
}

function scoreTicket(
  numbers: number[],
  explanation: string,
  frequency: ReturnType<typeof getFrequencyAnalytics>,
  historySet: Set<string>,
): GeneratedTicket {
  const stats = numbers.map((number) => frequency.find((row) => row.number === number)!);
  const oddCount = numbers.filter((number) => number % 2 !== 0).length;
  const lowCount = numbers.filter((number) => number <= midpoint).length;
  const frequencyScore = normalize(stats.reduce((sum, row) => sum + row.timesDrawn, 0), 0, 120) * 35;
  const recencyScore =
    normalize(
      stats.reduce((sum, row) => sum + (row.drawsSinceLastSeen === null ? 5 : Math.min(row.drawsSinceLastSeen, 10)), 0),
      0,
      60,
    ) * 15;
  const balanceScore =
    (1 - Math.abs(oddCount - 3) / 3) * 10 + (1 - Math.abs(lowCount - 3) / 3) * 10;
  const sum = numbers.reduce((accumulator, value) => accumulator + value, 0);
  const historicalShapeScore = normalize(1 - Math.abs(sum - 135) / 135, 0, 1) * 20;
  const noveltyScore = historySet.has(numbers.join("-")) ? 0 : 10;
  const total = Math.round(frequencyScore + recencyScore + balanceScore + historicalShapeScore + noveltyScore);
  const humanLikeness = scoreHumanPickLikelihood(numbers);

  return {
    numbers,
    score: Math.max(0, Math.min(100, total)),
    humanLikenessScore: humanLikeness.score,
    humanLikenessReasons: humanLikeness.reasons,
    explanation,
    breakdown: {
      frequencyScore: round1(frequencyScore),
      recencyScore: round1(recencyScore),
      balanceScore: round1(balanceScore),
      historicalShapeScore: round1(historicalShapeScore),
      noveltyScore: round1(noveltyScore),
    },
  };
}

function describeTicket(
  mode: PickerMode,
  numbers: number[],
  request: PickerRequest,
  historySet: Set<string>,
  rng: () => number,
) {
  const odd = numbers.filter((value) => value % 2 !== 0).length;
  const even = numbers.length - odd;
  const clauses = [
    mode === "low_split"
      ? describeLowSplitSelection(numbers, rng)
      :
    mode === "balanced"
      ? "Selected using balanced mode: 2 hot numbers, 2 neutral numbers, and 2 cold numbers."
      : `Selected using ${mode} mode with frequency-aware CT Lotto! rules.`,
    `This ticket has ${odd} odd and ${even} even numbers.`,
    historySet.has(numbers.join("-"))
      ? "It matches a prior winning combination and should be treated as entertainment only."
      : "It does not match a prior winning combination.",
  ];

  if (request.preferHistoricalNormalSumRange) {
    clauses.push("Its total falls within a historically common sum range.");
  }

  return clauses.join(" ");
}

function generateLowSplitTicket(
  frequency: ReturnType<typeof getFrequencyAnalytics>,
  rng: () => number,
) {
  const candidatePool = Array.from({ length: LOW_SPLIT_CANDIDATE_POOL_SIZE }, () =>
    uniquePick(weightedPool(frequency.map((row) => ({ number: row.number, weight: 1 }))), rng),
  );
  return selectLowSplitCandidate(candidatePool, rng).numbers;
}

function describeLowSplitSelection(numbers: number[], rng: () => number) {
  void numbers;
  void rng;
  return "Selected using Low-Split Random: sampled many random valid tickets and kept one that avoided common human-picked patterns like birthdays, neat sequences, lucky numbers, and tidy visual spacing. This does not improve draw odds, but it may reduce the chance of splitting a jackpot if you win.";
}

function sortNumbers(numbers: number[]) {
  return [...numbers].sort((a, b) => a - b);
}

function normalize(value: number, min: number, max: number) {
  if (max === min) {
    return 0;
  }
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
