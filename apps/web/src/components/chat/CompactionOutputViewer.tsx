import { useAtomValue } from "@effect/atom-react";
import { EventId } from "@t3tools/contracts";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useState } from "react";
import { orchestrationEnvironment } from "~/state/orchestration";
import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { Sheet, SheetPopup, SheetTitle, SheetDescription } from "../ui/sheet";

function CompactionOutput({
  threadRef,
  activityId,
}: {
  threadRef: ScopedThreadRef;
  activityId: string;
}) {
  const result = useAtomValue(
    orchestrationEnvironment.compactionOutput({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, activityId: EventId.make(activityId) },
    }),
  );
  const [query, setQuery] = useState("");
  const [copyState, setCopyState] = useState("");
  if (result._tag === "Failure")
    return (
      <p role="alert" className="p-4 text-sm">
        Could not load the summary. Reconnect to the chat's device and reopen this panel.
      </p>
    );
  if (result._tag !== "Success")
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        Loading summary...
      </p>
    );
  const output = result.value;
  const summary = output.summary;
  const pieces =
    query && summary
      ? summary.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"))
      : [];
  return (
    <>
      <div className="space-y-2 border-b px-4 pb-3 text-xs text-muted-foreground">
        <p>
          {output.provider === "claudeAgent"
            ? "Claude"
            : output.provider === "codex"
              ? "Codex"
              : output.provider}{" "}
          · {output.device}
        </p>
        <p>
          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "long" }).format(
            Date.parse(output.createdAt),
          )}
        </p>
        {output.beforeTokens !== undefined && output.afterTokens !== undefined && (
          <p>
            {output.beforeTokens.toLocaleString()} → {output.afterTokens.toLocaleString()} tokens
          </p>
        )}
      </div>
      {summary === null ? (
        <p className="p-4 text-sm text-muted-foreground">{output.reason}</p>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b p-3">
            <input
              aria-label="Search compaction summary"
              placeholder="Find in summary"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void navigator.clipboard.writeText(summary).then(
                  () => setCopyState("Copied"),
                  () => setCopyState("Copy failed"),
                )
              }
            >
              {copyState || "Copy"}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4 text-sm">
            {query ? (
              <>
                <p aria-live="polite" className="mb-3 text-xs text-muted-foreground">
                  {Math.floor(pieces.length / 2)} matches
                </p>
                <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">
                  {pieces.map((piece, index) =>
                    index % 2 ? <mark key={index}>{piece}</mark> : piece,
                  )}
                </pre>
              </>
            ) : (
              <ChatMarkdown text={summary} cwd={undefined} threadRef={threadRef} />
            )}
          </div>
        </>
      )}
    </>
  );
}

export function CompactionOutputViewer({
  threadRef,
  activityId,
  onClose,
}: {
  threadRef: ScopedThreadRef;
  activityId: string;
  onClose: () => void;
}) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetPopup side="right" className="flex w-full flex-col sm:max-w-xl">
        <div className="px-4 pt-4 pb-3 pr-10">
          <SheetTitle className="text-sm">Compaction summary</SheetTitle>
          <SheetDescription className="mt-1 text-xs">
            The provider's saved summary. Recent messages may also remain in context.
          </SheetDescription>
        </div>
        <CompactionOutput threadRef={threadRef} activityId={activityId} />
      </SheetPopup>
    </Sheet>
  );
}
