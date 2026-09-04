import type { RelewiseBacklogCard } from "@t3tools/contracts";

export interface RelewiseTrelloCardGroup {
  readonly listId: string;
  readonly listName: string;
  readonly cards: ReadonlyArray<RelewiseBacklogCard>;
}

export function groupRelewiseTrelloCards(
  cards: ReadonlyArray<RelewiseBacklogCard>,
): ReadonlyArray<RelewiseTrelloCardGroup> {
  const groups = new Map<string, RelewiseTrelloCardGroup>();
  for (const card of [...cards].sort(
    (left, right) =>
      right.listPosition - left.listPosition || left.cardPosition - right.cardPosition,
  )) {
    const group = groups.get(card.listId);
    if (group) {
      groups.set(card.listId, { ...group, cards: [...group.cards, card] });
    } else {
      groups.set(card.listId, {
        listId: card.listId,
        listName: card.listName,
        cards: [card],
      });
    }
  }
  return [...groups.values()];
}
