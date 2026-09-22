import { useNavigate, useLocation } from "@tanstack/react-router";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { buildReviewDashboard, flattenBoardEntries } from "./DashboardPage.logic";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useWorkflowState } from "../../workflowState";
import { useThreadShells } from "../../state/entities";
import { useWorkflowNavigation } from "../../hooks/useWorkflowNavigation";
import { Button } from "../ui/button";

export function DashboardReviewBar({
  thread,
}: {
  thread: Pick<EnvironmentThreadShell, "id" | "environmentId" | "latestTurn">;
}) {
  const workflow = useWorkflowState();
  const threads = useThreadShells();
  const openThread = useWorkflowNavigation();
  const navigate = useNavigate();
  const dashboardReturn = useLocation({ select: (location) => location.state.dashboardReturn });
  const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
  const inQueue = workflow.triageQueue.includes(key);
  const shell = threads.find(
    (item) => item.environmentId === thread.environmentId && item.id === thread.id,
  );
  const completion =
    shell &&
    !shell.hasPendingApprovals &&
    !shell.hasPendingUserInput &&
    !shell.hasActionableProposedPlan &&
    thread.latestTurn?.state === "completed"
      ? thread.latestTurn.completedAt
      : null;
  if (!inQueue && !completion) return null;
  const actionable = new Set(
    flattenBoardEntries(buildReviewDashboard(threads, new Date().toISOString(), workflow.kept))
      .filter(
        (entry) =>
          entry.lane === "needs-you" ||
          (entry.lane === "done" &&
            workflow.reviewed[
              scopedThreadKey(scopeThreadRef(entry.shell.environmentId, entry.shell.id))
            ] !== entry.since),
      )
      .map((entry) => scopedThreadKey(scopeThreadRef(entry.shell.environmentId, entry.shell.id))),
  );
  const remaining = workflow.triageQueue.filter(
    (candidate) => candidate !== key && actionable.has(candidate),
  );
  const index = workflow.triageQueue.indexOf(key);
  const next = remaining.find((item) => workflow.triageQueue.indexOf(item) > index) ?? remaining[0];
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/50 px-4 py-1.5 text-xs text-muted-foreground"
      aria-label="Dashboard review"
    >
      {inQueue && !dashboardReturn ? (
        <Button
          size="micro"
          variant="ghost-muted"
          onClick={() => {
            void (workflow.triageScoped
              ? navigate({
                  to: "/spaces/$profileId",
                  params: { profileId: workflow.triageProfileId ?? "all" },
                  search: {
                    space: workflow.triageSpaceId,
                    unsorted: workflow.triageUnsorted ?? false,
                  },
                })
              : navigate({ to: "/dashboard" }));
          }}
        >
          Back to dashboard
        </Button>
      ) : null}
      {completion ? (
        <>
          <Button
            size="micro"
            variant="ghost-muted"
            disabled={workflow.kept[key] === completion}
            onClick={() => workflow.review(key, completion, true)}
          >
            {workflow.kept[key] === completion ? "Kept for review" : "Keep for review"}
          </Button>
          <Button
            size="micro"
            variant="ghost-muted"
            disabled={workflow.reviewed[key] === completion}
            onClick={() => workflow.review(key, completion, false)}
          >
            {workflow.reviewed[key] === completion ? "Reviewed" : "Mark reviewed"}
          </Button>
        </>
      ) : null}
      {inQueue ? (
        <Button
          className="ml-auto"
          size="micro"
          variant="outline"
          disabled={!next}
          onClick={() => {
            if (next) openThread(next);
          }}
        >
          Next item{remaining.length ? ` (${remaining.length})` : ""}
        </Button>
      ) : null}
    </div>
  );
}
