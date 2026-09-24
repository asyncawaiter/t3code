import type { EnvironmentId } from "@t3tools/contracts";
import { HistoryIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import type { SkillEnvironmentInput } from "./skillsModel";
import { useSkillWriteActions } from "./useSkillWriteActions";

const REASON_LABEL = { update: "Replaced", remove: "Removed" } as const;

/** Recent replaced or removed copies across devices, each restorable in one click. */
export function SkillBackupsMenu({
  environments,
  onRefreshEnvironment,
}: {
  environments: readonly SkillEnvironmentInput[];
  onRefreshEnvironment: (environmentId: EnvironmentId) => void;
}) {
  const { restoreBackup } = useSkillWriteActions();
  const entries = environments.flatMap((env) =>
    (env.inventory?.backups ?? []).map((backup) => ({ env, backup })),
  );
  if (entries.length === 0) return null;
  const recent = entries
    .toSorted((a, b) => b.backup.createdAt.localeCompare(a.backup.createdAt))
    .slice(0, 20);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="icon-xs" variant="ghost-muted" aria-label="Recently changed skills" />
        }
      >
        <HistoryIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-80">
        <PopoverTitle className="mb-2 text-[15px]">Recently changed</PopoverTitle>
        <ul className="-mx-1 flex max-h-80 flex-col overflow-y-auto">
          {recent.map(({ env, backup }) => (
            <li
              key={`${env.environmentId}:${backup.id}`}
              className="flex items-center gap-3 rounded-md px-1 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{backup.name}</p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {REASON_LABEL[backup.reason]} on {env.label} ·{" "}
                  {formatRelativeTimeLabel(backup.createdAt)}
                </p>
              </div>
              <Button
                size="xs"
                variant="outline"
                disabled={!env.online}
                onClick={() =>
                  void restoreBackup({
                    environmentId: env.environmentId,
                    backupId: backup.id,
                    onRefreshTarget: () => onRefreshEnvironment(env.environmentId),
                  })
                }
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      </PopoverPopup>
    </Popover>
  );
}
