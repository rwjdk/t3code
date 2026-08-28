import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { readRelewiseProjectMatch, writeRelewiseProjectMatch } from "./relewiseProjectMatches";

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

describe("Relewise project matches", () => {
  it("round-trips a label match", () => {
    const target = storage();
    writeRelewiseProjectMatch(target, "label-1", {
      environmentId: EnvironmentId.make("environment-1"),
      projectId: ProjectId.make("project-1"),
    });
    expect(readRelewiseProjectMatch(target, "label-1")).toEqual({
      environmentId: "environment-1",
      projectId: "project-1",
    });
  });

  it("ignores invalid persisted data", () => {
    expect(readRelewiseProjectMatch(storage("not json"), "label-1")).toBeNull();
  });
});
