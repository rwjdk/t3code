import type { RelewiseBacklogCard } from "@t3tools/contracts";
import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../ui/dialog";

export function RelewiseCardDetailsDialog(props: {
  card: RelewiseBacklogCard | null;
  onOpenChange: (open: boolean) => void;
  footer?: ReactNode;
}) {
  const { card, footer, onOpenChange } = props;

  return (
    <Dialog open={card !== null} onOpenChange={onOpenChange}>
      <DialogContent className="h-[50vh] max-h-[50vh] w-[75vw] max-w-[75vw]">
        <DialogHeader>
          <DialogTitle>{card?.title}</DialogTitle>
          <DialogDescription>
            {card ? `${card.boardName} · ${card.listName}` : "Trello card"}
          </DialogDescription>
        </DialogHeader>
        {card ? (
          <DialogPanel className="space-y-4">
            {card.labels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {card.labels.map((label) => (
                  <span
                    key={label.id}
                    className="rounded px-2 py-1 text-xs"
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
              </div>
            ) : null}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {card.description?.trim() || "No description provided."}
            </p>
            {card.checklists.map((checklist) => {
              const completedCount = checklist.items.filter((item) => item.isComplete).length;
              return (
                <section key={checklist.id} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="text-sm font-medium">{checklist.name}</h3>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {completedCount}/{checklist.items.length}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {checklist.items.map((item) => (
                      <li key={item.id} className="flex items-start gap-2 text-sm">
                        <span
                          className={
                            item.isComplete
                              ? "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground"
                              : "mt-0.5 size-4 shrink-0 rounded-sm border border-muted-foreground/50"
                          }
                          aria-label={item.isComplete ? "Complete" : "Incomplete"}
                        >
                          {item.isComplete ? <CheckIcon className="size-3" /> : null}
                        </span>
                        <span
                          className={
                            item.isComplete ? "text-muted-foreground line-through" : undefined
                          }
                        >
                          {item.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
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
              {card.isBlocked ? (
                <>
                  <dt className="text-destructive">Blocked</dt>
                  <dd>{card.blockedReason ?? "Yes"}</dd>
                </>
              ) : null}
            </dl>
          </DialogPanel>
        ) : null}
        {footer === undefined ? null : <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
