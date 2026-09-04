import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";

import {
  archiveCardUrl,
  checklistItemStateUrl,
  makeBacklogCache,
  makeCardUpdate,
  makeChecklistItemStateUpdate,
  makeStartCardUpdate,
  selectBacklogCards,
} from "./RelewiseBacklog.ts";

describe("archiveCardUrl", () => {
  it("targets the Hub archive operation and encodes the card id", () => {
    expect(archiveCardUrl("card/id")).toBe(
      "https://hub.relewise.com/api/v1/trello/cards/card%2Fid/archive",
    );
  });
});

describe("Trello card updates", () => {
  it("builds encoded checklist state requests", () => {
    expect(checklistItemStateUrl("card/id", "item/id")).toBe(
      "https://hub.relewise.com/api/v1/trello/cards/card%2Fid/checklistItems/item%2Fid/state",
    );
    expect(makeChecklistItemStateUpdate(" rwj@relewise.com ", true)).toEqual({
      creatorId: "rwj@relewise.com",
      state: 2,
    });
    expect(makeChecklistItemStateUpdate("rwj@relewise.com", false).state).toBe(1);
  });

  it("adds the trimmed creator to list and label updates", () => {
    expect(makeCardUpdate(" rwj@relewise.com ", { newListId: "doing" })).toEqual({
      creatorId: "rwj@relewise.com",
      newListId: "doing",
    });
  });
});

describe("makeStartCardUpdate", () => {
  it("moves the card to In Progress as the configured Relewise user", () => {
    expect(makeStartCardUpdate("  rwj@relewise.com ")).toEqual({
      creatorId: "rwj@relewise.com",
      newListId: "60506e04783a5f40a9cf68ce",
    });
  });
});

describe("selectBacklogCards", () => {
  it("returns only backlog cards in Trello order with non-empty labels", () => {
    const cards = selectBacklogCards(
      [
        {
          id: "later",
          name: "Later backlog card",
          description: "Later details",
          board: { id: "board", name: "Sprint Backlog" },
          list: { id: "backlog", name: "Backlog" },
          labels: [
            { id: "hub", name: "Hub" },
            { id: "empty", name: "" },
          ],
          url: "https://trello.com/c/later",
          listPosition: 10,
          cardPosition: 20,
          created: "2026-01-02T00:00:00Z",
          start: null,
          due: null,
          isBlocked: false,
          blockedReason: null,
          isDone: false,
          checklists: [],
        },
        {
          id: "active",
          name: "Active card",
          description: null,
          board: { id: "board", name: "Sprint Backlog" },
          list: { id: "active", name: "In Progress" },
          labels: [{ id: "internal", name: "Internal" }],
          url: "https://trello.com/c/active",
          listPosition: 20,
          cardPosition: 1,
          created: "2026-01-03T00:00:00Z",
          start: null,
          due: null,
          isBlocked: false,
          blockedReason: null,
          isDone: false,
          checklists: [],
        },
        {
          id: "first",
          name: "First backlog card",
          description: "First details",
          board: { id: "board", name: "Sprint Backlog" },
          list: { id: "backlog", name: "Backlog" },
          labels: [{ id: "docs", name: "Docs" }],
          url: "https://trello.com/c/first",
          listPosition: 10,
          cardPosition: 10,
          created: "2026-01-01T00:00:00Z",
          start: "2026-01-04T00:00:00Z",
          due: "2026-01-05T00:00:00Z",
          isBlocked: true,
          blockedReason: "Waiting for review",
          isDone: false,
          checklists: [
            {
              id: "checklist",
              name: "Definition of done",
              checkItems: [
                {
                  id: "item",
                  name: "Review",
                  due: null,
                  state: "complete",
                },
              ],
            },
          ],
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
        description: "First details",
        boardName: "Sprint Backlog",
        listId: "backlog",
        listName: "Backlog",
        listPosition: 10,
        cardPosition: 10,
        labels: [
          {
            id: "docs",
            name: "Docs",
            textColor: "#172B4D",
            backgroundColor: "#E9F2FF",
          },
        ],
        checklists: [
          {
            id: "checklist",
            name: "Definition of done",
            items: [{ id: "item", name: "Review", dueAt: null, isComplete: true }],
          },
        ],
        createdAt: "2026-01-01T00:00:00Z",
        startAt: "2026-01-04T00:00:00Z",
        dueAt: "2026-01-05T00:00:00Z",
        isBlocked: true,
        blockedReason: "Waiting for review",
        isDone: false,
        url: "https://trello.com/c/first",
      },
      {
        id: "later",
        title: "Later backlog card",
        description: "Later details",
        boardName: "Sprint Backlog",
        listId: "backlog",
        listName: "Backlog",
        listPosition: 10,
        cardPosition: 20,
        labels: [{ id: "hub", name: "Hub", textColor: null, backgroundColor: null }],
        checklists: [],
        createdAt: "2026-01-02T00:00:00Z",
        startAt: null,
        dueAt: null,
        isBlocked: false,
        blockedReason: null,
        isDone: false,
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
                {
                  id: String(value),
                  title: "Card",
                  description: null,
                  boardName: "Board",
                  listId: "backlog",
                  listName: "Backlog",
                  listPosition: 1,
                  cardPosition: 1,
                  labels: [],
                  checklists: [],
                  createdAt: "2026-01-01T00:00:00Z",
                  startAt: null,
                  dueAt: null,
                  isBlocked: false,
                  blockedReason: null,
                  isDone: false,
                  url: "https://trello.com",
                },
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
