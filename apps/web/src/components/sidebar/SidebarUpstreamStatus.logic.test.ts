import { describe, expect, it } from "vite-plus/test";

import { parseUpstreamAheadCount, upstreamStatusLabel } from "./SidebarUpstreamStatus.logic";

describe("SidebarUpstreamStatus", () => {
  it("reads a valid upstream commit count", () => {
    expect(parseUpstreamAheadCount({ ahead_by: 12 })).toBe(12);
    expect(parseUpstreamAheadCount({ ahead_by: -1 })).toBeNull();
    expect(parseUpstreamAheadCount({ ahead_by: "12" })).toBeNull();
  });

  it("describes current and behind builds", () => {
    expect(upstreamStatusLabel(0)).toBe("Up to date with upstream");
    expect(upstreamStatusLabel(1)).toBe("1 commit behind upstream");
    expect(upstreamStatusLabel(4)).toBe("4 commits behind upstream");
  });
});
