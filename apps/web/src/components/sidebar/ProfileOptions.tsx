import { useState } from "react";
import { ALL_PROFILE_ID, PROFILE_MAX_COUNT, PROFILE_NAME_MAX_LENGTH } from "@t3tools/contracts";
import { MoreHorizontalIcon, PlusIcon, PencilIcon, Settings2Icon } from "lucide-react";
import {
  usePrimarySettings,
  usePrimarySettingsLoaded,
  useUpdatePrimarySettings,
} from "../../hooks/useSettings";
import { randomUUID } from "../../lib/utils";
import { ProfilesSettings } from "../settings/ProfilesSettings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuSeparator } from "../ui/menu";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

export function ProfileOptions({
  activeProfileId,
  onSelect,
}: {
  activeProfileId: string | null;
  onSelect: (id: string) => void;
}) {
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const loaded = usePrimarySettingsLoaded();
  const updateSettings = useUpdatePrimarySettings();
  const [editor, setEditor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const active = profiles.find(
    (profile) => profile.id === activeProfileId && profile.id !== ALL_PROFILE_ID,
  );
  const editing = profiles.find((profile) => profile.id === editor);
  const creating = editor === "new";
  const valid =
    loaded &&
    name.trim().length > 0 &&
    (creating ? profiles.length < PROFILE_MAX_COUNT : !!editing);
  return (
    <>
      <Menu>
        <Tooltip>
          <MenuTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Profile options"
                    className="shrink-0 rounded-full text-sidebar-muted-foreground"
                  />
                }
              />
            }
          >
            <MoreHorizontalIcon className="size-4" />
          </MenuTrigger>
          <TooltipPopup>Profile options</TooltipPopup>
        </Tooltip>
        <MenuPopup align="end" className="w-52">
          <MenuItem
            disabled={!loaded || profiles.length >= PROFILE_MAX_COUNT}
            onClick={() => {
              setName("");
              setEditor("new");
            }}
          >
            <PlusIcon /> New profile...
          </MenuItem>
          {active ? (
            <MenuItem
              disabled={!loaded}
              onClick={() => {
                setName(active.name);
                setEditor(active.id);
              }}
            >
              <PencilIcon /> <span className="truncate">Edit {active.name}...</span>
            </MenuItem>
          ) : null}
          <MenuSeparator />
          <MenuItem onClick={() => setEditor("manage")}>
            <Settings2Icon /> Manage profiles...
          </MenuItem>
        </MenuPopup>
      </Menu>
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogPopup className={editor === "manage" ? "max-w-xl" : "max-w-sm"}>
          <DialogHeader>
            <DialogTitle>
              {editor === "manage" ? "Manage profiles" : creating ? "New profile" : "Edit profile"}
            </DialogTitle>
            <DialogDescription>
              {editor === "manage"
                ? "Rename, reorder, or remove your profiles."
                : creating
                  ? "Give this profile a name. Add projects after creating it."
                  : "Update the name shown in your sidebar."}
            </DialogDescription>
          </DialogHeader>
          {editor === "manage" ? (
            <div className="max-h-[60vh] overflow-y-auto px-6 pb-6">
              <ProfilesSettings />
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!valid) return;
                if (creating) {
                  const id = `profile-${randomUUID()}`;
                  updateSettings({
                    profiles: [
                      ...profiles,
                      { id, name: name.trim(), color: "gray", projectKeys: [] },
                    ],
                  });
                  onSelect(id);
                } else {
                  updateSettings({
                    profiles: profiles.map((profile) =>
                      profile.id === editor ? { ...profile, name: name.trim() } : profile,
                    ),
                  });
                }
                setEditor(null);
              }}
            >
              <div className="px-6 pb-5">
                <label htmlFor="sidebar-profile-name" className="mb-2 block text-xs font-medium">
                  Profile name
                </label>
                <Input
                  id="sidebar-profile-name"
                  autoFocus
                  maxLength={PROFILE_NAME_MAX_LENGTH}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Work, Personal..."
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!valid}>
                  {creating ? "Create profile" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogPopup>
      </Dialog>
    </>
  );
}
