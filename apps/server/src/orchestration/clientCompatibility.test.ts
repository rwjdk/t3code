import type { OrchestrationShellSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import {
  projectShellSnapshotForMobile,
  projectShellStreamItemForMobile,
} from "./clientCompatibility.ts";

describe("mobile shell snapshot compatibility", () => {
  it("maps expanded script icons while preserving legacy icons", () => {
    const snapshot = {
      snapshotSequence: 1,
      projects: [
        {
          scripts: [
            { id: "start", name: "Start", command: "start", icon: "play" },
            { id: "stop", name: "Stop", command: "stop", icon: "stop" },
          ],
        },
      ],
      threads: [],
      updatedAt: "2026-09-04T00:00:00.000Z",
    } as unknown as OrchestrationShellSnapshot;

    const projected = projectShellSnapshotForMobile(snapshot);

    expect(projected.projects[0]?.scripts.map((script) => script.icon)).toEqual([
      "play",
      "configure",
    ]);
    expect(snapshot.projects[0]?.scripts[1]?.icon).toBe("stop");
  });

  it("maps expanded icons in live project updates", () => {
    const item = {
      kind: "project-upserted",
      sequence: 2,
      project: {
        scripts: [{ id: "stop", name: "Stop", command: "stop", icon: "stop" }],
      },
    } as unknown as Parameters<typeof projectShellStreamItemForMobile>[0];

    const projected = projectShellStreamItemForMobile(item);

    expect(projected.kind).toBe("project-upserted");
    if (projected.kind === "project-upserted") {
      expect(projected.project.scripts[0]?.icon).toBe("configure");
    }
  });
});
