import {
  getSharedHighlighter,
  registerCustomTheme,
  type DiffsHighlighter,
  type HighlighterTypes,
  type SupportedLanguages,
  type ThemeRegistration,
} from "@pierre/diffs";

import { resolveDiffThemeName, VISUAL_STUDIO_DIFF_THEME } from "./diffRendering";

/**
 * Always highlight with the Oniguruma WASM engine — the JS regex engine can
 * backtrack catastrophically and hang the tokenizing thread. The shared
 * highlighter is a first-caller-wins singleton, so every creation site must
 * pass this value.
 */
export const PREFERRED_HIGHLIGHTER: HighlighterTypes = "shiki-wasm";

const VISUAL_STUDIO_DARK_CSHARP_THEME = {
  name: VISUAL_STUDIO_DIFF_THEME,
  type: "dark",
  colors: {
    "editor.background": "#1E1E1E",
    "editor.foreground": "#DCDCDC",
  },
  settings: [
    { settings: { background: "#1E1E1E", foreground: "#DCDCDC" } },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#57A64A" },
    },
    {
      scope: ["string", "string.quoted", "constant.other.symbol"],
      settings: { foreground: "#D69D85" },
    },
    {
      scope: ["constant.numeric", "constant.language"],
      settings: { foreground: "#B5CEA8" },
    },
    {
      scope: ["keyword", "storage.type", "storage.modifier", "punctuation.definition.keyword"],
      settings: { foreground: "#569CD6" },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "entity.name.struct",
        "entity.name.enum",
        "support.type",
        "support.class",
        "support.type.primitive",
      ],
      settings: { foreground: "#4EC9B0" },
    },
    {
      scope: ["entity.name.function", "support.function", "meta.function-call"],
      settings: { foreground: "#DCDCAA" },
    },
    {
      scope: ["variable.parameter", "variable.other.readwrite", "variable.other.object"],
      settings: { foreground: "#9CDCFE" },
    },
    {
      scope: ["entity.name.namespace", "entity.name.type.namespace"],
      settings: { foreground: "#DCDCDC" },
    },
    {
      scope: ["constant.character.escape"],
      settings: { foreground: "#D7BA7D" },
    },
    {
      scope: [
        "meta.preprocessor",
        "keyword.control.directive",
        "entity.name.function.preprocessor",
      ],
      settings: { foreground: "#9B9B9B" },
    },
  ],
} satisfies ThemeRegistration;

registerCustomTheme(VISUAL_STUDIO_DIFF_THEME, () =>
  Promise.resolve(VISUAL_STUDIO_DARK_CSHARP_THEME),
);

const highlighterPromiseCache = new Map<string, Promise<DiffsHighlighter>>();

export function getSyntaxHighlighterPromise(language: string): Promise<DiffsHighlighter> {
  const cached = highlighterPromiseCache.get(language);
  if (cached) return cached;

  const promise = getSharedHighlighter({
    themes: [resolveDiffThemeName("dark"), resolveDiffThemeName("light"), VISUAL_STUDIO_DIFF_THEME],
    langs: [language as SupportedLanguages],
    preferredHighlighter: PREFERRED_HIGHLIGHTER,
  }).catch((error) => {
    if (language === "text") {
      highlighterPromiseCache.delete(language);
      // "text" itself failed — Shiki cannot initialize at all, surface the error
      throw error;
    }
    // Language not supported by Shiki — fall back to "text"
    return getSyntaxHighlighterPromise("text");
  });
  highlighterPromiseCache.set(language, promise);
  return promise;
}
