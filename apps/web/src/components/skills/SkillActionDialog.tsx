import { useState } from "react";
import type { EnvironmentId, ProviderInstanceId, SkillInstall } from "@t3tools/contracts";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { useEnvironmentQuery } from "../../state/query";
import { skillBundle } from "../../state/skills";
import { diffBundleFiles, frontmatterWarnings, type SkillTarget } from "./skillsModel";
import { useSkillWriteActions } from "./useSkillWriteActions";

export interface SkillActionEndpoint {
  target: SkillTarget;
  install: SkillInstall | null;
}

export type SkillActionRequest =
  | {
      kind: "install" | "update";
      skillName: string;
      source: SkillActionEndpoint;
      target: SkillTarget;
      expectedHash: string | null;
    }
  | { kind: "remove"; skillName: string; target: SkillTarget; install: SkillInstall }
  | {
      kind: "bulk";
      title: string;
      items: Array<{
        skillName: string;
        source: SkillActionEndpoint;
        target: SkillTarget;
        expectedHash: string | null;
      }>;
    };

function unavailableReason(
  source: SkillActionEndpoint | undefined,
  target: SkillTarget,
): string | null {
  if (source && !source.target.online) return `${source.target.envLabel} is offline.`;
  if (!target.online) return `${target.envLabel} is offline.`;
  if (!target.writable)
    return `${target.providerLabel} on ${target.envLabel} has no skills directory.`;
  return null;
}

/** Too large to hash means there's nothing to compare against, so a remove can't be confirmed safely. */
const TOO_BIG_TO_COMPARE = "Too large to compare, manage it on the device.";

export function SkillActionDialog({
  request,
  onClose,
  onRefreshEnvironment,
}: {
  request: SkillActionRequest | null;
  onClose: () => void;
  onRefreshEnvironment: (environmentId: EnvironmentId) => void;
}) {
  const { installOrUpdate, removeInstall } = useSkillWriteActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const singleRequest = request?.kind === "install" || request?.kind === "update" ? request : null;
  const sourceBundle = useEnvironmentQuery(
    singleRequest
      ? skillBundle({
          environmentId: singleRequest.source.target.environmentId,
          input: {
            instanceId: singleRequest.source.target.instanceId as ProviderInstanceId,
            name: singleRequest.skillName,
          },
        })
      : null,
  );
  const targetBundle = useEnvironmentQuery(
    request?.kind === "update"
      ? skillBundle({
          environmentId: request.target.environmentId,
          input: {
            instanceId: request.target.instanceId as ProviderInstanceId,
            name: request.skillName,
          },
        })
      : null,
  );

  if (!request) return null;

  const close = () => {
    setError(null);
    setBusy(false);
    onClose();
  };

  const runSingle = async (item: {
    skillName: string;
    source: SkillActionEndpoint;
    target: SkillTarget;
    expectedHash: string | null;
  }) => {
    return installOrUpdate({
      source: {
        environmentId: item.source.target.environmentId,
        instanceId: item.source.target.instanceId as ProviderInstanceId,
      },
      target: {
        environmentId: item.target.environmentId,
        instanceId: item.target.instanceId as ProviderInstanceId,
      },
      name: item.skillName,
      expectedHash: item.expectedHash,
      onRefreshTarget: () => onRefreshEnvironment(item.target.environmentId),
    });
  };

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      if (request.kind === "remove") {
        if (request.install.hash === null) {
          setError(TOO_BIG_TO_COMPARE);
          return;
        }
        const result = await removeInstall({
          target: {
            environmentId: request.target.environmentId,
            instanceId: request.target.instanceId as ProviderInstanceId,
          },
          name: request.skillName,
          expectedHash: request.install.hash,
          onRefreshTarget: () => onRefreshEnvironment(request.target.environmentId),
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        close();
        return;
      }
      if (request.kind === "bulk") {
        const failures: string[] = [];
        for (const item of request.items) {
          const result = await runSingle(item);
          if (!result.ok)
            failures.push(`${item.skillName} → ${item.target.envLabel}: ${result.message}`);
        }
        if (failures.length > 0) {
          setError(failures.join("\n"));
          return;
        }
        close();
        return;
      }
      const result = await runSingle(request);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
    } finally {
      setBusy(false);
    }
  };

  const blockedReason =
    request.kind === "remove"
      ? (unavailableReason(undefined, request.target) ??
        (request.install.hash === null ? TOO_BIG_TO_COMPARE : null))
      : request.kind === "bulk"
        ? (request.items.map((item) => unavailableReason(item.source, item.target)).find(Boolean) ??
          null)
        : unavailableReason(request.source, request.target);

  const sourceFile = sourceBundle.data?.files.find((file) => file.path === "SKILL.md");
  const warnings =
    request.kind !== "remove" && request.kind !== "bulk" && sourceBundle.data
      ? frontmatterWarnings(
          sourceFile?.content ?? "",
          request.target.driver,
          sourceBundle.data.files.map((file) => file.path),
        )
      : [];
  const fileDiff =
    request.kind === "update" && sourceBundle.data && targetBundle.data
      ? diffBundleFiles(targetBundle.data.files, sourceBundle.data.files)
      : null;

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {request.kind === "install" && `Install ${request.skillName}`}
            {request.kind === "update" && `Update ${request.skillName}`}
            {request.kind === "remove" && `Remove ${request.skillName}`}
            {request.kind === "bulk" && request.title}
          </DialogTitle>
          <DialogDescription>
            {request.kind === "remove"
              ? `Removes the personal copy on ${request.target.envLabel} · ${request.target.providerLabel}.`
              : request.kind === "bulk"
                ? `${request.items.length} target${request.items.length === 1 ? "" : "s"} will be updated.`
                : `${request.source.target.envLabel} · ${request.source.target.providerLabel} → ${request.target.envLabel} · ${request.target.providerLabel}`}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex max-h-96 flex-col gap-3 text-sm">
          {blockedReason && (
            <p className="flex items-center gap-1.5 rounded-md bg-warning/8 p-2 text-xs text-warning-foreground">
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              {blockedReason}
            </p>
          )}
          {request.kind === "bulk" && (
            <ul className="flex flex-col gap-1">
              {request.items.map((item) => (
                <li
                  key={`${item.skillName}:${item.target.key}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">{item.skillName}</span>
                  <Badge variant="outline" size="sm">
                    {item.target.envLabel} · {item.target.providerLabel}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {request.kind !== "bulk" && request.kind !== "remove" && sourceBundle.data && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Files</p>
              <ul className="flex flex-col gap-0.5 font-mono text-xs">
                {sourceBundle.data.files.map((file) => (
                  <li key={file.path}>{file.path}</li>
                ))}
              </ul>
            </div>
          )}
          {fileDiff && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Changes</p>
              <ul className="flex flex-col gap-0.5 font-mono text-xs">
                {fileDiff
                  .filter((entry) => entry.kind !== "unchanged")
                  .map((entry) => (
                    <li key={entry.path}>
                      {entry.kind === "added" && `+ ${entry.path}`}
                      {entry.kind === "removed" && `- ${entry.path}`}
                      {entry.kind === "changed" && `~ ${entry.path}`}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md bg-warning/8 p-2 text-xs text-warning-foreground">
              {warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-1.5">
                  <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                  {warning}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="whitespace-pre-line text-xs text-destructive-foreground">{error}</p>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={request.kind === "remove" ? "destructive" : "default"}
            onClick={() => void handleConfirm()}
            disabled={busy || !!blockedReason}
          >
            {request.kind === "install" && "Install"}
            {request.kind === "update" && "Update"}
            {request.kind === "remove" && "Remove"}
            {request.kind === "bulk" && "Apply"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
