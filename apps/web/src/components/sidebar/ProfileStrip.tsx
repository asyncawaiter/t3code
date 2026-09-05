import { useCallback, useEffect, useRef } from "react";
import { ProfileOptions } from "./ProfileOptions";
import { SPACE_THREAD_DRAG } from "./Spaces";
import type { Profile } from "@t3tools/contracts";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

/**
 * Static color-name → Tailwind class map. Never build class names
 * dynamically (`bg-${color}-500`): Tailwind only ships classes it can see
 * literally in source.
 */
const PROFILE_DOT_CLASS_NAMES: Record<Profile["color"], string> = {
  gray: "bg-zinc-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
};

export interface ProfileStripProps {
  onThreadDrop?: ((keys: string[]) => void) | undefined;
  profiles: ReadonlyArray<Profile>;
  activeProfileId: string | null;
  onSelect: (id: string) => void;
}

export function ProfileDot({ color, className }: { color: Profile["color"]; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 shrink-0 rounded-full", PROFILE_DOT_CLASS_NAMES[color], className)}
    />
  );
}

export function ProfileStrip({
  profiles,
  activeProfileId,
  onSelect,
  onThreadDrop,
}: ProfileStripProps) {
  const selectedId =
    profiles.find((profile) => profile.id === activeProfileId)?.id ?? profiles[0]?.id;
  const selectedButton = useRef<HTMLButtonElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const revealSelected = useCallback(() => {
    const container = strip.current;
    const button = selectedButton.current;
    if (!container || !button) return;
    const bounds = container.getBoundingClientRect();
    const item = button.getBoundingClientRect();
    if (item.left < bounds.left) container.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right) container.scrollLeft += item.right - bounds.right;
  }, []);
  useEffect(() => {
    if (selectedId) revealSelected();
  }, [selectedId, revealSelected]);
  return (
    <div
      className="flex items-center gap-1 px-1 pb-1 pt-0.5"
      aria-label="Profiles"
      data-slot="profile-strip"
      onDragOver={(event) => {
        if (onThreadDrop && event.dataTransfer.types.includes(SPACE_THREAD_DRAG))
          event.preventDefault();
      }}
      onDrop={(event) => {
        if (!onThreadDrop) return;
        const raw = event.dataTransfer.getData(SPACE_THREAD_DRAG);
        if (!raw) return;
        event.preventDefault();
        try {
          const keys: unknown = JSON.parse(raw);
          if (Array.isArray(keys) && keys.every((key): key is string => typeof key === "string"))
            onThreadDrop(keys);
        } catch {
          /* Ignore unrelated drag payloads. */
        }
      }}
    >
      <div
        ref={strip}
        className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Switch profile"
      >
        {profiles.map((profile) => {
          const selected = profile.id === selectedId;
          return (
            <Tooltip key={profile.id}>
              <TooltipTrigger
                render={
                  <button
                    ref={selected ? selectedButton : undefined}
                    type="button"
                    aria-label={profile.name}
                    aria-pressed={selected}
                    onClick={() => onSelect(profile.id)}
                    className={cn(
                      "flex h-9 shrink-0 items-center justify-center rounded-full px-3 text-xs font-medium outline-none transition-[flex-grow,background-color,color] duration-200 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
                      selected
                        ? "grow bg-zinc-700 text-zinc-50 dark:bg-zinc-300 dark:text-zinc-900"
                        : "grow-0 bg-sidebar-foreground/5 text-sidebar-muted-foreground hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground",
                    )}
                  />
                }
              >
                <span
                  aria-hidden="true"
                  className="w-4 shrink-0 text-center text-[10px] font-semibold tracking-wide"
                >
                  {Array.from(profile.name).slice(0, 2).join("").toLocaleUpperCase()}
                </span>
                <span
                  aria-hidden="true"
                  onTransitionEnd={(event) => {
                    if (selected && event.propertyName === "max-width") revealSelected();
                  }}
                  className={cn(
                    "overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity] duration-200 motion-reduce:transition-none",
                    selected ? "ml-2 max-w-48 opacity-100" : "ml-0 max-w-0 opacity-0",
                  )}
                >
                  {profile.name}
                </span>
              </TooltipTrigger>
              <TooltipPopup>{profile.name}</TooltipPopup>
            </Tooltip>
          );
        })}
      </div>
      <ProfileOptions activeProfileId={activeProfileId} onSelect={onSelect} />
    </div>
  );
}
