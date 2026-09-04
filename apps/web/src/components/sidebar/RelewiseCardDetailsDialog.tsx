import type { RelewiseBacklogCard, RelewiseTrelloOptionsResult } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { ArchiveIcon, ExternalLinkIcon, MoveRightIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { requestConfirmDialog } from "../../confirmDialog";
import { PrimaryEnvironmentHttpClient } from "../../environments/primary/httpClient";
import { runPrimaryHttp } from "../../lib/runtime";
import { useRelewiseSettings } from "../../relewiseSettings";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../ui/dialog";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { toastManager } from "../ui/toast";

type Mutation = "archive" | "checklist" | "labels" | "list";

export function RelewiseCardDetailsDialog(props: {
  card: RelewiseBacklogCard | null;
  onOpenChange: (open: boolean) => void;
  onCardsUpdated: (cards: ReadonlyArray<RelewiseBacklogCard>) => void;
  footer?: ReactNode;
}) {
  const { card, footer, onCardsUpdated, onOpenChange } = props;
  const { userEmail } = useRelewiseSettings();
  const cardId = card?.id ?? null;
  const [optionsState, setOptionsState] = useState<
    | { readonly cardId: string; readonly result: RelewiseTrelloOptionsResult }
    | { readonly cardId: string; readonly result: null }
    | null
  >(null);
  const options = optionsState?.cardId === cardId ? optionsState.result : null;
  const optionsFailed = optionsState?.cardId === cardId && optionsState.result === null;
  const [mutation, setMutation] = useState<Mutation | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [draftLabelIds, setDraftLabelIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (cardId === null) return;
    let active = true;
    void runPrimaryHttp(
      PrimaryEnvironmentHttpClient.pipe(
        Effect.flatMap((client) => client.relewise.trelloOptions({ headers: {} })),
      ),
    ).then(
      (result) => active && setOptionsState({ cardId, result }),
      () => active && setOptionsState({ cardId, result: null }),
    );
    return () => {
      active = false;
    };
  }, [cardId]);

  const canEdit = () => {
    if (userEmail.length > 0) return true;
    toastManager.add({
      type: "error",
      title: "Relewise email required",
      description: "Add your email in Settings → Relewise before editing Trello cards.",
    });
    return false;
  };
  const failed = (title: string, error: unknown) =>
    toastManager.add({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "The Trello card could not be updated.",
    });

  const archiveCard = async () => {
    if (card === null || mutation !== null) return;
    if (
      !(await requestConfirmDialog(`Archive the Trello card “${card.title}”?`, {
        variant: "destructive",
      }))
    )
      return;
    setMutation("archive");
    try {
      const result = await runPrimaryHttp(
        PrimaryEnvironmentHttpClient.pipe(
          Effect.flatMap((client) =>
            client.relewise.archiveCard({ headers: {}, payload: { cardId: card.id } }),
          ),
        ),
      );
      onCardsUpdated(result.cards);
      onOpenChange(false);
      toastManager.add({ type: "success", title: "Trello card archived" });
    } catch (error) {
      failed("Could not archive Trello card", error);
    } finally {
      setMutation(null);
    }
  };

  const moveCard = async (listId: string | null) => {
    if (
      card === null ||
      listId === null ||
      listId === card.listId ||
      mutation !== null ||
      !canEdit()
    )
      return;
    setMutation("list");
    try {
      const result = await runPrimaryHttp(
        PrimaryEnvironmentHttpClient.pipe(
          Effect.flatMap((client) =>
            client.relewise.moveTrelloCard({
              headers: {},
              payload: { cardId: card.id, listId, userEmail },
            }),
          ),
        ),
      );
      onCardsUpdated(result.cards);
    } catch (error) {
      failed("Could not move Trello card", error);
    } finally {
      setMutation(null);
    }
  };

  const openLabelPicker = () => {
    if (card === null) return;
    setDraftLabelIds(new Set(card.labels.map(({ id }) => id)));
    setLabelPickerOpen(true);
  };

  const saveLabels = async () => {
    if (card === null || mutation !== null || !canEdit()) return;
    const current = new Set(card.labels.map(({ id }) => id));
    const labelIdsToAdd = [...draftLabelIds].filter((id) => !current.has(id));
    const labelIdsToRemove = [...current].filter((id) => !draftLabelIds.has(id));
    if (labelIdsToAdd.length === 0 && labelIdsToRemove.length === 0) {
      setLabelPickerOpen(false);
      return;
    }
    setMutation("labels");
    try {
      const result = await runPrimaryHttp(
        PrimaryEnvironmentHttpClient.pipe(
          Effect.flatMap((client) =>
            client.relewise.updateTrelloCardLabels({
              headers: {},
              payload: {
                cardId: card.id,
                labelIdsToAdd,
                labelIdsToRemove,
                userEmail,
              },
            }),
          ),
        ),
      );
      onCardsUpdated(result.cards);
      setLabelPickerOpen(false);
    } catch (error) {
      failed("Could not update Trello labels", error);
    } finally {
      setMutation(null);
    }
  };

  const toggleItem = async (itemId: string, isComplete: boolean) => {
    if (card === null || mutation !== null || !canEdit()) return;
    setMutation("checklist");
    setUpdatingItemId(itemId);
    try {
      const result = await runPrimaryHttp(
        PrimaryEnvironmentHttpClient.pipe(
          Effect.flatMap((client) =>
            client.relewise.updateTrelloChecklistItem({
              headers: {},
              payload: { cardId: card.id, checklistItemId: itemId, isComplete, userEmail },
            }),
          ),
        ),
      );
      onCardsUpdated(result.cards);
    } catch (error) {
      failed("Could not update checklist item", error);
    } finally {
      setUpdatingItemId(null);
      setMutation(null);
    }
  };

  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent className="h-[75vh] max-h-[75vh] w-[min(900px,90vw)] max-w-[90vw]">
        <DialogHeader>
          <DialogTitle>{card?.title}</DialogTitle>
          <DialogDescription>{card?.boardName ?? "Trello card"}</DialogDescription>
          {card ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {card.labels.map((label) => (
                <Badge
                  key={label.id}
                  render={<button type="button" onClick={openLabelPicker} />}
                  className="border-0"
                  style={{
                    backgroundColor: label.backgroundColor ?? undefined,
                    color: label.textColor ?? undefined,
                  }}
                >
                  {label.name}
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Edit labels"
                onClick={openLabelPicker}
              >
                <PlusIcon />
              </Button>
            </div>
          ) : null}
        </DialogHeader>
        {card ? (
          <DialogPanel className="space-y-6">
            <div className="grid gap-4 border-b pb-5 sm:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-muted-foreground">Current list</div>
                  <div className="mt-1 truncate text-sm">{card.listName}</div>
                </div>
                <Popover open={moveMenuOpen} onOpenChange={setMoveMenuOpen}>
                  <PopoverTrigger
                    render={
                      <Button variant="outline" disabled={options === null || mutation !== null} />
                    }
                  >
                    <MoveRightIcon />
                    {mutation === "list" ? "Moving…" : "Move card"}
                  </PopoverTrigger>
                  <PopoverPopup align="start" className="w-64" viewportClassName="p-1">
                    {options?.lists
                      .filter((list) => list.id !== card.listId)
                      .map((list) => (
                        <button
                          key={list.id}
                          type="button"
                          className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                          onClick={() => {
                            setMoveMenuOpen(false);
                            void moveCard(list.id);
                          }}
                        >
                          {list.name}
                        </button>
                      ))}
                  </PopoverPopup>
                </Popover>
              </div>
              <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{new Date(card.createdAt).toLocaleString()}</dd>
                {card.startAt ? (
                  <>
                    <dt className="text-muted-foreground">Started</dt>
                    <dd>{new Date(card.startAt).toLocaleString()}</dd>
                  </>
                ) : null}
                {card.dueAt ? (
                  <>
                    <dt className="text-muted-foreground">Due</dt>
                    <dd>{new Date(card.dueAt).toLocaleString()}</dd>
                  </>
                ) : null}
              </dl>
            </div>
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Description</h3>
              <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm leading-relaxed">
                {card.description?.trim() || "No description provided."}
              </p>
            </section>
            {card.checklists.map((checklist) => {
              const complete = checklist.items.filter((item) => item.isComplete).length;
              const progress =
                checklist.items.length === 0
                  ? 0
                  : Math.round((complete / checklist.items.length) * 100);
              return (
                <section key={checklist.id} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{checklist.name}</h3>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {progress}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                  </div>
                  <ul className="space-y-1">
                    {checklist.items.map((item) => (
                      <li key={item.id}>
                        <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50">
                          <Checkbox
                            className="mt-0.5"
                            checked={item.isComplete}
                            disabled={mutation !== null}
                            aria-label={`${item.isComplete ? "Mark incomplete" : "Mark complete"}: ${item.name}`}
                            onCheckedChange={(checked) =>
                              void toggleItem(item.id, checked === true)
                            }
                          />
                          <span
                            className={
                              item.isComplete ? "text-muted-foreground line-through" : undefined
                            }
                          >
                            {item.name}
                            {updatingItemId === item.id ? " (saving…)" : ""}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {card.isBlocked ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <span className="font-medium text-destructive">Blocked: </span>
                {card.blockedReason ?? "No reason provided"}
              </div>
            ) : null}
          </DialogPanel>
        ) : null}
        <DialogFooter className="justify-between sm:justify-between">
          <Button
            variant="destructive"
            onClick={() => void archiveCard()}
            disabled={mutation !== null}
          >
            <ArchiveIcon />
            {mutation === "archive" ? "Archiving…" : "Archive card"}
          </Button>
          <div className="flex items-center gap-2">
            {card ? (
              <Button
                variant="outline"
                render={<a href={card.url} target="_blank" rel="noreferrer" />}
              >
                <ExternalLinkIcon />
                Open in Trello
              </Button>
            ) : null}
            {footer}
          </div>
        </DialogFooter>
      </DialogContent>
      <Dialog open={labelPickerOpen} onOpenChange={setLabelPickerOpen}>
        <DialogContent className="w-[min(480px,90vw)] max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>Edit labels</DialogTitle>
            <DialogDescription>Add or remove labels from “{card?.title}”.</DialogDescription>
          </DialogHeader>
          <DialogPanel className="max-h-[50vh] space-y-1">
            {options ? (
              options.labels.map((label) => (
                <label
                  key={label.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={draftLabelIds.has(label.id)}
                    disabled={mutation !== null}
                    onCheckedChange={(checked) =>
                      setDraftLabelIds((current) => {
                        const next = new Set(current);
                        if (checked === true) next.add(label.id);
                        else next.delete(label.id);
                        return next;
                      })
                    }
                  />
                  <span
                    className="size-4 shrink-0 rounded-sm"
                    style={{ backgroundColor: label.backgroundColor ?? undefined }}
                  />
                  <span className="min-w-0 truncate text-sm">{label.name}</span>
                </label>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {optionsFailed ? "Labels could not be loaded." : "Loading labels…"}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLabelPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveLabels()}
              disabled={options === null || mutation !== null}
            >
              {mutation === "labels" ? "Saving…" : "Save labels"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
