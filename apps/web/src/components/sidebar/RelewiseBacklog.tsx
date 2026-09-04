import type { RelewiseBacklogCard } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { truncate } from "@t3tools/shared/String";
import { useNavigate } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import { ChevronDownIcon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";

import { markPromotedDraftThreadByRef, useComposerDraftStore } from "../../composerDraftStore";
import { PrimaryEnvironmentHttpClient } from "../../environments/primary/httpClient";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { runPrimaryHttp } from "../../lib/runtime";
import { cn, newMessageId } from "../../lib/utils";
import { resolveDefaultProviderModelSelection } from "../../providerInstances";
import { useRelewiseSettings } from "../../relewiseSettings";
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
import {
  readRelewiseProjectMatch,
  selectRelewiseProjectLabels,
  writeRelewiseProjectMatch,
} from "./relewiseProjectMatches";
import { RelewiseCardDetailsDialog } from "./RelewiseCardDetailsDialog";
import { groupRelewiseTrelloCards } from "./relewiseTrelloCards";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly cards: ReadonlyArray<RelewiseBacklogCard> }
  | { readonly status: "error" };

export const RelewiseBacklog = memo(function RelewiseBacklog() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [listExpandedOverrides, setListExpandedOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const [startingCardId, setStartingCardId] = useState<string | null>(null);
  const [detailsCard, setDetailsCard] = useState<RelewiseBacklogCard | null>(null);
  const [pickerCard, setPickerCard] = useState<RelewiseBacklogCard | null>(null);
  const projects = useProjects();
  const newThread = useNewThreadHandler();
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const primaryProviders = useAtomValue(primaryServerProvidersAtom);
  const { userEmail } = useRelewiseSettings();
  const groups = useMemo(
    () => (state.status === "ready" ? groupRelewiseTrelloCards(state.cards) : []),
    [state],
  );

  useEffect(() => {
    let active = true;
    void runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) => client.relewise.trelloCards({ headers: {} })),
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
        Effect.flatMap((client) => client.relewise.refreshTrelloCards({ headers: {} })),
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
      try {
        const moved = await runPrimaryHttp(
          PrimaryEnvironmentHttpClient.pipe(
            Effect.flatMap((client) =>
              client.relewise.startCard({
                headers: {},
                payload: { cardId: card.id, userEmail },
              }),
            ),
          ),
        );
        setState({ status: "ready", cards: moved.cards });
      } catch (error) {
        toastManager.add({
          type: "warning",
          title: "Chat started, but Trello was not updated",
          description:
            error instanceof Error ? error.message : "The card could not be moved to In Progress.",
        });
      }
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
    if (userEmail.length === 0) {
      toastManager.add({
        type: "error",
        title: "Relewise email required",
        description: "Add your email in Settings → Relewise before starting this card.",
      });
      return;
    }
    const projectLabels = selectRelewiseProjectLabels(card.labels);
    if (projectLabels.length === 1 && typeof window !== "undefined") {
      const match = readRelewiseProjectMatch(window.localStorage, projectLabels[0]!.id);
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
    const projectLabels = selectRelewiseProjectLabels(card.labels);
    if (projectLabels.length === 1 && typeof window !== "undefined") {
      writeRelewiseProjectMatch(window.localStorage, projectLabels[0]!.id, {
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
        >
          <RefreshCwIcon className={refreshing ? "size-3 animate-spin" : "size-3"} />
        </button>
      </div>
    );
  }
  if (state.cards.length === 0) return null;

  return (
    <section className="min-h-0" aria-label="Trello">
      <div className="mb-1 mt-3 flex items-center gap-2 px-2.5">
        <span className="text-xs font-medium text-muted-foreground/50">
          Trello ({state.cards.length})
        </span>
        <span className="h-px flex-1 bg-sidebar-border/60" />
        <button
          type="button"
          className="flex size-5 items-center justify-center rounded text-muted-foreground/50 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh Trello"
        >
          <RefreshCwIcon className={refreshing ? "size-3 animate-spin" : "size-3"} />
        </button>
        <button
          type="button"
          className="flex size-5 items-center justify-center rounded text-muted-foreground/50 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls="trello-cards"
          aria-label={expanded ? "Collapse Trello" : "Expand Trello"}
        >
          <ChevronDownIcon
            aria-hidden
            className={cn("size-3 transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>
      <div
        id="trello-cards"
        className={cn("max-h-72 space-y-1 overflow-y-auto", !expanded && "hidden")}
      >
        {groups.map((group) => {
          const listExpanded =
            listExpandedOverrides.get(group.listId) ?? group.listName === "In Progress";
          const cardsId = `trello-list-${group.listId}`;
          return (
            <section key={group.listId} aria-labelledby={`${cardsId}-heading`}>
              <button
                id={`${cardsId}-heading`}
                type="button"
                className="flex h-7 w-full items-center gap-1.5 rounded px-2 text-xs font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                onClick={() =>
                  setListExpandedOverrides((current) => {
                    const next = new Map(current);
                    next.set(group.listId, !listExpanded);
                    return next;
                  })
                }
                aria-expanded={listExpanded}
                aria-controls={cardsId}
              >
                <ChevronDownIcon
                  aria-hidden
                  className={cn("size-3 transition-transform", listExpanded && "rotate-180")}
                />
                <span className="min-w-0 truncate">{group.listName}</span>
                <span className="ml-auto text-sidebar-muted-foreground/60">
                  {group.cards.length}
                </span>
              </button>
              <ul id={cardsId} className={cn("space-y-0.5", !listExpanded && "hidden")}>
                {group.cards.map((card) => (
                  <li
                    key={card.id}
                    className="group/trello-card grid min-h-8 grid-cols-[minmax(0,1fr)_2rem_1.25rem] items-center gap-2 rounded-md px-2 py-1.5 pl-6 hover:bg-sidebar-row-hover"
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailsCard(card)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setDetailsCard(card);
                    }}
                  >
                    <span className="min-w-0 truncate text-xs text-sidebar-foreground">
                      {card.title}
                    </span>
                    <span className="mt-0.5 flex self-start items-center justify-end gap-0.5">
                      {card.labels.map((label) => (
                        <span
                          key={label.id}
                          className="h-4 w-1.5 rounded-none bg-sidebar-accent ring-1 ring-inset ring-black/10"
                          style={
                            label.backgroundColor === null
                              ? undefined
                              : { backgroundColor: label.backgroundColor }
                          }
                          aria-label={label.name}
                        />
                      ))}
                    </span>
                    <button
                      type="button"
                      className="flex size-5 items-center justify-center rounded text-sidebar-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-sidebar-foreground group-hover/trello-card:opacity-100 focus-visible:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        startCard(card);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      disabled={startingCardId !== null}
                      aria-label={`Start working on this: ${card.title}`}
                    >
                      <PlayIcon className="size-3" fill="currentColor" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <RelewiseCardDetailsDialog
        card={detailsCard}
        onOpenChange={(open) => !open && setDetailsCard(null)}
        onCardsUpdated={(cards) => {
          setState({ status: "ready", cards });
          setDetailsCard(cards.find(({ id }) => id === detailsCard?.id) ?? null);
        }}
        footer={
          <Button
            onClick={() => {
              const card = detailsCard;
              if (card === null) return;
              setDetailsCard(null);
              startCard(card);
            }}
            disabled={detailsCard === null || startingCardId !== null}
          >
            <PlayIcon className="size-4" fill="currentColor" />
            Start working on this
          </Button>
        }
      />
      <Dialog open={pickerCard !== null} onOpenChange={(open) => !open && setPickerCard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select a project</DialogTitle>
            <DialogDescription>
              {(() => {
                const projectLabels = selectRelewiseProjectLabels(pickerCard?.labels ?? []);
                return projectLabels.length === 1
                  ? `This choice will be remembered for the ${projectLabels[0]?.name ?? "card"} label.`
                  : projectLabels.length === 0
                    ? "This card has no project label, so its project will not be remembered."
                    : "Cards with multiple project labels always ask which project to use.";
              })()}
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
