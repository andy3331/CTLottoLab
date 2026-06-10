import { CT_LOTTO_CONFIG } from "@shared/game";

export interface LowSplitPenaltyConfig {
  heavyBirthdayPenalty: number;
  allBirthdayPenalty: number;
  obviousSequencePenalty: number;
  arithmeticPatternPenalty: number;
  tightClusterPenalty: number;
  sameDecadePenalty: number;
  luckyNumberPenalty: number;
  allLowPenalty: number;
  prettyBalancePenalty: number;
  unusualLowSumPenalty: number;
  multipleOfFiveClusterPenalty: number;
}

export interface LowSplitAnalysis {
  score: number;
  reasons: string[];
}

export const DEFAULT_LOW_SPLIT_CONFIG: LowSplitPenaltyConfig = {
  heavyBirthdayPenalty: 3,
  allBirthdayPenalty: 1,
  obviousSequencePenalty: 2,
  arithmeticPatternPenalty: 2,
  tightClusterPenalty: 2,
  sameDecadePenalty: 2,
  luckyNumberPenalty: 1,
  allLowPenalty: 2,
  prettyBalancePenalty: 1,
  unusualLowSumPenalty: 1,
  multipleOfFiveClusterPenalty: 1,
};

const COMMON_LUCKY_NUMBERS = new Set([7, 11, 13, 21, 23]);
const decadeBucket = (value: number) => Math.floor((value - 1) / 10);

export function scoreHumanPickLikelihood(
  numbers: number[],
  config: LowSplitPenaltyConfig = DEFAULT_LOW_SPLIT_CONFIG,
): LowSplitAnalysis {
  const sorted = [...numbers].sort((a, b) => a - b);
  let score = 0;
  const reasons: string[] = [];

  const birthdayCount = sorted.filter((value) => value <= 31).length;
  if (birthdayCount >= 5) {
    score += config.heavyBirthdayPenalty;
    reasons.push("birthday-heavy");
  }
  if (birthdayCount === sorted.length) {
    score += config.allBirthdayPenalty;
    reasons.push("all numbers fall in the 1-31 date range");
  }

  if (longestConsecutiveRun(sorted) >= 4) {
    score += config.obviousSequencePenalty;
    reasons.push("contains an obvious consecutive sequence");
  }

  if (hasArithmeticProgression(sorted)) {
    score += config.arithmeticPatternPenalty;
    reasons.push("contains a clean arithmetic spacing pattern");
  }

  if (sorted[sorted.length - 1] - sorted[0] <= 15) {
    score += config.tightClusterPenalty;
    reasons.push("numbers are tightly clustered");
  }

  const decadeCounts = new Map<number, number>();
  sorted.forEach((value) => {
    const bucket = decadeBucket(value);
    decadeCounts.set(bucket, (decadeCounts.get(bucket) ?? 0) + 1);
  });
  if ([...decadeCounts.values()].some((count) => count >= 4)) {
    score += config.sameDecadePenalty;
    reasons.push("too many numbers sit in the same decade range");
  }

  const luckyHits = sorted.filter((value) => COMMON_LUCKY_NUMBERS.has(value)).length;
  if (luckyHits > 0) {
    score += luckyHits * config.luckyNumberPenalty;
    reasons.push(`uses ${luckyHits} commonly favored lucky number${luckyHits > 1 ? "s" : ""}`);
  }

  if (sorted.every((value) => value <= midpoint())) {
    score += config.allLowPenalty;
    reasons.push("all numbers are in the lower half of the board");
  }

  const oddCount = sorted.filter((value) => value % 2 !== 0).length;
  const lowCount = sorted.filter((value) => value <= midpoint()).length;
  if (oddCount === 3 && lowCount === 3) {
    score += config.prettyBalancePenalty;
    reasons.push("looks too perfectly balanced");
  }

  const sum = sorted.reduce((total, value) => total + value, 0);
  if (sum < 100) {
    score += config.unusualLowSumPenalty;
    reasons.push("sum is unusually low");
  }

  if (sorted.filter((value) => value % 5 === 0).length >= 4) {
    score += config.multipleOfFiveClusterPenalty;
    reasons.push("leans into neat multiples of five");
  }

  return {
    score,
    reasons,
  };
}

export function selectLowSplitCandidate(
  candidates: number[][],
  rng: () => number,
  config: LowSplitPenaltyConfig = DEFAULT_LOW_SPLIT_CONFIG,
) {
  const analyzed = candidates.map((numbers) => ({
    numbers,
    analysis: scoreHumanPickLikelihood(numbers, config),
  }));
  analyzed.sort((a, b) => a.analysis.score - b.analysis.score);

  const shortlistSize = Math.max(1, Math.ceil(analyzed.length * 0.2));
  const shortlist = analyzed.slice(0, shortlistSize);
  return shortlist[Math.floor(rng() * shortlist.length)];
}

function longestConsecutiveRun(numbers: number[]) {
  let best = 1;
  let streak = 1;
  for (let index = 1; index < numbers.length; index += 1) {
    streak = numbers[index] === numbers[index - 1] + 1 ? streak + 1 : 1;
    best = Math.max(best, streak);
  }
  return best;
}

function hasArithmeticProgression(numbers: number[]) {
  if (numbers.length < 4) {
    return false;
  }

  const differences = numbers.slice(1).map((value, index) => value - numbers[index]);
  const repeatedDiff = differences.every((difference) => difference === differences[0]);
  if (repeatedDiff && differences[0] > 0) {
    return true;
  }

  for (let index = 2; index < differences.length; index += 1) {
    if (
      differences[index] === differences[index - 1] &&
      differences[index - 1] === differences[index - 2]
    ) {
      return true;
    }
  }

  return false;
}

function midpoint() {
  return Math.floor((CT_LOTTO_CONFIG.numberMin + CT_LOTTO_CONFIG.numberMax) / 2);
}
