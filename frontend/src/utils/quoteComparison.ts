import { Quote } from "../services/api";

export type QuoteHighlight = "lowestPrice" | "topRated" | "bestValue";

export function quoteHighlights(
  quotes: Quote[],
): Map<string, QuoteHighlight[]> {
  const result = new Map<string, QuoteHighlight[]>();
  if (!quotes.length) return result;

  const add = (id: string, highlight: QuoteHighlight) =>
    result.set(id, [...(result.get(id) || []), highlight]);
  const prices = quotes.map((quote) => Number(quote.estimatedPrice));
  const ratings = quotes.map((quote) => Number(quote.provider?.rating) || 0);
  const lowestPrice = Math.min(...prices);
  const highestRating = Math.max(...ratings);

  quotes.forEach((quote, index) => {
    if (prices[index] === lowestPrice) add(quote.id, "lowestPrice");
    if (ratings[index] === highestRating && highestRating > 0)
      add(quote.id, "topRated");
  });

  const minPrice = Math.max(lowestPrice, 1);
  const scored = quotes.map((quote, index) => {
    const priceScore = minPrice / Math.max(prices[index], 1);
    const ratingScore = ratings[index] / 5;
    const experienceScore =
      Math.min(Number(quote.provider?.completedJobs) || 0, 100) / 100;
    return {
      id: quote.id,
      score: priceScore * 0.5 + ratingScore * 0.35 + experienceScore * 0.15,
    };
  });
  const best = scored.reduce((winner, candidate) =>
    candidate.score > winner.score ? candidate : winner,
  );
  add(best.id, "bestValue");
  return result;
}
