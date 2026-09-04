import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const diffPanelPath = path.join(repoRoot, "apps/web/src/components/DiffPanel.tsx");
const diffPanel = await readFile(diffPanelPath, "utf8");

const requiredDiffWorkspaceSignatures = [
  ["Visual Studio addition background", "--diffs-bg-addition-override: #375b4d"],
  ["Visual Studio deletion background", "--diffs-bg-deletion-override: #56100d"],
  ["fixed Visual Studio diff theme", "theme: VISUAL_STUDIO_DIFF_THEME"],
  [
    "single-file tree selection",
    ".filter((entry) => !showFileTree || entry.filePath === selectedTreeFilePath)",
  ],
  ["custom diff CSS wiring", "unsafeCSSExtra={VISUAL_STUDIO_DIFF_UNSAFE_CSS}"],
  ["text-only paths in diff headers", "[data-diffs-header] [data-change-icon]"],
];

const forbiddenDiffWorkspaceSignatures = [
  ["upstream collapsible multi-file tree", 'from "./diffs/DiffFileTree"'],
];

const failures = [];
for (const [label, signature] of requiredDiffWorkspaceSignatures) {
  if (!diffPanel.includes(signature)) failures.push(`missing ${label}`);
}
for (const [label, signature] of forbiddenDiffWorkspaceSignatures) {
  if (diffPanel.includes(signature)) failures.push(`restored ${label}`);
}

if (failures.length > 0) {
  console.error("Fork customization guard failed:");
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  console.error(
    "Restore the custom diff workspace from 28779a77c8d48e821a1cf93095efef8db7d55261 before packaging.",
  );
  process.exitCode = 1;
} else {
  console.log("Fork customization guard passed: custom diff workspace is intact.");
}
