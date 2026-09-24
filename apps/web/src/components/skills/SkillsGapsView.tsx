import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { SkillGroup, SkillTarget } from "./skillsModel";
import type { SkillActionRequest } from "./SkillActionDialog";

const CELL_COLOR: Record<string, string> = {
  "in-sync": "bg-success",
  drift: "bg-warning",
  missing: "bg-muted-foreground/30",
  unsupported: "bg-muted-foreground/10",
  offline: "bg-muted-foreground/10",
  readonly: "bg-info",
};

/** Skills-with-gaps-or-drift x targets matrix, grouped by device, with a fill-gaps action per column. */
export function SkillsGapsView({
  groups,
  targets,
  onSelectSkill,
  onRequestAction,
}: {
  groups: readonly SkillGroup[];
  targets: readonly SkillTarget[];
  onSelectSkill: (name: string) => void;
  onRequestAction: (request: SkillActionRequest) => void;
}) {
  const gapSkills = groups.filter((group) => group.status === "gaps" || group.status === "drift");
  const devices = [
    ...new Map(targets.map((target) => [target.environmentId, target.envLabel])).entries(),
  ];

  const fillGapsForTarget = (target: SkillTarget) => {
    const items = gapSkills.flatMap((group) => {
      const cell = group.cells.get(target.key);
      const writable =
        cell?.status === "missing" || (cell?.status === "drift" && cell.install?.hash != null);
      const primaryInstall = group.primaryVariant.installs[0]!;
      if (!writable || !primaryInstall.target.online) return [];
      return [
        {
          skillName: group.name,
          source: { target: primaryInstall.target, install: primaryInstall.install },
          target,
          expectedHash: cell?.install?.hash ?? null,
        },
      ];
    });
    if (items.length === 0) return;
    onRequestAction({
      kind: "bulk",
      title: `Fill gaps on ${target.envLabel} · ${target.providerLabel}`,
      items,
    });
  };

  if (gapSkills.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">No gaps or drift across your devices.</p>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border-b p-1.5 text-left font-medium text-muted-foreground">Skill</th>
            {devices.map(([environmentId, envLabel]) => {
              const deviceTargets = targets.filter(
                (target) => target.environmentId === environmentId,
              );
              return (
                <th
                  key={environmentId}
                  colSpan={deviceTargets.length}
                  className="border-b p-1.5 text-left"
                >
                  <div className="mb-1 font-medium">{envLabel}</div>
                  <div className="flex flex-wrap gap-1">
                    {deviceTargets.map((target) => (
                      <Button
                        key={target.key}
                        size="xs"
                        variant="ghost"
                        disabled={!target.online}
                        onClick={() => fillGapsForTarget(target)}
                      >
                        Fill {target.providerLabel}
                      </Button>
                    ))}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {gapSkills.map((group) => (
            <tr key={group.name}>
              <td className="border-b p-1.5">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-left hover:underline"
                  onClick={() => onSelectSkill(group.name)}
                >
                  <span className="truncate font-medium">{group.name}</span>
                  <Badge variant={group.status === "gaps" ? "error" : "warning"} size="sm">
                    {group.coverage.installed}/{group.coverage.expected}
                  </Badge>
                </button>
              </td>
              {targets.map((target) => {
                const cell = group.cells.get(target.key);
                if (!cell) return <td key={target.key} className="border-b p-1.5" />;
                return (
                  <td key={target.key} className="border-b p-1.5">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            className={`inline-block size-2.5 rounded-full ${CELL_COLOR[cell.status]}`}
                          />
                        }
                      />
                      <TooltipPopup side="top">
                        {target.envLabel} · {target.providerLabel}: {cell.status}
                      </TooltipPopup>
                    </Tooltip>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
