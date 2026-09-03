import { WorkerPoolContextProvider, useWorkerPool } from "@pierre/diffs/react";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import * as Schema from "effect/Schema";
import { useEffect, useMemo, type ReactNode } from "react";
import { useTheme } from "../hooks/useTheme";
import {
  resolveDiffThemeName,
  VISUAL_STUDIO_DIFF_THEME,
  type DiffThemeName,
} from "../lib/diffRendering";
import { PREFERRED_HIGHLIGHTER } from "../lib/syntaxHighlighting";

export class DiffWorkerError extends Schema.TaggedErrorClass<DiffWorkerError>()("DiffWorkerError", {
  operation: Schema.Literals(["create-worker", "get-render-options", "set-render-options"]),
  themeName: Schema.Literals(["pierre-light", "pierre-dark", VISUAL_STUDIO_DIFF_THEME]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Diff worker operation ${this.operation} failed for theme ${this.themeName}.`;
  }
}

/**
 * Pierre's worker renderer owns one theme for the whole pool and ignores an
 * individual CodeView's theme while that pool is active. Full Diff mode is the
 * only visible diff consumer while both sidebars are collapsed, so temporarily
 * move the pool to Visual Studio colors and put the app theme back on unmount.
 */
export function DiffWorkerVisualStudioThemeOverride() {
  const workerPool = useWorkerPool();
  const { resolvedTheme } = useTheme();
  const restoreThemeName = resolveDiffThemeName(resolvedTheme);

  useEffect(() => {
    if (!workerPool) return;

    const setTheme = async (themeName: DiffWorkerError["themeName"]) => {
      let operation: DiffWorkerError["operation"] = "get-render-options";
      try {
        const current = workerPool.getDiffRenderOptions();
        if (current.theme === themeName) return;

        operation = "set-render-options";
        await workerPool.setRenderOptions({ ...current, theme: themeName });
      } catch (cause) {
        console.error(new DiffWorkerError({ operation, themeName, cause }));
      }
    };

    void setTheme(VISUAL_STUDIO_DIFF_THEME);
    return () => void setTheme(restoreThemeName);
  }, [restoreThemeName, workerPool]);

  return null;
}

function DiffWorkerThemeSync({ themeName }: { themeName: DiffThemeName }) {
  const workerPool = useWorkerPool();

  useEffect(() => {
    if (!workerPool) {
      return;
    }

    let operation: DiffWorkerError["operation"] = "get-render-options";
    void (async () => {
      try {
        const current = workerPool.getDiffRenderOptions();
        if (current.theme === themeName) {
          return;
        }

        operation = "set-render-options";
        await workerPool.setRenderOptions({
          ...current,
          theme: themeName,
        });
      } catch (cause) {
        console.error(new DiffWorkerError({ operation, themeName, cause }));
      }
    })();
  }, [themeName, workerPool]);

  return null;
}

export function DiffWorkerPoolProvider({ children }: { children?: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const diffThemeName = resolveDiffThemeName(resolvedTheme);
  const workerPoolSize = useMemo(() => {
    const cores =
      typeof navigator === "undefined" ? 4 : Math.max(1, navigator.hardwareConcurrency || 4);
    return Math.max(2, Math.min(6, Math.floor(cores / 2)));
  }, []);

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: () => {
          try {
            return new DiffsWorker();
          } catch (cause) {
            throw new DiffWorkerError({
              operation: "create-worker",
              themeName: diffThemeName,
              cause,
            });
          }
        },
        poolSize: workerPoolSize,
        totalASTLRUCacheSize: 240,
      }}
      highlighterOptions={{
        theme: diffThemeName,
        preferredHighlighter: PREFERRED_HIGHLIGHTER,
        tokenizeMaxLineLength: 1_000,
        useTokenTransformer: true,
      }}
    >
      <DiffWorkerThemeSync themeName={diffThemeName} />
      {children}
    </WorkerPoolContextProvider>
  );
}
