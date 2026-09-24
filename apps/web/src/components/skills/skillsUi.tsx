import type { ProviderDriverKind, SkillSource } from "@t3tools/contracts";
import { CheckIcon, CloudOffIcon, DiffIcon, LockIcon, MinusIcon, PlusIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import type { SkillActionRequest } from "./SkillActionDialog";
import type { SkillCell, SkillCellStatus, SkillGroup, SkillTarget } from "./skillsModel";

export const SOURCE_LABEL: Record<SkillSource, string> = {
  personal: "Personal",
  shared: "Shared",
  builtin: "Built-in",
  project: "Project",
};

export const CELL_LABEL: Record<SkillCellStatus, string> = {
  "in-sync": "Installed",
  drift: "Installed, differs from the most common version",
  missing: "Not installed",
  unsupported: "This provider can't take file-based skills",
  offline: "Device offline, state unknown",
  readonly: "Installed, managed by the provider or another tool",
};

/** Short label for the skill page's availability list. */
export const CELL_SHORT_LABEL: Record<SkillCellStatus, string> = {
  "in-sync": "Installed",
  drift: "Differs",
  missing: "Not installed",
  unsupported: "Not supported",
  offline: "Unknown",
  readonly: "Read only",
};

/**
 * One availability mark, a distinct shape per state so nothing depends on color: a check
 * when installed, a not-equal sign when the copy differs, a lock when read only. "Not
 * installed" is an empty cell that shows a faint plus when its `group/cell` is hovered.
 */
export function AvailabilityMark({
  status,
  dimmed = false,
  className,
}: {
  status: SkillCellStatus;
  dimmed?: boolean;
  className?: string;
}) {
  const iconClass = cn("size-4 shrink-0", dimmed && "opacity-45", className);
  switch (status) {
    case "in-sync":
      return (
        <CheckIcon aria-hidden strokeWidth={2.5} className={cn(iconClass, "text-foreground")} />
      );
    case "drift":
      return (
        <DiffIcon
          aria-hidden
          strokeWidth={2.25}
          className={cn(iconClass, "text-amber-700 dark:text-amber-300")}
        />
      );
    case "missing":
      return (
        <PlusIcon
          aria-hidden
          className={cn(
            iconClass,
            "text-muted-foreground opacity-0 group-hover/cell:opacity-70 group-focus-visible/cell:opacity-70",
          )}
        />
      );
    case "readonly":
      return <LockIcon aria-hidden className={cn(iconClass, "size-3.5 text-muted-foreground")} />;
    case "unsupported":
      return <MinusIcon aria-hidden className={cn(iconClass, "text-muted-foreground/60")} />;
    case "offline":
      return (
        <CloudOffIcon aria-hidden className={cn(iconClass, "size-3.5 text-muted-foreground")} />
      );
  }
}

export function ProviderMark({ target, className }: { target: SkillTarget; className?: string }) {
  return (
    <ProviderInstanceIcon
      driverKind={target.driver as ProviderDriverKind}
      displayName={target.providerLabel}
      iconClassName={cn("size-3.5", className)}
    />
  );
}

/** Groups targets by device, keeping the order devices first appear in. */
export function targetsByDevice(targets: readonly SkillTarget[]) {
  const devices = new Map<string, { label: string; online: boolean; targets: SkillTarget[] }>();
  for (const target of targets) {
    const device = devices.get(target.environmentId) ?? {
      label: target.envLabel,
      online: target.online,
      targets: [],
    };
    device.targets.push(target);
    devices.set(target.environmentId, device);
  }
  return [...devices.entries()].map(([environmentId, device]) => ({ environmentId, ...device }));
}

/** The install a new copy is taken from: the most common version, preferring an online device. */
export function copySource(skill: SkillGroup) {
  const installs = skill.primaryVariant.installs;
  return installs.find((entry) => entry.target.online) ?? installs[0]!;
}

/**
 * The write that would make `target` hold the most common version of `skill`, or null when
 * there is nothing to do or it can't be done from here (offline, read only, too large).
 */
export function copyRequestItem(
  skill: SkillGroup,
  cell: SkillCell | undefined,
  target: SkillTarget,
) {
  const source = copySource(skill);
  if (!cell || !target.online || !target.writable || !source.target.online) return null;
  if (cell.status === "missing") {
    return { skillName: skill.name, source, target, expectedHash: null };
  }
  if (cell.status === "drift" && cell.install?.source === "personal" && cell.install.hash) {
    return { skillName: skill.name, source, target, expectedHash: cell.install.hash };
  }
  return null;
}

export function copyRequest(
  title: string,
  items: ReadonlyArray<NonNullable<ReturnType<typeof copyRequestItem>>>,
): SkillActionRequest | null {
  if (items.length === 0) return null;
  if (items.length === 1) {
    const [item] = items;
    return { kind: item!.expectedHash ? "update" : "install", ...item! };
  }
  return { kind: "bulk", title, items: [...items] };
}

/** Uppercase section label used across the skills screens. */
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </h3>
  );
}
