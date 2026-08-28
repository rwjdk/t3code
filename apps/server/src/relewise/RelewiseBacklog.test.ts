import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";

import { makeBacklogCache, selectBacklogCards } from "./RelewiseBacklog.ts";

describe("selectBacklogCards", () => {
  it("returns only backlog cards in Trello order with non-empty labels", () => {
    const cards = selectBacklogCards(
      [
        {
          id: "later",
          name: "Later backlog card",
          list: { id: "backlog", name: "Backlog" },
          labels: [
            { id: "hub", name: "Hub" },
            { id: "empty", name: "" },
          ],
          url: "https://trello.com/c/later",
          cardPosition: 20,
        },
        {
          id: "active",
          name: "Active card",
          list: { id: "active", name: "In Progress" },
          labels: [{ id: "internal", name: "Internal" }],
          url: "https://trello.com/c/active",
          cardPosition: 1,
        },
        {
          id: "first",
          name: "First backlog card",
          list: { id: "backlog", name: "Backlog" },
          labels: [{ id: "docs", name: "Docs" }],
          url: "https://trello.com/c/first",
          cardPosition: 10,
        },
      ],
      [
        {
          id: "docs",
          name: "Docs",
          color: { textHex: "#172B4D", backgroundHex: "#E9F2FF" },
        },
        { id: "hub", name: "Hub", color: null },
      ],
    );

    expect(cards).toEqual([
      {
        id: "first",
        title: "First backlog card",
        labels: [
          {
            id: "docs",
            name: "Docs",
            textColor: "#172B4D",
            backgroundColor: "#E9F2FF",
          },
        ],
        url: "https://trello.com/c/first",
      },
      {
        id: "later",
        title: "Later backlog card",
        labels: [{ id: "hub", name: "Hub", textColor: null, backgroundColor: null }],
        url: "https://trello.com/c/later",
      },
    ]);
  });

  it.effect("caches successful reads for three minutes and allows explicit refresh", () =>
    Effect.gen(function* () {
      const reads = yield* Ref.make(0);
      const cache = yield* makeBacklogCache(
        Ref.updateAndGet(reads, (value) => value + 1).pipe(
          Effect.map(
            (value) =>
              [
                { id: String(value), title: "Card", labels: [], url: "https://trello.com" },
              ] as const,
          ),
        ),
      );

      expect((yield* cache.cards)[0]?.id).toBe("1");
      expect((yield* cache.cards)[0]?.id).toBe("1");
      yield* TestClock.adjust("3 minutes");
      expect((yield* cache.cards)[0]?.id).toBe("2");
      expect((yield* cache.refresh)[0]?.id).toBe("3");
    }),
  );
});
