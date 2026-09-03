import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentHttpApi,
  EnvironmentHttpInternalServerError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import { annotateEnvironmentRequest, requireEnvironmentScope } from "../auth/http.ts";
import { RelewiseBacklog } from "./RelewiseBacklog.ts";

export const relewiseHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "relewise",
  Effect.fnUntraced(function* (handlers) {
    const backlog = yield* RelewiseBacklog;
    const handleLoad = (effect: typeof backlog.cards) =>
      effect.pipe(
        Effect.mapError(
          () =>
            new EnvironmentHttpInternalServerError({
              message: "Could not load the Relewise Trello backlog.",
            }),
        ),
        Effect.map((cards) => ({ cards })),
      );
    return handlers
      .handle(
        "trelloCards",
        Effect.fn("environment.relewise.trelloCards")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* handleLoad(backlog.allCards);
        }),
      )
      .handle(
        "backlog",
        Effect.fn("environment.relewise.backlog")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* handleLoad(backlog.cards);
        }),
      )
      .handle(
        "refreshBacklog",
        Effect.fn("environment.relewise.refreshBacklog")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* handleLoad(backlog.refresh);
        }),
      )
      .handle(
        "startCard",
        Effect.fn("environment.relewise.startCard")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          return yield* handleLoad(backlog.startCard(args.payload.cardId, args.payload.userEmail));
        }),
      )
      .handle(
        "archiveCard",
        Effect.fn("environment.relewise.archiveCard")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          return yield* handleLoad(backlog.archiveCard(args.payload.cardId));
        }),
      );
  }),
);
