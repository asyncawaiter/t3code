import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  ApprovalRequestId,
  EnvironmentId,
  ProviderApprovalDecision,
  ProviderApprovalOption,
  ThreadId,
} from "@t3tools/contracts";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { derivePendingApprovals } from "../../session-logic";
import { useThreadDetail } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { ComposerPendingApprovalActions } from "../chat/ComposerPendingApprovalActions";

const FALLBACK_APPROVAL_OPTIONS = [
  { decision: "decline", label: "Deny" },
  { decision: "accept", label: "Approve" },
] satisfies ReadonlyArray<ProviderApprovalOption>;

/**
 * Approve/Deny for the first pending approval on one thread. Only mounted
 * after the user clicks "Respond", so thread detail (activities) is fetched
 * on demand rather than subscribed live for every pending-approval card.
 */
export function DashboardApprovalActions({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!expanded) {
    return (
      <Button size="micro" variant="ghost-muted" onClick={() => setExpanded(true)}>
        Respond
      </Button>
    );
  }
  return <DashboardApprovalDetail environmentId={environmentId} threadId={threadId} />;
}

function DashboardApprovalDetail({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const navigate = useNavigate();
  const detail = useThreadDetail(scopeThreadRef(environmentId, threadId));
  const respondToApproval = useAtomCommand(threadEnvironment.respondToApproval);
  const [respondedRequestId, setRespondedRequestId] = useState<ApprovalRequestId | null>(null);

  const openThread = useCallback(() => {
    void navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
  }, [environmentId, navigate, threadId]);

  const pendingApproval = useMemo(
    () => (detail ? (derivePendingApprovals(detail.activities)[0] ?? null) : null),
    [detail],
  );

  const respond = useCallback(
    async (requestId: ApprovalRequestId, decision: ProviderApprovalDecision) => {
      setRespondedRequestId(requestId);
      const result = await respondToApproval({
        environmentId,
        input: { threadId, requestId, decision },
      });
      // A failed response (reported by the runtime toast) must leave the
      // buttons usable so the user can retry or open the thread.
      if (result._tag === "Failure") setRespondedRequestId(null);
    },
    [environmentId, respondToApproval, threadId],
  );

  if (!detail || !pendingApproval) {
    return (
      <Button size="micro" variant="ghost-muted" onClick={openThread}>
        Open
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {pendingApproval.detail ? (
        <span className="max-w-48 truncate text-xs text-muted-foreground/80">
          {pendingApproval.detail}
        </span>
      ) : null}
      <ComposerPendingApprovalActions
        requestId={pendingApproval.requestId}
        isResponding={respondedRequestId === pendingApproval.requestId}
        options={pendingApproval.options ?? FALLBACK_APPROVAL_OPTIONS}
        onRespondToApproval={respond}
      />
    </div>
  );
}
