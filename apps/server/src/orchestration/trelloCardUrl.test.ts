import { describe, expect, it } from "@effect/vitest";

import { trelloCardUrlFromFirstMessage } from "./trelloCardUrl.ts";

describe("trelloCardUrlFromFirstMessage", () => {
  it("extracts and canonicalizes a Trello card URL from prose", () => {
    expect(
      trelloCardUrlFromFirstMessage(
        "Please implement https://www.trello.com/c/Ab12Cd34/a-renamed-card, including tests.",
      ),
    ).toBe("https://trello.com/c/Ab12Cd34");
  });

  it("ignores board URLs and lookalike hosts", () => {
    expect(trelloCardUrlFromFirstMessage("https://trello.com/b/board-id/name")).toBeNull();
    expect(trelloCardUrlFromFirstMessage("https://trello.com.example/c/Ab12Cd34/name")).toBeNull();
  });
});
