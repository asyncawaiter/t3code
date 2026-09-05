import { CheckIcon } from "lucide-react";
import { spaceForThread, ALL_PROFILE_ID, moveThreadsToSpace } from "@t3tools/contracts";
import {
  usePrimarySettings,
  usePrimarySettingsLoaded,
  useUpdatePrimarySettings,
} from "../../hooks/useSettings";
import { moveProjectToProfile } from "../settings/ProjectSettingsPanel.logic";
import { commonSpaceProfile } from "./Spaces.logic";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { Button } from "../ui/button";

export function ThreadSpaceDialog({
  threads,
  onClose,
  onMove,
}: {
  threads: ReadonlyArray<{ threadKey: string; projectKey: string }>;
  onClose: () => void;
  onMove: (profileId: string, spaceId: string | null) => void;
}) {
  const profiles = usePrimarySettings((settings) => settings.profiles);
  const loaded = usePrimarySettingsLoaded();
  const update = useUpdatePrimarySettings();
  const projectKeys = [...new Set(threads.map((thread) => thread.projectKey))];
  const profile = commonSpaceProfile(profiles, projectKeys);
  const samePlacement = (id: string | null) =>
    !!profile &&
    threads.every(
      (thread) => (spaceForThread(profile, thread.threadKey, thread.projectKey)?.id ?? null) === id,
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move to space</DialogTitle>
          <DialogDescription>
            {threads.length === 1
              ? "Choose where this chat belongs."
              : `Choose a space for ${threads.length} chats.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-6 pb-6">
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Project profile</span>
            <Select
              value={profile?.id ?? ALL_PROFILE_ID}
              onValueChange={(id) => {
                if (
                  !loaded ||
                  threads.length === 0 ||
                  !id ||
                  (id !== ALL_PROFILE_ID && !profiles.some((candidate) => candidate.id === id))
                )
                  return;
                update({ profiles: moveProjectToProfile(profiles, projectKeys, id) });
              }}
            >
              <SelectTrigger
                className="w-full"
                aria-label="Project profile"
                disabled={!loaded || profiles.length === 0}
              >
                <SelectValue>{profile?.name ?? "Choose a profile"}</SelectValue>
              </SelectTrigger>
              <SelectPopup alignItemWithTrigger={false}>
                <SelectItem value={ALL_PROFILE_ID}>Unassigned (All only)</SelectItem>
                {profiles.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Changing the profile moves{" "}
              {projectKeys.length === 1
                ? "this project and all its chats"
                : "these projects and all their chats"}
              . Selecting a space below moves only{" "}
              {threads.length === 1 ? "this chat" : "the selected chats"}.
            </p>
          </div>
          {profile ? (
            <div className="space-y-1" role="group" aria-label={`Spaces in ${profile.name}`}>
              {[{ id: null, name: "Outside spaces" }, ...(profile.spaces ?? [])].map((space) => (
                <Button
                  key={space.id ?? "root"}
                  variant="ghost"
                  className="w-full justify-between"
                  disabled={!loaded}
                  onClick={() => {
                    onMove(profile.id, space.id);
                    onClose();
                  }}
                >
                  <span className="truncate">{space.name}</span>
                  {samePlacement(space.id) ? (
                    <CheckIcon className="size-3.5" aria-label="Current placement" />
                  ) : null}
                </Button>
              ))}
              {!profile.spaces?.length ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  No spaces in {profile.name} yet. Use the plus beside Spaces to create one.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {profiles.length
                  ? "Choose the project's profile to see its spaces."
                  : "Create a profile using Profile options in the sidebar first."}
              </p>
              {profiles.some((candidate) =>
                threads.some((thread) =>
                  spaceForThread(candidate, thread.threadKey, thread.projectKey),
                ),
              ) ? (
                <Button
                  variant="outline"
                  disabled={!loaded}
                  onClick={() => {
                    update({
                      profiles: profiles.map((candidate) =>
                        moveThreadsToSpace(candidate, threads, null),
                      ),
                    });
                    onClose();
                  }}
                >
                  Remove from spaces
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}
