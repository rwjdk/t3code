import type {
  RelewiseBacklogCard,
  RelewiseBacklogLabel,
  RelewiseTrelloOptionsResult,
} from "@t3tools/contracts";
import {
  Cache,
  Config,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

const HUB_API_URL = "https://hub.relewise.com/api/v1";
const DEFAULT_TRELLO_MEMBER_ID = "63c14bd0466af2001c308467";
const BACKLOG_BOARD_ID = "5c61e8231ce6c68845734a80";
const BACKLOG_LIST_NAME = "Backlog";
const IN_PROGRESS_LIST_ID = "60506e04783a5f40a9cf68ce";
const BACKLOG_CACHE_KEY = "backlog";
const BACKLOG_CACHE_TTL = Duration.minutes(3);

export function makeStartCardUpdate(userEmail: string) {
  return {
    creatorId: userEmail.trim(),
    newListId: IN_PROGRESS_LIST_ID,
  } as const;
}

export function archiveCardUrl(cardId: string): string {
  return `${HUB_API_URL}/trello/cards/${encodeURIComponent(cardId)}/archive`;
}

export function checklistItemStateUrl(cardId: string, checklistItemId: string): string {
  return `${HUB_API_URL}/trello/cards/${encodeURIComponent(cardId)}/checklistItems/${encodeURIComponent(checklistItemId)}/state`;
}

export function makeCardUpdate(userEmail: string, update: Record<string, unknown>) {
  return { creatorId: userEmail.trim(), ...update };
}

export function makeChecklistItemStateUpdate(userEmail: string, isComplete: boolean) {
  return {
    creatorId: userEmail.trim(),
    state: isComplete ? 2 : 1,
  } as const;
}

const HubIdName = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
});

const HubTrelloChecklistItem = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  due: Schema.NullOr(Schema.String),
  state: Schema.String,
});

const HubTrelloChecklist = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  checkItems: Schema.Array(HubTrelloChecklistItem),
});

const HubTrelloCard = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  board: HubIdName,
  list: HubIdName,
  labels: Schema.Array(HubIdName),
  url: Schema.String,
  listPosition: Schema.Union([Schema.Number, Schema.NumberFromString]),
  cardPosition: Schema.Union([Schema.Number, Schema.NumberFromString]),
  created: Schema.String,
  start: Schema.NullOr(Schema.String),
  due: Schema.NullOr(Schema.String),
  isBlocked: Schema.Boolean,
  blockedReason: Schema.NullOr(Schema.String),
  isDone: Schema.Boolean,
  checklists: Schema.Array(HubTrelloChecklist),
});

const HubTrelloCards = Schema.Array(HubTrelloCard);
type HubTrelloCard = typeof HubTrelloCard.Type;

const HubTrelloLabelColor = Schema.Struct({
  textHex: Schema.String,
  backgroundHex: Schema.String,
});

const HubTrelloLabel = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: Schema.NullOr(HubTrelloLabelColor),
});

const HubTrelloLabels = Schema.Array(HubTrelloLabel);
type HubTrelloLabel = typeof HubTrelloLabel.Type;

const HubTrelloLists = Schema.Array(HubIdName);

function mapLabel(label: HubTrelloLabel): RelewiseBacklogLabel {
  return {
    id: label.id,
    name: label.name,
    textColor: label.color?.textHex ?? null,
    backgroundColor: label.color?.backgroundHex ?? null,
  };
}

export function selectTrelloCards(
  cards: ReadonlyArray<HubTrelloCard>,
  labels: ReadonlyArray<HubTrelloLabel>,
): ReadonlyArray<RelewiseBacklogCard> {
  const labelsById = new Map(labels.map((label) => [label.id, label]));
  return [...cards]
    .sort(
      (left, right) =>
        right.listPosition - left.listPosition || left.cardPosition - right.cardPosition,
    )
    .map((card) => ({
      id: card.id,
      title: card.name,
      description: card.description,
      boardName: card.board.name,
      listId: card.list.id,
      listName: card.list.name,
      listPosition: card.listPosition,
      cardPosition: card.cardPosition,
      labels: card.labels.flatMap((cardLabel): ReadonlyArray<RelewiseBacklogLabel> => {
        if (cardLabel.name.length === 0) return [];
        const label = labelsById.get(cardLabel.id);
        return label
          ? [mapLabel(label)]
          : [{ id: cardLabel.id, name: cardLabel.name, textColor: null, backgroundColor: null }];
      }),
      checklists: card.checklists.map((checklist) => ({
        id: checklist.id,
        name: checklist.name,
        items: checklist.checkItems.map((item) => ({
          id: item.id,
          name: item.name,
          isComplete: item.state === "complete",
          dueAt: item.due,
        })),
      })),
      createdAt: card.created,
      startAt: card.start,
      dueAt: card.due,
      isBlocked: card.isBlocked,
      blockedReason: card.blockedReason,
      isDone: card.isDone,
      url: card.url,
    }));
}

export function selectBacklogCards(
  cards: ReadonlyArray<HubTrelloCard>,
  labels: ReadonlyArray<HubTrelloLabel>,
): ReadonlyArray<RelewiseBacklogCard> {
  return selectTrelloCards(cards, labels).filter((card) => card.listName === BACKLOG_LIST_NAME);
}

export const makeBacklogCache = Effect.fn("RelewiseBacklog.makeBacklogCache")(function* <E>(
  lookup: Effect.Effect<ReadonlyArray<RelewiseBacklogCard>, E>,
) {
  const cache = yield* Cache.makeWith(() => lookup, {
    capacity: 1,
    timeToLive: (exit) => (Exit.isSuccess(exit) ? BACKLOG_CACHE_TTL : Duration.zero),
  });
  const cards = Cache.get(cache, BACKLOG_CACHE_KEY);
  const refresh = Cache.invalidate(cache, BACKLOG_CACHE_KEY).pipe(Effect.andThen(cards));
  return { cards, refresh } as const;
});

export class RelewiseBacklogError extends Schema.TaggedErrorClass<RelewiseBacklogError>()(
  "RelewiseBacklogError",
  { cause: Schema.Defect() },
) {}

export class RelewiseBacklog extends Context.Service<
  RelewiseBacklog,
  {
    readonly cards: Effect.Effect<ReadonlyArray<RelewiseBacklogCard>, RelewiseBacklogError>;
    readonly allCards: Effect.Effect<ReadonlyArray<RelewiseBacklogCard>, RelewiseBacklogError>;
    readonly refreshAll: Effect.Effect<ReadonlyArray<RelewiseBacklogCard>, RelewiseBacklogError>;
    readonly options: Effect.Effect<RelewiseTrelloOptionsResult, RelewiseBacklogError>;
    readonly refresh: Effect.Effect<ReadonlyArray<RelewiseBacklogCard>, RelewiseBacklogError>;
    readonly startCard: (
      cardId: string,
      userEmail: string,
    ) => Effect.Effect<ReadonlyArray<RelewiseBacklogCard>, RelewiseBacklogError>;
    readonly archiveCard: (
      cardId: string,
    ) => Effect.Effect<ReadonlyArray<RelewiseBacklogCard>, RelewiseBacklogError>;
    readonly moveCard: (
      cardId: string,
      listId: string,
      userEmail: string,
    ) => Effect.Effect<ReadonlyArray<RelewiseBacklogCard>, RelewiseBacklogError>;
    readonly updateLabels: (
      cardId: string,
      labelIdsToAdd: ReadonlyArray<string>,
      labelIdsToRemove: ReadonlyArray<string>,
      userEmail: string,
    ) => Effect.Effect<ReadonlyArray<RelewiseBacklogCard>, RelewiseBacklogError>;
    readonly updateChecklistItem: (
      cardId: string,
      checklistItemId: string,
      isComplete: boolean,
      userEmail: string,
    ) => Effect.Effect<ReadonlyArray<RelewiseBacklogCard>, RelewiseBacklogError>;
  }
>()("t3/relewise/RelewiseBacklog") {
  static readonly layer = Layer.effect(
    RelewiseBacklog,
    Effect.gen(function* () {
      const apiKey = yield* Config.redacted("relewise-hub-mcp-key").pipe(Config.option);
      const memberId = yield* Config.string("RELEWISE_TRELLO_MEMBER_ID").pipe(
        Config.withDefault(DEFAULT_TRELLO_MEMBER_ID),
      );
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest((request) =>
          Option.match(apiKey, {
            onNone: () => request,
            onSome: (key) => HttpClientRequest.setHeader(request, "x-api-key", Redacted.value(key)),
          }),
        ),
        HttpClient.filterStatusOk,
      );

      const loadCards = Effect.fn("RelewiseBacklog.loadCards")(function* () {
        if (Option.isNone(apiKey)) {
          return yield* new RelewiseBacklogError({
            cause: new Error("Missing relewise-hub-mcp-key environment variable."),
          });
        }

        const [cards, labels] = yield* Effect.all(
          [
            client
              .get(`${HUB_API_URL}/trello/cards_for_member`, {
                urlParams: { memberIdOrEmail: memberId },
              })
              .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(HubTrelloCards))),
            client
              .get(`${HUB_API_URL}/trello/boards/${BACKLOG_BOARD_ID}/labels`)
              .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(HubTrelloLabels))),
          ],
          { concurrency: "unbounded" },
        ).pipe(Effect.mapError((cause) => new RelewiseBacklogError({ cause })));

        return selectTrelloCards(cards, labels);
      });

      const cache = yield* makeBacklogCache(loadCards());
      const options = Effect.gen(function* () {
        const [lists, labels] = yield* Effect.all(
          [
            client
              .get(`${HUB_API_URL}/trello/boards/sprint/lists`)
              .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(HubTrelloLists))),
            client
              .get(`${HUB_API_URL}/trello/boards/${BACKLOG_BOARD_ID}/labels`)
              .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(HubTrelloLabels))),
          ],
          { concurrency: "unbounded" },
        ).pipe(Effect.mapError((cause) => new RelewiseBacklogError({ cause })));
        return { lists, labels: labels.filter((label) => label.name.length > 0).map(mapLabel) };
      });
      const cards = cache.cards.pipe(
        Effect.map((allCards) => allCards.filter((card) => card.listName === BACKLOG_LIST_NAME)),
      );
      const refresh = cache.refresh.pipe(
        Effect.map((allCards) => allCards.filter((card) => card.listName === BACKLOG_LIST_NAME)),
      );
      const startCard = Effect.fn("RelewiseBacklog.startCard")(function* (
        cardId: string,
        userEmail: string,
      ) {
        const update = makeStartCardUpdate(userEmail);
        if (update.creatorId.length === 0) {
          return yield* new RelewiseBacklogError({
            cause: new Error("A Relewise user email is required to move the Trello card."),
          });
        }
        yield* HttpClientRequest.put(
          `${HUB_API_URL}/trello/cards/${encodeURIComponent(cardId)}`,
        ).pipe(
          HttpClientRequest.bodyJson(update),
          Effect.flatMap(client.execute),
          Effect.asVoid,
          Effect.mapError((cause) => new RelewiseBacklogError({ cause })),
        );
        return yield* cache.refresh;
      });
      const archiveCard = Effect.fn("RelewiseBacklog.archiveCard")(function* (cardId: string) {
        yield* client.execute(HttpClientRequest.put(archiveCardUrl(cardId))).pipe(
          Effect.asVoid,
          Effect.mapError((cause) => new RelewiseBacklogError({ cause })),
        );
        return yield* cache.refresh;
      });
      const updateCard = Effect.fn("RelewiseBacklog.updateCard")(function* (
        cardId: string,
        userEmail: string,
        update: Record<string, unknown>,
      ) {
        yield* HttpClientRequest.put(
          `${HUB_API_URL}/trello/cards/${encodeURIComponent(cardId)}`,
        ).pipe(
          HttpClientRequest.bodyJson(makeCardUpdate(userEmail, update)),
          Effect.flatMap(client.execute),
          Effect.asVoid,
          Effect.mapError((cause) => new RelewiseBacklogError({ cause })),
        );
        return yield* cache.refresh;
      });
      const moveCard = (cardId: string, listId: string, userEmail: string) =>
        updateCard(cardId, userEmail, { newListId: listId });
      const updateLabels = (
        cardId: string,
        labelIdsToAdd: ReadonlyArray<string>,
        labelIdsToRemove: ReadonlyArray<string>,
        userEmail: string,
      ) => updateCard(cardId, userEmail, { labelIdsToAdd, labelIdsToRemove });
      const updateChecklistItem = Effect.fn("RelewiseBacklog.updateChecklistItem")(function* (
        cardId: string,
        checklistItemId: string,
        isComplete: boolean,
        userEmail: string,
      ) {
        yield* HttpClientRequest.put(checklistItemStateUrl(cardId, checklistItemId)).pipe(
          HttpClientRequest.bodyJson(makeChecklistItemStateUpdate(userEmail, isComplete)),
          Effect.flatMap(client.execute),
          Effect.asVoid,
          Effect.mapError((cause) => new RelewiseBacklogError({ cause })),
        );
        return yield* cache.refresh;
      });
      return RelewiseBacklog.of({
        cards,
        allCards: cache.cards,
        refreshAll: cache.refresh,
        options,
        refresh,
        startCard,
        archiveCard,
        moveCard,
        updateLabels,
        updateChecklistItem,
      });
    }),
  );
}
