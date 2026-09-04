import type { Profile } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

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
  profiles: ReadonlyArray<Profile>;
  activeProfileId: string | null;
  onSelect: (id: string) => void;
}

export function ProfileStrip({ profiles, activeProfileId, onSelect }: ProfileStripProps) {
  if (profiles.length <= 1) {
    // Only the synthesized All profile exists: nothing for the user to switch between.
    return null;
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-1 py-0.5" data-slot="profile-strip">
      {profiles.map((profile) => {
        const isActive = (activeProfileId ?? profiles[0]!.id) === profile.id;
        return (
          <Tooltip key={profile.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={profile.name}
                  aria-pressed={isActive}
                  onClick={() => onSelect(profile.id)}
                  className={cn(
                    "flex h-6 shrink-0 items-center gap-1.5 rounded-full px-1.5 text-xs font-medium text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
                    isActive && "bg-sidebar-control-surface text-sidebar-foreground",
                  )}
                />
              }
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  PROFILE_DOT_CLASS_NAMES[profile.color],
                )}
                aria-hidden="true"
              />
              {isActive ? <span className="max-w-24 truncate">{profile.name}</span> : null}
            </TooltipTrigger>
            <TooltipPopup side="bottom">{profile.name}</TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}
