import type { Usage } from "./runs";

/** USD per million tokens (Claude API list prices, 2026-11). Update here if prices change. */
const PRICES: { prefix: string; input: number; output: number; cacheRead: number }[] = [
  { prefix: "claude-fable-5-2", input: 8, output: 40, cacheRead: 0.2 },
  { prefix: "claude-opus-5-5", input: 4, output: 20, cacheRead: 0.2 },
  { prefix: "claude-opus", input: 5, output: 25, cacheRead: 0.5 },
  { prefix: "claude-sonnet-5-5", input: 2, output: 10, cacheRead: 0.1 },
  { prefix: "claude-sonnet", input: 2, output: 10, cacheRead: 0.2 },
  { prefix: "claude-haiku-5-5", input: 0.1, output: 0.5, cacheRead: 0.01 },
  { prefix: "claude-haiku", input: 1, output: 5, cacheRead: 0.1 },
];

/** Web search is billed per search. */
const WEB_SEARCH_USD = 0.01;

export function costOf(model: string, u: Usage): number {
  const p = PRICES.find((x) => model.startsWith(x.prefix)) ?? PRICES[1];
  const m = 1_000_000;
  return (
    (u.input * p.input) / m +
    (u.output * p.output) / m +
    (u.cacheWrite * p.input * 1.25) / m +
    (u.cacheRead * p.cacheRead) / m +
    u.webSearches * WEB_SEARCH_USD
  );
}
