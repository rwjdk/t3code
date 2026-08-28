import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const STORAGE_KEY = "t3code:relewise-label-project-matches:v1";

const StoredProjectMatch = Schema.Struct({
  environmentId: Schema.String,
  projectId: Schema.String,
});

const StoredProjectMatches = Schema.Record(Schema.String, StoredProjectMatch);

export interface RelewiseProjectMatch {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}

export function readRelewiseProjectMatch(
  storage: Pick<Storage, "getItem">,
  labelId: string,
): RelewiseProjectMatch | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(StoredProjectMatches))(raw);
    return Option.match(decoded, {
      onNone: () => null,
      onSome: (matches) => (matches[labelId] as RelewiseProjectMatch | undefined) ?? null,
    });
  } catch {
    return null;
  }
}

export function writeRelewiseProjectMatch(
  storage: Pick<Storage, "getItem" | "setItem">,
  labelId: string,
  match: RelewiseProjectMatch,
): void {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const decoded = raw
      ? Schema.decodeUnknownOption(Schema.fromJsonString(StoredProjectMatches))(raw)
      : Option.none();
    const matches = Option.getOrElse(decoded, () => ({}));
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...matches, [labelId]: match }));
  } catch {
    // A blocked or full localStorage should not prevent the thread from starting.
  }
}
