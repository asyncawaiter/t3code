import { useState } from "react";
import type { EnvironmentId, SkillBackup } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "../ui/collapsible";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { useSkillWriteActions } from "./useSkillWriteActions";

/** Recent skill backups for one environment, each restorable in one click. */
export function SkillBackupsPanel({
  environmentId,
  backups,
  onRefreshEnvironment,
}: {
  environmentId: EnvironmentId;
  backups: readonly SkillBackup[];
  onRefreshEnvironment: (environmentId: EnvironmentId) => void;
}) {
  const [open, setOpen] = useState(false);
  const { restoreBackup } = useSkillWriteActions();

  if (backups.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t px-3 py-2">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ChevronRightIcon className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        Recently changed ({backups.length})
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <ul className="flex flex-col gap-1 pt-2">
          {backups.map((backup) => (
            <li key={backup.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">
                {backup.name} · {backup.reason} · {formatRelativeTimeLabel(backup.createdAt)}
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  void restoreBackup({
                    environmentId,
                    backupId: backup.id,
                    onRefreshTarget: () => onRefreshEnvironment(environmentId),
                  })
                }
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      </CollapsiblePanel>
    </Collapsible>
  );
}
