import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useAtomValue } from "@effect/atom-react";
import {
  ALL_PROFILE_ID,
  mergeProfileEdits,
  nextProfileId,
  resolveProfiles,
  spaceDeviceDefaults,
  PROFILE_JUMP_KEYBINDING_COMMANDS,
  SPACE_JUMP_KEYBINDING_COMMANDS,
  type Profile,
} from "@t3tools/contracts";
import { profileSpaceCounts } from "@t3tools/client-runtime/state/profiles";
import { usePrimarySettings } from "../../hooks/useSettings";
import { useProfileWriteBlockReason, useSaveProfiles } from "../../hooks/useProfileSync";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useProjects, useThreadShells } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { primaryServerKeybindingsAtom } from "../../state/server";
import {
  shortcutLabelForCommand,
  resolveShortcutCommand,
  profileTraversalDirectionFromCommand,
} from "../../keybindings";
import { useUiStateStore } from "../../uiStateStore";
import { openChatCreation, revealChatLocation } from "../../chatCreationStore";
import {
  globalDashboardNavigation,
  scopedOverviewNavigation,
} from "../../lib/globalDashboardNavigation";
import { ProfileStrip } from "../sidebar/ProfileStrip";
import { SpaceToolbar, SpaceTile, DefaultSpaceTile } from "../sidebar/Spaces";
import { OUTSIDE_SPACES, spaceProjectKeys, spaceDragId } from "../sidebar/Spaces.logic";
import { useProfileSwipe } from "../sidebar/useProfileSwipe";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { cn } from "../../lib/utils";

/** Browsing profiles is local to this popup; choosing a destination changes scope. */
export function ProfileSpaceNavigator({ onNavigate }: { onNavigate: () => void }) {
  const rawProfiles = usePrimarySettings((settings) => settings.profiles);
  const profiles = useMemo(() => resolveProfiles(rawProfiles), [rawProfiles]);
  const activeId = useUiStateStore((state) => state.activeProfileId);
  const selection = useUiStateStore((state) => state.spaceSelection);
  const [browsedId, setBrowsedId] = useState(activeId ?? ALL_PROFILE_ID);
  const profile = profiles.find((item) => item.id === browsedId) ?? profiles[0]!;
  const [createdId, setCreatedId] = useState<string | null>(null);
  const projects = useProjects();
  const threads = useThreadShells();
  const { environments } = useEnvironments();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const writeBlockReason = useProfileWriteBlockReason();
  const saveProfiles = useSaveProfiles();
  const newThread = useNewThreadHandler();
  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const container = useRef<HTMLDivElement>(null);
  const nativeSwipe = useProfileSwipe(container, profiles.length > 1, (direction) => {
    setBrowsedId(nextProfileId(profiles, profile.id, direction));
  });
  const counts = useMemo(
    () => profileSpaceCounts(rawProfiles, profile.id, threads),
    [rawProfiles, profile.id, threads],
  );
  const projectByKey = useMemo(
    () => new Map(projects.map((item) => [`${item.environmentId}:${item.id}`, item])),
    [projects],
  );
  const selectedSpace = selection?.profileId === profile.id ? selection.filter : null;
  const change = (updated: Profile) => {
    const base = rawProfiles;
    const saved = saveProfiles((current) =>
      mergeProfileEdits(
        current,
        base,
        base.map((item) => (item.id === updated.id ? updated : item)),
      ),
    );
    void saved.catch((error: unknown) => {
      toastManager.add({
        type: "error",
        title: "Space changes not saved",
        description: error instanceof Error ? error.message : "Try again.",
      });
    });
    return saved;
  };
  const visit = (spaceId?: string) => {
    void navigate(
      profile.id === ALL_PROFILE_ID
        ? globalDashboardNavigation()
        : scopedOverviewNavigation({
            profileId: profile.id,
            spaceId: spaceId === OUTSIDE_SPACES ? undefined : spaceId,
            unsorted: spaceId === OUTSIDE_SPACES,
          }),
    );
    onNavigate();
  };
  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      document.querySelector('[role="dialog"][aria-modal="true"]')
    )
      return;
    const command = resolveShortcutCommand(event, keybindings, { platform: navigator.platform });
    const direction = profileTraversalDirectionFromCommand(command);
    const index = PROFILE_JUMP_KEYBINDING_COMMANDS.findIndex((item) => item === command);
    if (direction || index >= 0) {
      const id = direction ? nextProfileId(profiles, profile.id, direction) : profiles[index]?.id;
      if (id) {
        event.preventDefault();
        setBrowsedId(id);
      }
      return;
    }
    const spaceIndex = SPACE_JUMP_KEYBINDING_COMMANDS.findIndex((item) => item === command);
    if (profile.id === ALL_PROFILE_ID || spaceIndex < 0) return;
    const space = profile.spaces?.[spaceIndex - 1];
    if (spaceIndex > 0 && !space) return;
    event.preventDefault();
    visit(spaceIndex === 0 ? OUTSIDE_SPACES : space!.id);
  });
  useEffect(() => {
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);
  return (
    <DndContext
      sensors={sensors}
      onDragEnd={({ active, over }) => {
        const spaces = profile.spaces ?? [];
        const from = spaces.findIndex((item) => spaceDragId(profile.id, item.id) === active.id);
        const to = spaces.findIndex((item) => spaceDragId(profile.id, item.id) === over?.id);
        if (writeBlockReason || from < 0 || to < 0 || from === to) return;
        void change({ ...profile, spaces: arrayMove([...spaces], from, to) });
      }}
    >
      <div
        ref={container}
        className={cn(
          "min-w-0",
          nativeSwipe &&
            "overflow-x-hidden overscroll-x-none [&_[data-slot=profile-strip]_[role=group]]:overflow-x-hidden",
        )}
      >
        <ProfileStrip
          profiles={profiles}
          activeProfileId={profile.id}
          onSelect={setBrowsedId}
          shortcuts={profiles.map((_, index) => {
            const command = PROFILE_JUMP_KEYBINDING_COMMANDS[index];
            return command ? shortcutLabelForCommand(keybindings, command) : null;
          })}
        />
        <div className="max-h-[60dvh] overflow-y-auto rounded-xl bg-sidebar-foreground/[0.025] p-1.5">
          {profile.id === ALL_PROFILE_ID ? (
            <Button variant="ghost" className="w-full justify-start" onClick={() => visit()}>
              Global dashboard
            </Button>
          ) : (
            <>
              <SpaceToolbar
                showAllChats={false}
                key={profile.id}
                profile={profile}
                disabled={writeBlockReason !== null}
                onChange={change}
                onCreated={setCreatedId}
                selectedSpaceId={selectedSpace}
                onFilterChange={() => visit()}
                onOverview={() => visit()}
              />
              <SortableContext
                items={(profile.spaces ?? []).map((item) => spaceDragId(profile.id, item.id))}
                strategy={rectSortingStrategy}
              >
                <ul aria-label="Spaces" className="mt-1 grid grid-cols-3 gap-1.5">
                  <DefaultSpaceTile
                    profileId={profile.id}
                    dropDisabled
                    count={counts.get(OUTSIDE_SPACES) ?? 0}
                    selected={selectedSpace === OUTSIDE_SPACES}
                    onSelect={() => visit(OUTSIDE_SPACES)}
                    shortcut={shortcutLabelForCommand(keybindings, "space.jump.1")}
                    onNewChat={() => {
                      revealChatLocation(profile.id, null);
                      openChatCreation();
                    }}
                  />
                  {(profile.spaces ?? []).map((space, index) => (
                    <SpaceTile
                      key={space.id}
                      profile={profile}
                      space={space}
                      count={counts.get(space.id) ?? 0}
                      selected={selectedSpace === space.id}
                      attention={threads.some(
                        (thread) =>
                          thread.archivedAt === null &&
                          (thread.hasPendingApprovals || thread.hasPendingUserInput) &&
                          space.threads.some(
                            (item) => item.threadKey === `${thread.environmentId}:${thread.id}`,
                          ),
                      )}
                      offerSetup={createdId === space.id}
                      onSelect={() => visit(space.id)}
                      onChange={change}
                      writeBlockReason={writeBlockReason}
                      shortcut={
                        SPACE_JUMP_KEYBINDING_COMMANDS[index + 1]
                          ? shortcutLabelForCommand(
                              keybindings,
                              SPACE_JUMP_KEYBINDING_COMMANDS[index + 1]!,
                            )
                          : null
                      }
                      projects={spaceProjectKeys(space).map((key) => ({
                        key,
                        project: projectByKey.get(key) ?? null,
                        name: projectByKey.get(key)?.title ?? "Unavailable folder",
                        device:
                          environments.find((item) => item.environmentId === key.split(":")[0])
                            ?.label ??
                          Object.values(spaceDeviceDefaults(space)).find(
                            (item) => item.projectKey === key,
                          )?.deviceLabel ??
                          "Unavailable device",
                      }))}
                      onLaunch={async (projectRef, defaults) => {
                        const opened = await newThread(projectRef, {
                          forceNew: true,
                          spaceId: space.id,
                          useProjectDefaults: true,
                          ...(defaults.modelSelection
                            ? { modelSelection: defaults.modelSelection }
                            : {}),
                          ...(defaults.envMode ? { envMode: defaults.envMode } : {}),
                        });
                        if (!opened) throw new Error("Could not open the draft. Try again.");
                        onNavigate();
                      }}
                    />
                  ))}
                </ul>
              </SortableContext>
            </>
          )}
        </div>
      </div>
    </DndContext>
  );
}
