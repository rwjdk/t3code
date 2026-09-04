import type {
  OrchestrationProjectShell,
  OrchestrationShellSnapshot,
  OrchestrationShellStreamItem,
  ProjectScriptIcon,
} from "@t3tools/contracts";

const LEGACY_MOBILE_SCRIPT_ICONS = new Set<ProjectScriptIcon>([
  "play",
  "test",
  "lint",
  "configure",
  "build",
  "debug",
]);

/**
 * Mobile releases can lag behind the server and older builds decode script
 * icons as a closed union. Keep their shell snapshot decodable while desktop
 * and web clients retain the expanded icon set.
 */
export function projectShellSnapshotForMobile(
  snapshot: OrchestrationShellSnapshot,
): OrchestrationShellSnapshot {
  return {
    ...snapshot,
    projects: snapshot.projects.map(projectProjectShellForMobile),
  };
}

function projectProjectShellForMobile(
  project: OrchestrationProjectShell,
): OrchestrationProjectShell {
  return {
    ...project,
    scripts: project.scripts.map((script) =>
      LEGACY_MOBILE_SCRIPT_ICONS.has(script.icon)
        ? script
        : { ...script, icon: "configure" as const },
    ),
  };
}

export function projectShellStreamItemForMobile(
  item: OrchestrationShellStreamItem,
): OrchestrationShellStreamItem {
  if (item.kind === "snapshot") {
    return { ...item, snapshot: projectShellSnapshotForMobile(item.snapshot) };
  }
  if (item.kind === "project-upserted") {
    return { ...item, project: projectProjectShellForMobile(item.project) };
  }
  return item;
}
