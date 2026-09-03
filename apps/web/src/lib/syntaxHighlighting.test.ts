import type { DiffsHighlighter } from "@pierre/diffs";
import { expect, it, vi } from "vite-plus/test";

const { getSharedHighlighter, registerCustomTheme } = vi.hoisted(() => ({
  getSharedHighlighter: vi.fn(),
  registerCustomTheme: vi.fn(),
}));

vi.mock("@pierre/diffs", () => ({
  getSharedHighlighter,
  registerCustomTheme,
}));

import { getSyntaxHighlighterPromise } from "./syntaxHighlighting";

it("registers the Visual Studio C# syntax palette", async () => {
  expect(registerCustomTheme).toHaveBeenCalledOnce();
  expect(registerCustomTheme.mock.calls[0]?.[0]).toBe("visual-studio-dark-csharp");

  const loader = registerCustomTheme.mock.calls[0]?.[1] as
    | (() => Promise<{
        settings: Array<{ scope?: string[]; settings: { foreground?: string } }>;
      }>)
    | undefined;
  const theme = await loader?.();
  expect(theme?.settings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        scope: expect.arrayContaining(["keyword"]),
        settings: expect.objectContaining({ foreground: "#569CD6" }),
      }),
      expect.objectContaining({
        scope: expect.arrayContaining(["entity.name.type"]),
        settings: expect.objectContaining({ foreground: "#4EC9B0" }),
      }),
      expect.objectContaining({
        scope: expect.arrayContaining(["entity.name.function"]),
        settings: expect.objectContaining({ foreground: "#DCDCAA" }),
      }),
    ]),
  );
});

it("caches the recovered text highlighter for unsupported languages", async () => {
  const textHighlighter = {} as DiffsHighlighter;
  getSharedHighlighter.mockImplementation(({ langs }: { langs: string[] }) =>
    langs[0] === "text"
      ? Promise.resolve(textHighlighter)
      : Promise.reject(new Error("unsupported language")),
  );

  const first = getSyntaxHighlighterPromise("unsupported-test-language");
  await expect(first).resolves.toBe(textHighlighter);
  const second = getSyntaxHighlighterPromise("unsupported-test-language");

  expect(second).toBe(first);
  expect(getSharedHighlighter).toHaveBeenCalledTimes(2);
});
