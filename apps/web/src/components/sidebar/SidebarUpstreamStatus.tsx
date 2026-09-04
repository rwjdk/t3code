import { useCallback, useEffect, useState } from "react";

import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import {
  parseUpstreamAheadCount,
  UPSTREAM_COMPARE_URL,
  upstreamStatusLabel,
} from "./SidebarUpstreamStatus.logic";

const upstreamCommitHash = import.meta.env.T3CODE_UPSTREAM_COMMIT_HASH;

export function SidebarUpstreamStatus() {
  const enabled = Boolean(window.desktopBridge && upstreamCommitHash);
  const [commits, setCommits] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(`${UPSTREAM_COMPARE_URL}/${upstreamCommitHash}...main`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: unknown) => setCommits(parseUpstreamAheadCount(value)))
      .catch(() => setCommits(null));
    return () => controller.abort();
  }, [enabled]);

  useEffect(() => refresh(), [refresh]);
  useLiveRefresh(refresh, { enabled, key: "desktop-upstream-status" });

  if (!enabled || commits === null) return null;
  return (
    <div
      className="ml-auto min-w-0 truncate px-1 text-right text-[10px] text-muted-foreground/55"
      title={upstreamStatusLabel(commits)}
    >
      {upstreamStatusLabel(commits)}
    </div>
  );
}
