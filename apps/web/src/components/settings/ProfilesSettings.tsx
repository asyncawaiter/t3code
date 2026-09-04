/**
 * Profiles - named, colored groups of projects shown in the sidebar
 * (Arc-browser style). Definitions live in server settings and sync to
 * every connected environment; the profile a client currently has selected
 * is client-local and owned elsewhere.
 *
 * @module ProfilesSettings
 */
import {
  PROFILE_COLORS,
  PROFILE_MAX_COUNT,
  PROFILE_NAME_MAX_LENGTH,
  type Profile,
  type ProfileColor,
} from "@t3tools/contracts";
import { ChevronDownIcon, ChevronUpIcon, Plus as PlusIcon, Trash2 as Trash2Icon } from "lucide-react";
import { useState } from "react";

import {
  usePrimarySettings,
  usePrimarySettingsLoaded,
  useUpdatePrimarySettings,
} from "../../hooks/useSettings";
import { cn, randomUUID } from "../../lib/utils";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { DraftInput } from "../ui/draft-input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ITEM_ROW_INNER_CLASSNAME } from "./itemRows";
import { searchableSetting } from "./settingsSearch";
import { SettingsRow } from "./settingsLayout";

/** Static so Tailwind can see every class literal; never build these from a variable. */
const PROFILE_COLOR_DOT_CLASSNAME: Record<ProfileColor, string> = {
  gray: "bg-gray-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-400",
  green: "bg-green-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
};

const PROFILE_COLOR_LABEL: Record<ProfileColor, string> = {
  gray: "Gray",
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  purple: "Purple",
};

function uniqueProfileName(existingNames: ReadonlySet<string>): string {
  let name = "New profile";
  for (let index = 2; existingNames.has(name); index += 1) name = `New profile ${index}`;
  return name;
}

function ProfileColorPicker({
  value,
  onChange,
  disabled,
}: {
  readonly value: ProfileColor;
  readonly onChange: (color: ProfileColor) => void;
  readonly disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Profile color">
      {PROFILE_COLORS.map((color) => {
        const active = color === value;
        return (
          <button
            key={color}
            type="button"
            disabled={disabled}
            aria-label={PROFILE_COLOR_LABEL[color]}
            aria-pressed={active}
            onClick={() => onChange(color)}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              active && "ring-2 ring-ring ring-offset-1 ring-offset-background",
            )}
          >
            <span className={cn("size-3.5 rounded-full", PROFILE_COLOR_DOT_CLASSNAME[color])} />
          </button>
        );
      })}
    </div>
  );
}

/** Create, rename, recolor, reorder, and remove profiles. */
export function ProfilesSettings() {
  const userProfiles = usePrimarySettings((settings) => settings.profiles);
  const updateSettings = useUpdatePrimarySettings();
  const settingsLoaded = usePrimarySettingsLoaded();
  const [profilePendingRemoval, setProfilePendingRemoval] = useState<Profile | null>(null);

  const addProfile = () => {
    if (!settingsLoaded || userProfiles.length >= PROFILE_MAX_COUNT) return;
    const name = uniqueProfileName(new Set(userProfiles.map((profile) => profile.name)));
    const color = PROFILE_COLORS[userProfiles.length % PROFILE_COLORS.length]!;
    const profile: Profile = { id: `profile-${randomUUID()}`, name, color, projectKeys: [] };
    updateSettings({ profiles: [...userProfiles, profile] });
  };

  const renameProfile = (id: string, next: string) => {
    if (!settingsLoaded) return;
    const name = next.trim().slice(0, PROFILE_NAME_MAX_LENGTH);
    if (name === "") return;
    updateSettings({
      profiles: userProfiles.map((profile) => (profile.id === id ? { ...profile, name } : profile)),
    });
  };

  const recolorProfile = (id: string, color: ProfileColor) => {
    if (!settingsLoaded) return;
    updateSettings({
      profiles: userProfiles.map((profile) => (profile.id === id ? { ...profile, color } : profile)),
    });
  };

  const moveProfile = (index: number, direction: -1 | 1) => {
    if (!settingsLoaded) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= userProfiles.length) return;
    const reordered = [...userProfiles];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved!);
    updateSettings({ profiles: reordered });
  };

  const removeProfile = (id: string) => {
    if (!settingsLoaded) return;
    updateSettings({ profiles: userProfiles.filter((profile) => profile.id !== id) });
    setProfilePendingRemoval(null);
  };

  return (
    <SettingsRow
      {...searchableSetting("profiles")}
      serverScoped
      description="Group projects into profiles. Swipe horizontally on the sidebar or press the profile shortcut to switch."
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={!settingsLoaded || userProfiles.length >= PROFILE_MAX_COUNT}
          onClick={addProfile}
        >
          <PlusIcon />
          Add profile
        </Button>
      }
    >
      <div className="mt-2 space-y-1 pb-2">
        {userProfiles.map((profile, index) => (
          <div
            key={profile.id}
            className={cn(ITEM_ROW_INNER_CLASSNAME, "rounded-lg border border-border/60 px-3 py-2")}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ProfileColorPicker
                value={profile.color}
                disabled={!settingsLoaded}
                onChange={(color) => recolorProfile(profile.id, color)}
              />
              <DraftInput
                nativeInput
                size="sm"
                className="w-full sm:w-56"
                aria-label={`Rename ${profile.name}`}
                maxLength={PROFILE_NAME_MAX_LENGTH}
                value={profile.name}
                disabled={!settingsLoaded}
                onCommit={(next) => renameProfile(profile.id, next)}
              />
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                size="icon-xs"
                variant="ghost-muted"
                disabled={!settingsLoaded || index === 0}
                aria-label={`Move ${profile.name} up`}
                onClick={() => moveProfile(index, -1)}
              >
                <ChevronUpIcon />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost-muted"
                disabled={!settingsLoaded || index === userProfiles.length - 1}
                aria-label={`Move ${profile.name} down`}
                onClick={() => moveProfile(index, 1)}
              >
                <ChevronDownIcon />
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost-muted"
                      disabled={!settingsLoaded}
                      aria-label={`Remove ${profile.name}`}
                      onClick={() => setProfilePendingRemoval(profile)}
                    >
                      <Trash2Icon />
                    </Button>
                  }
                />
                <TooltipPopup side="top">Remove profile</TooltipPopup>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>
      <AlertDialog
        open={profilePendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setProfilePendingRemoval(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{profilePendingRemoval?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its projects become unassigned; they still show up under All.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (profilePendingRemoval) removeProfile(profilePendingRemoval.id);
              }}
            >
              Remove profile
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </SettingsRow>
  );
}
