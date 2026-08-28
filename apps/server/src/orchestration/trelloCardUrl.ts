const TRELLO_CARD_PATH = /^\/c\/([^/?#]+)/i;

export function trelloCardUrlFromFirstMessage(text: string | null): string | null {
  if (text === null) return null;

  for (const candidate of text.match(/https?:\/\/[^\s<>()]+/gi) ?? []) {
    try {
      const url = new URL(candidate.replace(/[.,;:!?\]}'"]+$/, ""));
      if (url.hostname !== "trello.com" && url.hostname !== "www.trello.com") continue;
      const shortLink = TRELLO_CARD_PATH.exec(url.pathname)?.[1];
      if (shortLink) return `https://trello.com/c/${shortLink}`;
    } catch {
      // Keep scanning: prose can contain a malformed URL before the card link.
    }
  }

  return null;
}
