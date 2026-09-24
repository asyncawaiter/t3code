import { useEffect, useMemo, useState } from "react";
import type { ProviderInstanceId, SkillBundle, SkillFile } from "@t3tools/contracts";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  CopyPlusIcon,
  EllipsisIcon,
  FileIcon,
  FileTextIcon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import ChatMarkdown from "../ChatMarkdown";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Skeleton } from "../ui/skeleton";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { useEnvironmentQuery } from "../../state/query";
import { skillBundle } from "../../state/skills";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import type { SkillActionRequest } from "./SkillActionDialog";
import {
  diffBundleFiles,
  parseSkillMd,
  type BundleFileDiff,
  type SkillGroup,
  type SkillTarget,
  type SkillVariant,
} from "./skillsModel";
import {
  AvailabilityMark,
  CELL_LABEL,
  CELL_SHORT_LABEL,
  copyRequest,
  copyRequestItem,
  copySource,
  ProviderMark,
  SectionLabel,
  SOURCE_LABEL,
  targetsByDevice,
} from "./skillsUi";

type SkillTab = "overview" | "files" | "versions";

function useInstallBundle(skillName: string, target: SkillTarget | undefined) {
  return useEnvironmentQuery(
    target?.online
      ? skillBundle({
          environmentId: target.environmentId,
          input: { instanceId: target.instanceId as ProviderInstanceId, name: skillName },
        })
      : null,
  );
}

function fileBytes(file: SkillFile) {
  return file.encoding === "base64"
    ? Math.floor((file.content.length * 3) / 4)
    : new TextEncoder().encode(file.content).length;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function variantLabel(variant: SkillVariant) {
  return variant.installs
    .map((entry) => `${entry.target.envLabel} · ${entry.target.providerLabel}`)
    .join(", ");
}

/** A full page for one skill: its document, where it lives, its files, and how copies differ. */
export function SkillView({
  skill,
  targets,
  previousName,
  nextName,
  onNavigate,
  onBack,
  onRequestAction,
  dialogOpen,
}: {
  skill: SkillGroup;
  targets: readonly SkillTarget[];
  previousName: string | null;
  nextName: string | null;
  onNavigate: (name: string) => void;
  onBack: () => void;
  onRequestAction: (request: SkillActionRequest) => void;
  dialogOpen: boolean;
}) {
  const [selectedTab, setTab] = useState<SkillTab>("overview");
  const [viewedKey, setViewedKey] = useState(() => copySource(skill).target.key);
  const viewedTarget =
    targets.find((target) => target.key === viewedKey && skill.cells.get(target.key)?.install) ??
    copySource(skill).target;
  const viewedInstall = skill.cells.get(viewedTarget.key)?.install ?? null;
  const bundle = useInstallBundle(skill.name, viewedTarget);
  const devices = useMemo(() => targetsByDevice(targets), [targets]);
  const hasVersions = skill.variants.length > 1;
  const tab = selectedTab === "versions" && !hasVersions ? "overview" : selectedTab;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogOpen || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true], [role=menu]")) return;
      if (event.key === "[" && previousName) onNavigate(previousName);
      else if (event.key === "]" && nextName) onNavigate(nextName);
      else if (event.key === "Escape") onBack();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, previousName, nextName, onNavigate, onBack]);

  const copyTargets = targets.flatMap((target) => {
    const item = copyRequestItem(skill, skill.cells.get(target.key), target);
    return item ? [{ target, item }] : [];
  });

  const tabs: Array<{ value: SkillTab; label: string; count?: number }> = [
    { value: "overview", label: "Overview" },
    { value: "files", label: "Files", ...(bundle.data ? { count: bundle.data.files.length } : {}) },
    ...(hasVersions
      ? [{ value: "versions" as const, label: "Versions", count: skill.variants.length }]
      : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-8 pt-4">
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="ghost"
            onClick={onBack}
            className="-ml-2 text-muted-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Skills
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Previous skill"
                    disabled={!previousName}
                    onClick={() => previousName && onNavigate(previousName)}
                  />
                }
              >
                <ChevronLeftIcon className="size-4" />
              </TooltipTrigger>
              <TooltipPopup>
                Previous skill <Kbd>[</Kbd>
              </TooltipPopup>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Next skill"
                    disabled={!nextName}
                    onClick={() => nextName && onNavigate(nextName)}
                  />
                }
              >
                <ChevronRightIcon className="size-4" />
              </TooltipTrigger>
              <TooltipPopup>
                Next skill <Kbd>]</Kbd>
              </TooltipPopup>
            </Tooltip>
            <Menu>
              <MenuTrigger
                render={<Button size="sm" variant="outline" disabled={copyTargets.length === 0} />}
              >
                <CopyPlusIcon className="size-4" />
                Copy to
                <ChevronDownIcon className="size-3.5" />
              </MenuTrigger>
              <MenuPopup align="end" className="min-w-60">
                {copyTargets.map(({ target, item }) => (
                  <MenuItem
                    key={target.key}
                    onClick={() => {
                      const request = copyRequest(skill.name, [item]);
                      if (request) onRequestAction(request);
                    }}
                  >
                    <ProviderMark target={target} />
                    <span className="flex-1">
                      {target.envLabel} · {target.providerLabel}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {item.expectedHash ? "Update" : "Add"}
                    </span>
                  </MenuItem>
                ))}
                {copyTargets.length > 1 && (
                  <MenuItem
                    onClick={() => {
                      const request = copyRequest(
                        `Copy ${skill.name} to ${copyTargets.length} places`,
                        copyTargets.map((entry) => entry.item),
                      );
                      if (request) onRequestAction(request);
                    }}
                  >
                    <span className="flex-1 font-medium">All of the above</span>
                  </MenuItem>
                )}
              </MenuPopup>
            </Menu>
          </div>
        </div>

        <div className="mt-3 max-w-3xl">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] leading-9 font-semibold tracking-tight">{skill.name}</h1>
            <Badge variant="outline" size="default" className="text-muted-foreground">
              {SOURCE_LABEL[skill.source]}
            </Badge>
            {skill.differs && (
              <Badge variant="warning" size="default">
                Differs
              </Badge>
            )}
          </div>
          {skill.description && (
            <p className="mt-1.5 text-base leading-6 text-muted-foreground">{skill.description}</p>
          )}
        </div>

        <div role="tablist" aria-label="Skill sections" className="mt-5 flex gap-6">
          {tabs.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="tab"
              aria-selected={tab === entry.value}
              onClick={() => setTab(entry.value)}
              className={cn(
                "-mb-px border-b-2 pb-2.5 text-[15px] transition-colors",
                tab === entry.value
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
              {entry.count !== undefined && (
                <span className="ml-1.5 text-muted-foreground tabular-nums">{entry.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "overview" && (
          <div className="mx-auto grid max-w-6xl gap-12 px-8 py-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <SkillDocument bundle={bundle.data} offline={!viewedTarget.online} />
            <aside className="flex flex-col gap-5 lg:sticky lg:top-8 lg:self-start">
              <section className="surface-raised-sm rounded-xl p-4">
                <SectionLabel className="mb-3">Availability</SectionLabel>
                <div className="flex flex-col gap-4">
                  {devices.map((device) => (
                    <div key={device.environmentId}>
                      <p className="mb-1 text-sm font-medium">
                        {device.label}
                        {!device.online && (
                          <span className="ml-1.5 font-normal text-muted-foreground">offline</span>
                        )}
                      </p>
                      <ul className="flex flex-col">
                        {device.targets.map((target) => (
                          <AvailabilityRow
                            key={target.key}
                            skill={skill}
                            target={target}
                            viewed={target.key === viewedTarget.key}
                            onView={() => setViewedKey(target.key)}
                            onRequestAction={onRequestAction}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
              <SkillDetails
                bundle={bundle.data}
                path={viewedInstall?.path ?? null}
                modifiedAt={viewedInstall?.modifiedAt ?? null}
                viewedLabel={`${viewedTarget.envLabel} · ${viewedTarget.providerLabel}`}
              />
            </aside>
          </div>
        )}
        {tab === "files" && (
          <SkillFiles
            bundle={bundle.data}
            loading={bundle.isPending}
            offline={!viewedTarget.online}
          />
        )}
        {tab === "versions" && hasVersions && <SkillVersions skill={skill} />}
      </div>
    </div>
  );
}

function SkillDocument({ bundle, offline }: { bundle: SkillBundle | null; offline: boolean }) {
  const skillMd = bundle?.files.find((file) => file.path === "SKILL.md");
  const parsed = useMemo(() => (skillMd ? parseSkillMd(skillMd.content) : null), [skillMd]);
  if (offline && !bundle) {
    return (
      <p className="text-[15px] text-muted-foreground">
        This copy's device is offline. Pick an installed copy on an online device to read it.
      </p>
    );
  }
  if (!parsed) {
    return (
      <div className="flex max-w-[72ch] flex-col gap-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }
  return (
    <article className="max-w-[72ch] min-w-0 text-base leading-[1.75]">
      <ChatMarkdown text={parsed.body} cwd={undefined} />
    </article>
  );
}

function AvailabilityRow({
  skill,
  target,
  viewed,
  onView,
  onRequestAction,
}: {
  skill: SkillGroup;
  target: SkillTarget;
  viewed: boolean;
  onView: () => void;
  onRequestAction: (request: SkillActionRequest) => void;
}) {
  const cell = skill.cells.get(target.key);
  if (!cell) return null;
  const copyItem = copyRequestItem(skill, cell, target);
  const install = cell.install;
  const removable = install?.source === "personal" && install.hash !== null && target.online;
  return (
    <li
      className={cn(
        "group/avail -mx-2 flex h-10 items-center gap-2.5 rounded-md px-2",
        install ? "cursor-pointer hover:bg-accent/50" : "",
        viewed && "bg-accent/70",
      )}
      onClick={install ? onView : undefined}
    >
      <ProviderMark target={target} />
      <span className="min-w-0 flex-1 truncate text-sm">{target.providerLabel}</span>
      <Tooltip>
        <TooltipTrigger
          render={<span className="flex items-center gap-1.5 text-[13px] text-muted-foreground" />}
        >
          <AvailabilityMark status={cell.status} dimmed={!target.online} className="size-3.5" />
          {CELL_SHORT_LABEL[cell.status]}
        </TooltipTrigger>
        <TooltipPopup className="max-w-72">
          <p>{CELL_LABEL[cell.status]}</p>
          {install?.modifiedAt && (
            <p className="text-muted-foreground">
              Changed {formatRelativeTimeLabel(install.modifiedAt)}
            </p>
          )}
        </TooltipPopup>
      </Tooltip>
      {copyItem ? (
        <Button
          size="xs"
          variant="outline"
          className="h-6 px-2 text-[13px]"
          onClick={(event) => {
            event.stopPropagation();
            const request = copyRequest(skill.name, [copyItem]);
            if (request) onRequestAction(request);
          }}
        >
          {copyItem.expectedHash ? "Update" : "Add"}
        </Button>
      ) : removable ? (
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`More actions for ${target.envLabel} ${target.providerLabel}`}
                className="opacity-0 group-hover/avail:opacity-100 data-popup-open:opacity-100"
                onClick={(event) => event.stopPropagation()}
              />
            }
          >
            <EllipsisIcon className="size-4" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem
              variant="destructive"
              onClick={() =>
                onRequestAction({
                  kind: "remove",
                  skillName: skill.name,
                  target,
                  install: install!,
                })
              }
            >
              Remove from {target.envLabel} · {target.providerLabel}
            </MenuItem>
          </MenuPopup>
        </Menu>
      ) : (
        <span className="w-6" />
      )}
    </li>
  );
}

function SkillDetails({
  bundle,
  path,
  modifiedAt,
  viewedLabel,
}: {
  bundle: SkillBundle | null;
  path: string | null;
  modifiedAt: string | null;
  viewedLabel: string;
}) {
  const skillMd = bundle?.files.find((file) => file.path === "SKILL.md");
  const frontmatter = useMemo(
    () =>
      Object.entries(skillMd ? parseSkillMd(skillMd.content).frontmatter : {}).filter(
        ([key]) => key !== "name" && key !== "description",
      ),
    [skillMd],
  );
  const totalBytes = bundle?.files.reduce((sum, file) => sum + fileBytes(file), 0) ?? 0;
  return (
    <section className="surface-raised-sm rounded-xl p-4">
      <SectionLabel className="mb-3">Details</SectionLabel>
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Showing</dt>
        <dd className="truncate">{viewedLabel}</dd>
        {bundle && (
          <>
            <dt className="text-muted-foreground">Files</dt>
            <dd>
              {bundle.files.length} · {formatBytes(totalBytes)}
            </dd>
          </>
        )}
        {modifiedAt && (
          <>
            <dt className="text-muted-foreground">Changed</dt>
            <dd>{formatRelativeTimeLabel(modifiedAt)}</dd>
          </>
        )}
        {frontmatter.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="truncate text-muted-foreground">{key}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {path && (
        <button
          type="button"
          onClick={() =>
            void writeTextToClipboard(path).then(
              () => toastManager.add({ type: "success", title: "Path copied" }),
              () => toastManager.add({ type: "error", title: "Could not copy path" }),
            )
          }
          className="group/path mt-3 flex w-full items-start gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-left font-mono text-[12.5px] leading-4 break-all text-muted-foreground hover:bg-muted"
        >
          <span className="flex-1">{path}</span>
          <CopyIcon className="mt-px size-3.5 shrink-0 opacity-0 group-hover/path:opacity-100" />
        </button>
      )}
    </section>
  );
}

function SkillFiles({
  bundle,
  loading,
  offline,
}: {
  bundle: SkillBundle | null;
  loading: boolean;
  offline: boolean;
}) {
  const [selectedPath, setSelectedPath] = useState("SKILL.md");
  if (!bundle) {
    return (
      <p className="px-8 py-8 text-[15px] text-muted-foreground">
        {offline ? "This copy's device is offline." : loading ? "Loading files..." : "No files."}
      </p>
    );
  }
  const file = bundle.files.find((entry) => entry.path === selectedPath) ?? bundle.files[0];
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-8 py-8 md:grid-cols-[15rem_minmax(0,1fr)]">
      <ul className="flex flex-col gap-px md:sticky md:top-8 md:self-start">
        {bundle.files.map((entry) => (
          <li key={entry.path}>
            <button
              type="button"
              onClick={() => setSelectedPath(entry.path)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                entry.path === file?.path
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {entry.path.endsWith(".md") ? (
                <FileTextIcon className="size-3.5 shrink-0" />
              ) : (
                <FileIcon className="size-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate font-mono text-[13.5px]">{entry.path}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatBytes(fileBytes(entry))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {file && <FileContent file={file} />}
    </div>
  );
}

function FileContent({ file }: { file: SkillFile }) {
  if (file.encoding === "base64") {
    return (
      <p className="text-[15px] text-muted-foreground">
        Binary file, {formatBytes(fileBytes(file))}.
      </p>
    );
  }
  if (file.path.endsWith(".md")) {
    return (
      <article className="max-w-[72ch] min-w-0 text-base leading-[1.75]">
        <ChatMarkdown
          text={file.path === "SKILL.md" ? parseSkillMd(file.content).body : file.content}
          cwd={undefined}
        />
      </article>
    );
  }
  const lines = file.content.split("\n");
  return (
    <div className="surface-raised-sm min-w-0 overflow-x-auto rounded-lg">
      <table className="w-full border-collapse font-mono text-[13.5px] leading-5">
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td className="w-10 pr-3 pl-3 text-right text-muted-foreground/60 tabular-nums select-none">
                {index + 1}
              </td>
              <td className="pr-4 whitespace-pre">{line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkillVersions({ skill }: { skill: SkillGroup }) {
  const readable = skill.variants.filter((variant) => variant.hash !== null);
  const [baseHash, setBaseHash] = useState(skill.primaryVariant.hash);
  const [compareHash, setCompareHash] = useState(
    readable.find((variant) => variant !== skill.primaryVariant)?.hash ?? null,
  );
  const base = readable.find((variant) => variant.hash === baseHash);
  const compare = readable.find((variant) => variant.hash === compareHash);
  const baseBundle = useInstallBundle(
    skill.name,
    base?.installs.find((entry) => entry.target.online)?.target,
  );
  const compareBundle = useInstallBundle(
    skill.name,
    compare?.installs.find((entry) => entry.target.online)?.target,
  );
  const diff = useMemo(
    () =>
      baseBundle.data && compareBundle.data
        ? diffBundleFiles(baseBundle.data.files, compareBundle.data.files)
        : null,
    [baseBundle.data, compareBundle.data],
  );
  const changed = diff?.filter((entry) => entry.kind !== "unchanged") ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-8 py-8">
      <section>
        <SectionLabel className="mb-3">Versions</SectionLabel>
        <ul className="grid gap-2 md:grid-cols-2">
          {skill.variants.map((variant, index) => {
            const isBase = variant.hash !== null && variant.hash === baseHash;
            const isCompare = variant.hash !== null && variant.hash === compareHash;
            return (
              <li
                key={variant.hash ?? `unreadable-${index}`}
                className={cn(
                  "flex flex-col gap-2 rounded-lg px-4 py-3",
                  isBase || isCompare ? "surface-raised-strong" : "surface-raised-sm",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {variant === skill.primaryVariant ? "Most common" : `Version ${index + 1}`}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {variant.installs.length} {variant.installs.length === 1 ? "copy" : "copies"}
                    {variant.modifiedAt &&
                      ` · changed ${formatRelativeTimeLabel(variant.modifiedAt)}`}
                  </span>
                  {variant.hash !== null && (
                    <div className="ml-auto flex gap-1">
                      <Button
                        size="xs"
                        variant={isBase ? "secondary" : "ghost"}
                        className="h-6 px-2 text-[13px]"
                        onClick={() => setBaseHash(variant.hash)}
                      >
                        Base
                      </Button>
                      <Button
                        size="xs"
                        variant={isCompare ? "secondary" : "ghost"}
                        className="h-6 px-2 text-[13px]"
                        onClick={() => setCompareHash(variant.hash)}
                      >
                        Compare
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-sm leading-5 text-muted-foreground">
                  {variantLabel(variant)}
                  {variant.hash === null && " (too large to compare)"}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <SectionLabel className="mb-3">Changes</SectionLabel>
        {!base || !compare || base === compare ? (
          <p className="text-[15px] text-muted-foreground">
            Pick two different versions to compare.
          </p>
        ) : !diff ? (
          <p className="text-[15px] text-muted-foreground">
            {baseBundle.isPending || compareBundle.isPending
              ? "Loading both versions..."
              : "One of these versions is only on an offline device."}
          </p>
        ) : changed.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">These versions have the same files.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {changed.map((entry) => (
              <FileDiffView key={entry.path} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const DIFF_CONTEXT_LINES = 3;

type NumberedDiffLine =
  | {
      kind: "line";
      op: "equal" | "insert" | "delete";
      text: string;
      oldNumber: number | null;
      newNumber: number | null;
    }
  | { kind: "gap"; hidden: number };

/** Numbers every line and folds unchanged runs longer than the surrounding context. */
function numberDiffLines(entry: BundleFileDiff): NumberedDiffLine[] {
  if (entry.kind !== "changed") return [];
  let oldNumber = 0;
  let newNumber = 0;
  const numbered = entry.lines.map((line) => {
    if (line.kind !== "insert") oldNumber += 1;
    if (line.kind !== "delete") newNumber += 1;
    return {
      kind: "line" as const,
      op: line.kind,
      text: line.kind === "insert" ? line.newLine : line.oldLine,
      oldNumber: line.kind === "insert" ? null : oldNumber,
      newNumber: line.kind === "delete" ? null : newNumber,
    };
  });
  const changedIndexes = numbered.flatMap((line, index) => (line.op === "equal" ? [] : [index]));
  const keep = (index: number) =>
    changedIndexes.some((changed) => Math.abs(changed - index) <= DIFF_CONTEXT_LINES);
  const result: NumberedDiffLine[] = [];
  let hidden = 0;
  numbered.forEach((line, index) => {
    if (line.op !== "equal" || keep(index)) {
      if (hidden > 0) result.push({ kind: "gap", hidden });
      hidden = 0;
      result.push(line);
    } else hidden += 1;
  });
  if (hidden > 0) result.push({ kind: "gap", hidden });
  return result;
}

function FileDiffView({ entry }: { entry: BundleFileDiff }) {
  const lines = useMemo(() => numberDiffLines(entry), [entry]);
  const added = lines.filter((line) => line.kind === "line" && line.op === "insert").length;
  const removed = lines.filter((line) => line.kind === "line" && line.op === "delete").length;
  return (
    <div className="surface-raised-sm overflow-hidden rounded-lg">
      <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2">
        <span className="font-mono text-[13.5px] font-medium">{entry.path}</span>
        {entry.kind === "added" && <Badge variant="success">Only in compare</Badge>}
        {entry.kind === "removed" && <Badge variant="error">Only in base</Badge>}
        {entry.kind === "changed" && (
          <span className="text-[13px] tabular-nums">
            <span className="text-success-foreground">+{added}</span>{" "}
            <span className="text-destructive-foreground">-{removed}</span>
          </span>
        )}
      </div>
      {entry.kind === "changed" && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[13.5px] leading-5">
            <tbody>
              {lines.map((line, index) =>
                line.kind === "gap" ? (
                  <tr key={index} className="bg-muted/30">
                    <td
                      colSpan={4}
                      className="px-4 py-1 font-sans text-[13px] text-muted-foreground"
                    >
                      {line.hidden} unchanged {line.hidden === 1 ? "line" : "lines"}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={index}
                    className={cn(
                      line.op === "insert" && "bg-success/10",
                      line.op === "delete" && "bg-destructive/10",
                    )}
                  >
                    <td className="w-10 pl-3 text-right text-muted-foreground/60 tabular-nums select-none">
                      {line.oldNumber ?? ""}
                    </td>
                    <td className="w-10 pr-2 text-right text-muted-foreground/60 tabular-nums select-none">
                      {line.newNumber ?? ""}
                    </td>
                    <td className="w-5 text-center text-muted-foreground select-none">
                      {line.op === "insert" ? "+" : line.op === "delete" ? "-" : ""}
                    </td>
                    <td className="pr-4 whitespace-pre">{line.text}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
