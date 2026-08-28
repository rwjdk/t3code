import type { RelewiseBacklogCard } from "@t3tools/contracts";

const TRELLO_CARD_PATH = /^\/c\/([^/?#]+)/i;

export function trelloCardShortLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "trello.com" && parsed.hostname !== "www.trello.com") return null;
    return TRELLO_CARD_PATH.exec(parsed.pathname)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function indexTrelloCards(
  cards: ReadonlyArray<RelewiseBacklogCard>,
): ReadonlyMap<string, RelewiseBacklogCard> {
  return new Map(
    cards.flatMap((card) => {
      const shortLink = trelloCardShortLink(card.url);
      return shortLink === null ? [] : ([[shortLink, card]] as const);
    }),
  );
}
