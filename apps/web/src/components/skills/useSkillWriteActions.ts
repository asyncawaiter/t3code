import { useCallback } from "react";
import type { EnvironmentId, ProviderInstanceId, SkillFile } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";

import { useAtomCommand } from "../../state/use-atom-command";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { removeSkill, restoreSkill, skillBundle, writeSkill } from "../../state/skills";
import { stackedThreadToast, toastManager } from "../ui/toast";

export interface SkillInstallTarget {
  environmentId: EnvironmentId;
  instanceId: ProviderInstanceId;
}

function errorDetail(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "reason" in error && "detail" in error) {
    const detail = (error as { reason: string; detail: string }).reason;
    if (detail === "conflict") return "Changed on the device, refresh and try again.";
    return (error as { detail: string }).detail || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

/**
 * Reads a skill bundle from a source environment and writes it to a target, then shows an
 * undo toast on success. Both source and target reads/writes are one-shot: no atom stays
 * subscribed after the action settles.
 */
export function useSkillWriteActions() {
  const fetchBundle = useAtomQueryRunner(skillBundle, { label: "skills:read-bundle" });
  const write = useAtomCommand(writeSkill, { reportFailure: false });
  const remove = useAtomCommand(removeSkill, { reportFailure: false });
  const restore = useAtomCommand(restoreSkill, { reportFailure: false });

  const installOrUpdate = useCallback(
    async (input: {
      source: SkillInstallTarget;
      target: SkillInstallTarget;
      name: string;
      expectedHash: string | null;
      onRefreshTarget: () => void;
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const bundleResult = await fetchBundle({
        environmentId: input.source.environmentId,
        input: { instanceId: input.source.instanceId, name: input.name },
      });
      if (bundleResult._tag === "Failure") {
        if (isAtomCommandInterrupted(bundleResult)) return { ok: false, message: "Cancelled." };
        return {
          ok: false,
          message: errorDetail(
            squashAtomCommandFailure(bundleResult),
            "Could not read the source skill.",
          ),
        };
      }

      const files: SkillFile[] = bundleResult.value.files.map((file) => ({
        path: file.path,
        encoding: file.encoding,
        content: file.content,
      }));

      const writeResult = await write({
        environmentId: input.target.environmentId,
        input: {
          instanceId: input.target.instanceId,
          name: input.name,
          files,
          expectedHash: input.expectedHash,
        },
      });
      if (writeResult._tag === "Failure") {
        if (isAtomCommandInterrupted(writeResult)) return { ok: false, message: "Cancelled." };
        return {
          ok: false,
          message: errorDetail(
            squashAtomCommandFailure(writeResult),
            "Could not install the skill.",
          ),
        };
      }

      const { install, backup } = writeResult.value;
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: input.expectedHash ? `Updated ${input.name}` : `Installed ${input.name}`,
          timeout: 6_000,
          actionProps: {
            children: "Undo",
            onClick: () => {
              void (async () => {
                const undoResult = backup
                  ? await restore({
                      environmentId: input.target.environmentId,
                      input: { backupId: backup.id },
                    })
                  : install.hash !== null
                    ? await remove({
                        environmentId: input.target.environmentId,
                        input: {
                          instanceId: input.target.instanceId,
                          name: input.name,
                          expectedHash: install.hash,
                        },
                      })
                    : { _tag: "Failure" as const };
                if (undoResult._tag === "Failure") {
                  toastManager.add(
                    stackedThreadToast({
                      type: "error",
                      title: `Could not undo ${input.name}`,
                      timeout: 6_000,
                    }),
                  );
                }
                input.onRefreshTarget();
              })();
            },
          },
        }),
      );
      input.onRefreshTarget();
      return { ok: true };
    },
    [fetchBundle, write, restore, remove],
  );

  const removeInstall = useCallback(
    async (input: {
      target: SkillInstallTarget;
      name: string;
      expectedHash: string;
      onRefreshTarget: () => void;
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const result = await remove({
        environmentId: input.target.environmentId,
        input: {
          instanceId: input.target.instanceId,
          name: input.name,
          expectedHash: input.expectedHash,
        },
      });
      if (result._tag === "Failure") {
        if (isAtomCommandInterrupted(result)) return { ok: false, message: "Cancelled." };
        return {
          ok: false,
          message: errorDetail(squashAtomCommandFailure(result), "Could not remove the skill."),
        };
      }
      const { backup } = result.value;
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: `Removed ${input.name}`,
          timeout: 6_000,
          actionProps: {
            children: "Undo",
            onClick: () => {
              void restore({
                environmentId: input.target.environmentId,
                input: { backupId: backup.id },
              }).then((undoResult) => {
                if (undoResult._tag === "Failure") {
                  toastManager.add(
                    stackedThreadToast({
                      type: "error",
                      title: `Could not undo removing ${input.name}`,
                      timeout: 6_000,
                    }),
                  );
                }
                input.onRefreshTarget();
              });
            },
          },
        }),
      );
      input.onRefreshTarget();
      return { ok: true };
    },
    [remove, restore],
  );

  const restoreBackup = useCallback(
    async (input: {
      environmentId: EnvironmentId;
      backupId: string;
      onRefreshTarget: () => void;
    }) => {
      const result = await restore({
        environmentId: input.environmentId,
        input: { backupId: input.backupId },
      });
      if (result._tag === "Failure") {
        if (isAtomCommandInterrupted(result)) return { ok: false as const, message: "Cancelled." };
        return {
          ok: false as const,
          message: errorDetail(squashAtomCommandFailure(result), "Could not restore the backup."),
        };
      }
      input.onRefreshTarget();
      return { ok: true as const };
    },
    [restore],
  );

  return { installOrUpdate, removeInstall, restoreBackup };
}
