import type { RelewiseBacklogCard } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { indexTrelloCards, trelloCardShortLink } from "./trelloThreadCards";

describe("Trello thread cards", () => {
  it("matches cards independently of host casing and title slugs", () => {
    const card = { url: "https://trello.com/c/Ab12Cd34/current-title" } as RelewiseBacklogCard;
    expect(trelloCardShortLink("https://www.trello.com/c/ab12CD34/old-title")).toBe("ab12cd34");
    expect(indexTrelloCards([card]).get("ab12cd34")).toBe(card);
  });
});
