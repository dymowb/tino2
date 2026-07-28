import { describe, expect, test } from "vitest";
import { Quote } from "../services/api";
import { quoteHighlights } from "./quoteComparison";

const quote = (
  id: string,
  price: number,
  rating: number,
  completedJobs: number,
): Quote =>
  ({
    id,
    estimatedPrice: price,
    estimatedDuration: 60,
    status: "pending",
    provider: { rating, completedJobs },
  }) as Quote;

describe("quoteHighlights", () => {
  test("identifies price, rating, and balanced value without mutating quotes", () => {
    const quotes = [quote("cheap", 100, 3, 5), quote("trusted", 130, 5, 100)];
    const highlights = quoteHighlights(quotes);

    expect(highlights.get("cheap")).toContain("lowestPrice");
    expect(highlights.get("trusted")).toEqual(
      expect.arrayContaining(["topRated", "bestValue"]),
    );
    expect(quotes.map((item) => item.id)).toEqual(["cheap", "trusted"]);
  });

  test("handles an empty comparison", () => {
    expect(quoteHighlights([]).size).toBe(0);
  });
});
