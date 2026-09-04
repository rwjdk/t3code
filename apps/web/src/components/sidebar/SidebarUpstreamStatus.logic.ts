export const UPSTREAM_COMPARE_URL = "https://api.github.com/repos/pingdotgg/t3-code/compare";

export function parseUpstreamAheadCount(value: unknown): number | null {
  if (typeof value !== "object" || value === null || !("ahead_by" in value)) return null;
  const aheadBy = value.ahead_by;
  return typeof aheadBy === "number" && Number.isSafeInteger(aheadBy) && aheadBy >= 0
    ? aheadBy
    : null;
}

export function upstreamStatusLabel(commits: number): string {
  if (commits === 0) return "Up to date with upstream";
  return `${commits} ${commits === 1 ? "commit" : "commits"} behind upstream`;
}
