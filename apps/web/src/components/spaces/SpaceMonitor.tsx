import { ALL_PROFILE, type Profile } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useEnvironments } from "../../state/environments";
import { spaceOverviewThreads, OUTSIDE_SPACES } from "../sidebar/Spaces.logic";
import { Button } from "../ui/button";

export function SpaceMonitor({
  profiles,
  threads,
  onOpen,
  includeUnassigned = false,
}: {
  includeUnassigned?: boolean;
  profiles: readonly Profile[];
  threads: readonly EnvironmentThreadShell[];
  onOpen: (profileId: string, spaceId: string | null, unsorted: boolean, focus?: string) => void;
}) {
  const { environments } = useEnvironments();
  const ownedProjects = new Set(profiles.flatMap((profile) => profile.projectKeys));
  const displayProfiles = includeUnassigned
    ? [...profiles, { ...ALL_PROFILE, name: "Outside profiles" }]
    : profiles;
  const rows = displayProfiles
    .flatMap((profile) =>
      [...(profile.spaces ?? []), { id: OUTSIDE_SPACES, name: "Unsorted" }].map((space) => ({
        profile,
        space,
        chats: (profile.id === ALL_PROFILE.id
          ? threads.filter((chat) => !ownedProjects.has(`${chat.environmentId}:${chat.projectId}`))
          : spaceOverviewThreads(profiles, profile.id, space.id, threads)
        )
          .filter((chat) => !chat.archivedAt && chat.settledOverride !== "settled")
          .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt)),
      })),
    )
    .filter((row) => row.chats.length);
  return (
    <div className="space-y-4 overflow-y-auto">
      {rows.map(({ profile, space, chats }) => {
        return (
          <section
            key={`${profile.id}:${space.id}`}
            aria-label={`${profile.name} / ${space.name}`}
            className="rounded-xl border border-border/60 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {profile.name} <span className="font-normal text-muted-foreground">/</span>{" "}
                {space.name}
              </h2>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  onOpen(
                    profile.id,
                    space.id === OUTSIDE_SPACES ? null : space.id,
                    space.id === OUTSIDE_SPACES,
                  )
                }
              >
                Open columns
              </Button>
            </div>
            <div className="flex snap-x snap-proximity gap-2 overflow-x-auto pb-1">
              {chats.map((chat) => (
                <button
                  key={`${chat.environmentId}:${chat.id}`}
                  onClick={() =>
                    onOpen(
                      profile.id,
                      space.id === OUTSIDE_SPACES ? null : space.id,
                      space.id === OUTSIDE_SPACES,
                      `${chat.environmentId}:${chat.id}`,
                    )
                  }
                  className="flex w-72 shrink-0 snap-start flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-left hover:bg-accent/40"
                >
                  <span className="line-clamp-2 text-sm font-medium">{chat.title}</span>
                  <span
                    className={`text-xs ${chat.hasPendingApprovals || chat.hasPendingUserInput ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                  >
                    {chat.hasPendingApprovals
                      ? "Approval needed"
                      : chat.hasPendingUserInput
                        ? "Waiting for your answer"
                        : (chat.planProgress?.step ??
                          (chat.session?.status === "running"
                            ? "Working"
                            : chat.backgroundLiveness === "monitoring"
                              ? "Monitoring"
                              : "Idle"))}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {environments.find((env) => env.environmentId === chat.environmentId)?.label ??
                      "Device unavailable"}
                    {chat.branch ? ` · ${chat.branch}` : ""}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {!rows.length && (
        <p className="p-4 text-sm text-muted-foreground">No active chats to monitor.</p>
      )}
    </div>
  );
}
