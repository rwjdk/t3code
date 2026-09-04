import type { RelewiseBacklogCard } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { groupRelewiseTrelloCards } from "./relewiseTrelloCards";

const card = (
  id: string,
  listId: string,
  listName: string,
  listPosition: number,
  cardPosition: number,
) => ({ id, listId, listName, listPosition, cardPosition }) as RelewiseBacklogCard;

describe("groupRelewiseTrelloCards", () => {
  it("groups cards by list with highest-positioned lists first and cards in list order", () => {
    const groups = groupRelewiseTrelloCards([
      card("doing-later", "doing", "Doing", 20, 20),
      card("backlog", "backlog", "Backlog", 10, 1),
      card("doing-first", "doing", "Doing", 20, 10),
    ]);

    expect(groups.map((group) => [group.listName, group.cards.map(({ id }) => id)])).toEqual([
      ["Doing", ["doing-first", "doing-later"]],
      ["Backlog", ["backlog"]],
    ]);
  });
});
