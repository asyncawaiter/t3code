import { useMemo, useState, type ComponentProps } from "react";
import type { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useEnvironmentQuery } from "../../state/query";
import { skillBundle } from "../../state/skills";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import ChatMarkdown from "../ChatMarkdown";
import {
  dedupeWriteTargets,
  diffBundleFiles,
  parseSkillMd,
  type SkillCellStatus,
  type SkillGroup,
  type SkillTarget,
} from "./skillsModel";
import type { SkillActionRequest } from "./SkillActionDialog";

const CELL_LABEL: Record<SkillCellStatus, string> = {
  "in-sync": "In sync",
  drift: "Drifted from the primary variant",
  missing: "Not installed here",
  unsupported: "This provider can't take file-based skills",
  offline: "Device offline, last state unknown",
  readonly: "Read-only install (not personal)",
};

const CELL_COLOR: Record<SkillCellStatus, string> = {
  "in-sync": "bg-success",
  drift: "bg-warning",
  missing: "bg-muted-foreground/30",
  unsupported: "bg-muted-foreground/10",
  offline: "bg-muted-foreground/10",
  readonly: "bg-info",
};

/** A skill/update/remove action button, disabled with an explanatory tooltip when the install has no hash (too large to hash, so there's nothing to compare against). */
function TooBigToCompareButton({
  hash,
  children,
  ...buttonProps
}: ComponentProps<typeof Button> & { hash: string | null }) {
  if (hash === null) {
    return (
      <Tooltip>
        <TooltipTrigger render={<Button {...buttonProps} disabled />}>{children}</TooltipTrigger>
        <TooltipPopup side="top">Too large to compare, manage it on the device</TooltipPopup>
      </Tooltip>
    );
  }
  return <Button {...buttonProps}>{children}</Button>;
}

export function SkillDetail({
  skill,
  targets,
  onRequestAction,
}: {
  skill: SkillGroup;
  targets: readonly SkillTarget[];
  onRequestAction: (request: SkillActionRequest) => void;
}) {
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [diffPair, setDiffPair] = useState<[string | null, string | null]>([null, null]);

  const devices = [
    ...new Map(targets.map((target) => [target.environmentId, target.envLabel])).entries(),
  ];
  const providers = [
    ...new Map(targets.map((target) => [target.instanceId, target.providerLabel])).entries(),
  ];

  const selectedCell = selectedTargetKey ? skill.cells.get(selectedTargetKey) : undefined;
  const selectedTarget = targets.find((target) => target.key === selectedTargetKey) ?? null;

  const contentBundle = useEnvironmentQuery(
    selectedCell?.install && selectedTarget
      ? skillBundle({
          environmentId: selectedTarget.environmentId,
          input: { instanceId: selectedTarget.instanceId as ProviderInstanceId, name: skill.name },
        })
      : null,
  );

  const skillMd = contentBundle.data?.files.find((file) => file.path === "SKILL.md");
  const parsed = useMemo(() => (skillMd ? parseSkillMd(skillMd.content) : null), [skillMd]);
  const selectedFile = contentBundle.data?.files.find((file) => file.path === selectedFilePath);

  const primaryInstall = skill.primaryVariant.installs[0]!;

  const missingWritableCount = [...skill.cells.values()].filter(
    (cell) => cell.status === "missing",
  ).length;
  const driftedPersonalCount = [...skill.cells.values()].filter(
    (cell) => cell.status === "drift",
  ).length;

  const syncEverywhere = () => {
    const gapTargets = [...skill.cells.entries()].flatMap(([key, cell]) => {
      const writable =
        cell.status === "missing" || (cell.status === "drift" && cell.install?.hash != null);
      if (!writable) return [];
      const target = targets.find((candidate) => candidate.key === key);
      return target?.online ? [target] : [];
    });
    const items = dedupeWriteTargets(gapTargets).map((target) => ({
      skillName: skill.name,
      source: { target: primaryInstall.target, install: primaryInstall.install },
      target,
      expectedHash: skill.cells.get(target.key)?.install?.hash ?? null,
    }));
    onRequestAction({ kind: "bulk", title: `Sync ${skill.name} everywhere`, items });
  };

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{skill.name}</h2>
            <Badge variant="outline" size="sm">
              {skill.source}
            </Badge>
          </div>
          {skill.description && (
            <p className="mt-1 text-sm text-muted-foreground">{skill.description}</p>
          )}
        </div>
        {(missingWritableCount > 0 || driftedPersonalCount > 0) && (
          <Button size="sm" disabled={!primaryInstall.target.online} onClick={syncEverywhere}>
            Sync everywhere
          </Button>
        )}
      </div>

      <div className="mb-4 overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border-b p-1.5 text-left font-medium text-muted-foreground">Device</th>
              {providers.map(([instanceId, label]) => (
                <th
                  key={instanceId}
                  className="border-b p-1.5 text-left font-medium text-muted-foreground"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map(([environmentId, envLabel]) => (
              <tr key={environmentId}>
                <td className="border-b p-1.5 font-medium">{envLabel}</td>
                {providers.map(([instanceId]) => {
                  const key = `${environmentId}:${instanceId}`;
                  const cell = skill.cells.get(key);
                  const target = targets.find((candidate) => candidate.key === key);
                  if (!cell || !target) return <td key={instanceId} className="border-b p-1.5" />;
                  return (
                    <td key={instanceId} className="border-b p-1.5">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTargetKey(key);
                                setSelectedFilePath(null);
                              }}
                              aria-label={`${envLabel} ${target.providerLabel}: ${CELL_LABEL[cell.status]}`}
                              className={`flex size-5 items-center justify-center rounded-full border ${
                                selectedTargetKey === key ? "ring-2 ring-ring" : ""
                              }`}
                            />
                          }
                        >
                          <span className={`size-2.5 rounded-full ${CELL_COLOR[cell.status]}`} />
                        </TooltipTrigger>
                        <TooltipPopup side="top">
                          <p>{CELL_LABEL[cell.status]}</p>
                          {cell.install && (
                            <p className="text-muted-foreground">{cell.install.path}</p>
                          )}
                          {cell.install?.modifiedAt && (
                            <p className="text-muted-foreground">
                              {formatRelativeTimeLabel(cell.install.modifiedAt)}
                            </p>
                          )}
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

      {selectedTarget && (
        <div className="mb-4 flex items-center gap-2">
          {selectedCell?.status === "missing" && (
            <Button
              size="sm"
              onClick={() =>
                onRequestAction({
                  kind: "install",
                  skillName: skill.name,
                  source: { target: primaryInstall.target, install: primaryInstall.install },
                  target: selectedTarget,
                  expectedHash: null,
                })
              }
            >
              Install here
            </Button>
          )}
          {selectedCell?.status === "drift" && selectedCell.install?.source === "personal" && (
            <TooBigToCompareButton
              hash={selectedCell.install.hash}
              size="sm"
              onClick={() =>
                onRequestAction({
                  kind: "update",
                  skillName: skill.name,
                  source: { target: primaryInstall.target, install: primaryInstall.install },
                  target: selectedTarget,
                  expectedHash: selectedCell.install!.hash,
                })
              }
            >
              Update to primary variant
            </TooBigToCompareButton>
          )}
          {selectedCell?.install?.source === "personal" && (
            <TooBigToCompareButton
              hash={selectedCell.install.hash}
              size="sm"
              variant="outline"
              onClick={() =>
                onRequestAction({
                  kind: "remove",
                  skillName: skill.name,
                  target: selectedTarget,
                  install: selectedCell.install!,
                })
              }
            >
              Remove
            </TooBigToCompareButton>
          )}
        </div>
      )}

      {contentBundle.data && parsed && (
        <div className="mb-4 flex flex-col gap-2">
          {Object.keys(parsed.frontmatter).length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              {Object.entries(parsed.frontmatter).map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="truncate">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {!selectedFilePath && <ChatMarkdown text={parsed.body} cwd={undefined} />}
          <div className="flex flex-wrap gap-1">
            {contentBundle.data.files.map((file) => (
              <Button
                key={file.path}
                size="xs"
                variant={selectedFilePath === file.path ? "secondary" : "ghost"}
                onClick={() =>
                  setSelectedFilePath(selectedFilePath === file.path ? null : file.path)
                }
              >
                {file.path}
              </Button>
            ))}
          </div>
          {selectedFile && selectedFile.path !== "SKILL.md" && (
            <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">
              <code>
                {selectedFile.encoding === "utf8" ? selectedFile.content : "(binary file)"}
              </code>
            </pre>
          )}
        </div>
      )}

      <SkillVariantsPanel skill={skill} diffPair={diffPair} onDiffPairChange={setDiffPair} />
    </div>
  );
}

function SkillVariantsPanel({
  skill,
  diffPair,
  onDiffPairChange,
}: {
  skill: SkillGroup;
  diffPair: [string | null, string | null];
  onDiffPairChange: (pair: [string | null, string | null]) => void;
}) {
  const totalInstalls = skill.variants.reduce((sum, variant) => sum + variant.installs.length, 0);
  const variantKey = (hash: string | null, index: number) => hash ?? `unreadable:${index}`;

  const bundleA = useVariantBundle(skill, diffPair[0]);
  const bundleB = useVariantBundle(skill, diffPair[1]);
  const diff =
    bundleA.data && bundleB.data ? diffBundleFiles(bundleA.data.files, bundleB.data.files) : null;

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">
        {skill.variants.length} variant{skill.variants.length === 1 ? "" : "s"} across{" "}
        {totalInstalls} install
        {totalInstalls === 1 ? "" : "s"}
      </p>
      <ul className="flex flex-col gap-1">
        {skill.variants.map((variant, index) => {
          const key = variantKey(variant.hash, index);
          return (
            <li key={key} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5">
                {variant === skill.primaryVariant && <CheckIcon className="size-3 text-success" />}
                {variant.hash === null && <TriangleAlertIcon className="size-3 text-warning" />}
                {variant.installs
                  .map((entry) => `${entry.target.envLabel} · ${entry.target.providerLabel}`)
                  .join(", ")}
              </span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  aria-label={`Diff variant ${key}`}
                  checked={diffPair.includes(key)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      onDiffPairChange([diffPair[1], key]);
                    } else {
                      onDiffPairChange(
                        diffPair.map((entry) => (entry === key ? null : entry)) as [
                          string | null,
                          string | null,
                        ],
                      );
                    }
                  }}
                />
              </label>
            </li>
          );
        })}
      </ul>
      {diff && (
        <div className="rounded-md border p-2 text-xs">
          {diff.map((entry) => (
            <div key={entry.path} className="mb-1">
              <p className="font-mono font-medium">
                {entry.kind === "added" && `+ ${entry.path}`}
                {entry.kind === "removed" && `- ${entry.path}`}
                {entry.kind === "changed" && `~ ${entry.path}`}
                {entry.kind === "unchanged" && entry.path}
              </p>
              {entry.kind === "changed" && (
                <pre className="overflow-x-auto bg-muted p-1">
                  {entry.lines
                    .filter((line) => line.kind !== "equal")
                    .map((line) => (
                      <div
                        key={line.kind === "delete" ? `-${line.oldLine}` : `+${line.newLine}`}
                        className={
                          line.kind === "delete"
                            ? "text-destructive-foreground"
                            : "text-success-foreground"
                        }
                      >
                        {line.kind === "delete" ? "- " : "+ "}
                        {line.kind === "delete" ? line.oldLine : line.newLine}
                      </div>
                    ))}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useVariantBundle(skill: SkillGroup, key: string | null) {
  const variant = skill.variants.find(
    (candidate, index) => (candidate.hash ?? `unreadable:${index}`) === key,
  );
  const install = variant?.installs[0];
  return useEnvironmentQuery(
    install
      ? skillBundle({
          environmentId: install.target.environmentId as EnvironmentId,
          input: { instanceId: install.target.instanceId as ProviderInstanceId, name: skill.name },
        })
      : null,
  );
}

export const skillCellLabels = CELL_LABEL;
