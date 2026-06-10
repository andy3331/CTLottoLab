import { describe, expect, it } from "vitest";
import { scoreHumanPickLikelihood } from "../src/lib/lowSplitStrategy.js";
import { generateTickets } from "../src/services/pickerService.js";

function buildRequest(mode: "random" | "low_split") {
  return {
    mode,
    ticketCount: 1,
    excludePreviousWinningCombinations: false,
    balanceOddEven: false,
    balanceLowHigh: false,
    avoidFourOrMoreConsecutive: false,
    preferHistoricalNormalSumRange: false,
  } as const;
}

describe("low-split strategy", () => {
  it("penalizes common human-picked patterns", () => {
    const sequence = scoreHumanPickLikelihood([1, 2, 3, 4, 5, 6]);
    const scattered = scoreHumanPickLikelihood([34, 37, 39, 41, 43, 44]);

    expect(sequence.score).toBeGreaterThan(scattered.score);
    expect(sequence.reasons.length).toBeGreaterThan(0);
  });

  it("generates valid low-split tickets without duplicates", () => {
    const ticket = generateTickets(buildRequest("low_split"))[0];
    expect(ticket.numbers).toHaveLength(6);
    expect(ticket.numbers).toEqual([...ticket.numbers].sort((a, b) => a - b));
    expect(new Set(ticket.numbers).size).toBe(6);
    expect(ticket.numbers.every((value) => value >= 1 && value <= 44)).toBe(true);
  });

  it("produces varied random outputs across runs", () => {
    const unique = new Set(
      Array.from({ length: 12 }, () => generateTickets(buildRequest("low_split"))[0].numbers.join("-")),
    );

    expect(unique.size).toBeGreaterThan(1);
  });

  it("avoids birthday-heavy combinations more often than pure random", () => {
    const sampleSize = 30;
    const lowSplitHeavy = Array.from({ length: sampleSize }, () => generateTickets(buildRequest("low_split"))[0])
      .filter((ticket) => ticket.numbers.filter((value) => value <= 31).length >= 5).length;
    const randomHeavy = Array.from({ length: sampleSize }, () => generateTickets(buildRequest("random"))[0])
      .filter((ticket) => ticket.numbers.filter((value) => value <= 31).length >= 5).length;

    expect(lowSplitHeavy).toBeLessThan(randomHeavy);
  });

  it("produces less human-like combinations than pure random on average", () => {
    const sampleSize = 24;
    const lowSplitAverage = Array.from({ length: sampleSize }, () => generateTickets(buildRequest("low_split"))[0])
      .reduce((sum, ticket) => sum + scoreHumanPickLikelihood(ticket.numbers).score, 0) / sampleSize;
    const randomAverage = Array.from({ length: sampleSize }, () => generateTickets(buildRequest("random"))[0])
      .reduce((sum, ticket) => sum + scoreHumanPickLikelihood(ticket.numbers).score, 0) / sampleSize;

    expect(lowSplitAverage).toBeLessThan(randomAverage);
  });
});
