import type { RelewiseBacklogCard } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { truncate } from "@t3tools/shared/String";
import { useNavigate } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import { PlayIcon, RefreshCwIcon } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { markPromotedDraftThreadByRef, useComposerDraftStore } from "../../composerDraftStore";
import { PrimaryEnvironmentHttpClient } from "../../environments/primary/httpClient";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { runPrimaryHttp } from "../../lib/runtime";
import { newMessageId } from "../../lib/utils";
import { resolveDefaultProviderModelSelection } from "../../providerInstances";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { primaryServerProvidersAtom } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { buildThreadRouteParams } from "../../threadRoutes";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../ui/dialog";
import { toastManager } from "../ui/toast";
import { waitForStartedServerThread } from "../ChatView.logic";
import { readRelewiseProjectMatch, writeRelewiseProjectMatch } from "./relewiseProjectMatches";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly cards: ReadonlyArray<RelewiseBacklogCard> }
  | { readonly status: "error" };

export const RelewiseBacklog = memo(function RelewiseBacklog() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [startingCardId, setStartingCardId] = useState<string | null>(null);
  const [pickerCard, setPickerCard] = useState<RelewiseBacklogCard | null>(null);
  const projects = useProjects();
  const newThread = useNewThreadHandler();
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const primaryProviders = useAtomValue(primaryServerProvidersAtom);

  useEffect(() => {
    let active = true;
    void runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) => client.relewise.backlog({ headers: {} })),
      ),
    ).then(
      (result) => active && setState({ status: "ready", cards: result.cards }),
      () => active && setState({ status: "error" }),
    );
    return () => {
      active = false;
    };
  }, []);

  const refresh = () => {
    setRefreshing(true);
    void runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) => client.relewise.refreshBacklog({ headers: {} })),
      ),
    )
      .then(
        (result) => setState({ status: "ready", cards: result.cards }),
        () => undefined,
      )
      .finally(() => {
        setRefreshing(false);
      });
  };

  const startCardInProject = async (
    card: RelewiseBacklogCard,
    project: (typeof projects)[number],
  ) => {
    if (startingCardId !== null) return;
    setStartingCardId(card.id);
    try {
      const opened = await newThread(scopeProjectRef(project.environmentId, project.id));
      if (opened === null) throw new Error("The project could not open a new draft.");
      const store = useComposerDraftStore.getState();
      const draft = store.getDraftSession(opened.draftId);
      const composer = store.getComposerDraft(opened.draftId);
      if (draft === null) throw new Error("The new draft was not available.");
      const providers =
        environments.find((environment) => environment.environmentId === project.environmentId)
          ?.serverConfig?.providers ??
        (project.environmentId === primaryEnvironmentId ? primaryProviders : []);
      const composerSelection = composer?.activeProvider
        ? composer.modelSelectionByProvider[composer.activeProvider]
        : null;
      const modelSelection = resolveDefaultProviderModelSelection(
        providers,
        composerSelection ?? project.defaultModelSelection,
      );
      if (modelSelection === null) {
        store.setPrompt(opened.draftId, card.url);
        throw new Error("Configure a provider for this project before starting the card.");
      }
      if (draft.envMode === "worktree" && draft.worktreePath === null && draft.branch === null) {
        store.setPrompt(opened.draftId, card.url);
        throw new Error("Select a base branch before starting this card in a new worktree.");
      }

      const threadRef = scopeThreadRef(project.environmentId, opened.threadId);
      const result = await startTurn({
        environmentId: project.environmentId,
        input: {
          threadId: opened.threadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: card.url,
            attachments: [],
          },
          modelSelection,
          titleSeed: truncate(card.title),
          runtimeMode: draft.runtimeMode,
          interactionMode: draft.interactionMode,
          bootstrap: {
            createThread: {
              projectId: project.id,
              title: truncate(card.title),
              modelSelection,
              runtimeMode: draft.runtimeMode,
              interactionMode: draft.interactionMode,
              branch: draft.branch,
              worktreePath: draft.worktreePath,
              createdAt: draft.createdAt,
            },
            ...(draft.envMode === "worktree" && draft.worktreePath === null && draft.branch !== null
              ? {
                  prepareWorktree: {
                    projectCwd: project.workspaceRoot,
                    baseBranch: draft.branch,
                    startFromOrigin: draft.startFromOrigin,
                  },
                  runSetupScript: true,
                }
              : {}),
          },
          createdAt: new Date().toISOString(),
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      markPromotedDraftThreadByRef(threadRef);
      await waitForStartedServerThread(threadRef);
      await navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not start backlog card",
        description: error instanceof Error ? error.message : "The thread could not be started.",
      });
    } finally {
      setStartingCardId(null);
    }
  };

  const startCard = (card: RelewiseBacklogCard) => {
    if (card.labels.length === 1 && typeof window !== "undefined") {
      const match = readRelewiseProjectMatch(window.localStorage, card.labels[0]!.id);
      const project = match
        ? projects.find(
            (candidate) =>
              candidate.environmentId === match.environmentId && candidate.id === match.projectId,
          )
        : null;
      if (project) {
        void startCardInProject(card, project);
        return;
      }
    }
    setPickerCard(card);
  };

  const selectProject = (project: (typeof projects)[number]) => {
    const card = pickerCard;
    if (card === null) return;
    if (card.labels.length === 1 && typeof window !== "undefined") {
      writeRelewiseProjectMatch(window.localStorage, card.labels[0]!.id, {
        environmentId: project.environmentId,
        projectId: project.id,
      });
    }
    setPickerCard(null);
    void startCardInProject(card, project);
  };

  if (state.status === "loading") {
    return (
      <div className="px-2 py-2 text-xs text-sidebar-muted-foreground/60">Loading Trello…</div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex items-center gap-1 px-2 py-2 text-xs text-destructive">
        <span>Trello unavailable</span>
        <button
          type="button"
          className="inline-flex size-5 items-center justify-center rounded text-destructive hover:bg-sidebar-row-hover"
          onClick={refresh}
          disabled={refreshing}
          aria-label="Retry loading Trello"
          title="Retry loading Trello"
        >
          <RefreshCwIcon className={refreshing ? "size-3 animate-spin" : "size-3"} />
        </button>
      </div>
    );
  }
  if (state.cards.length === 0) return null;

  return (
    <section className="min-h-0 border-t border-sidebar-border/70 pt-2" aria-label="Trello">
      <div className="mb-1 flex items-center px-2 text-xs font-medium text-sidebar-muted-foreground">
        <span>Trello</span>
        <span className="ml-auto tabular-nums opacity-60">{state.cards.length}</span>
        <button
          type="button"
          className="ml-1 rounded p-1 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh Trello"
          title="Refresh Trello"
        >
          <RefreshCwIcon className={refreshing ? "size-3 animate-spin" : "size-3"} />
        </button>
      </div>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto">
        {state.cards.map((card) => (
          <li key={card.id} className="group relative rounded-md hover:bg-sidebar-row-hover">
            <div className="w-full px-2 py-1.5 pr-8 text-left" title={card.title}>
              <span className="flex items-start text-xs text-sidebar-foreground">
                <span className="min-w-0 flex-1 line-clamp-2">{card.title}</span>
              </span>
              {card.labels.length > 0 ? (
                <span className="mt-1 flex flex-wrap gap-1">
                  {card.labels.map((label) => (
                    <span
                      key={label.id}
                      className="rounded-sm bg-sidebar-accent px-1 py-0.5 text-[10px] leading-none text-sidebar-muted-foreground"
                      style={{
                        ...(label.backgroundColor === null
                          ? {}
                          : { backgroundColor: label.backgroundColor }),
                        ...(label.textColor === null ? {} : { color: label.textColor }),
                      }}
                    >
                      {label.name}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="absolute right-1 top-1 rounded p-1 text-sidebar-muted-foreground opacity-60 hover:bg-sidebar-accent hover:text-sidebar-foreground hover:opacity-100 focus-visible:opacity-100"
              onClick={() => startCard(card)}
              disabled={startingCardId !== null}
              aria-label={`Start chat for ${card.title}`}
              title="Start chat"
            >
              <PlayIcon className="size-3" fill="currentColor" />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={pickerCard !== null} onOpenChange={(open) => !open && setPickerCard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select a project</DialogTitle>
            <DialogDescription>
              {pickerCard?.labels.length === 1
                ? `This choice will be remembered for the ${pickerCard.labels[0]?.name ?? "card"} label.`
                : pickerCard?.labels.length === 0
                  ? "This card has no label, so its project will not be remembered."
                  : "Cards with multiple labels always ask which project to use."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="max-h-80 space-y-1">
            {projects.map((project) => (
              <Button
                key={`${project.environmentId}:${project.id}`}
                variant="ghost"
                className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
                onClick={() => selectProject(project)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{project.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {project.workspaceRoot}
                  </span>
                </span>
              </Button>
            ))}
            {projects.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No projects are available.
              </p>
            ) : null}
          </DialogPanel>
        </DialogContent>
      </Dialog>
    </section>
  );
});
