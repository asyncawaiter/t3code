import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EnvironmentId } from "@t3tools/contracts";
import { profileSourceAtom, serverEnvironment } from "../../state/server";
import { useEnvironments } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { cacheProfiles } from "../../state/profileSyncCache";
import { useProfilesLoaded } from "../../hooks/useProfileSync";
import { Button } from "../ui/button";

export function ProfileSyncStatus({ settings = false }: { settings?: boolean }) {
  const source = useAtomValue(profileSourceAtom);
  const { environments } = useEnvironments();
  const writable = useProfilesLoaded();
  const persist = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const attempted = useRef(new Set<string>());
  const requestedSource = useRef<EnvironmentId | null>(null);
  const [failure, setFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const sourceDevice = environments.find((env) => env.environmentId === source.sourceId);
  const targets = environments.filter(
    (env) =>
      env.connection.phase === "connected" &&
      env.serverConfig?.environment.capabilities.profileSynchronization === true,
  );

  useEffect(() => {
    if (!source.sourceId || !source.config || source.conflict) return;
    cacheProfiles({ sourceId: source.sourceId, profiles: source.profiles });
  }, [source]);

  // Advertise only the source identity. Never overwrite another server's legacy collection.
  useEffect(() => {
    if (
      !writable ||
      !source.sourceId ||
      (!source.config?.settings.profileSyncSourceId && source.profiles.length === 0)
    )
      return;
    for (const target of targets) {
      if (target.serverConfig?.settings.profileSyncSourceId) continue;
      const key = `${target.environmentId}:${source.sourceId}:${retry}`;
      if (attempted.current.has(key)) continue;
      attempted.current.add(key);
      void persist({
        environmentId: target.environmentId,
        input: { patch: { profileSyncSourceId: source.sourceId }, expectedProfileSourceId: null },
      }).then((result) => {
        if (result._tag === "Failure") setFailure(true);
      });
    }
  }, [persist, retry, source, targets, writable]);

  const chooseSource = useCallback(
    async (id: EnvironmentId) => {
      requestedSource.current = id;
      setBusy(true);
      setFailure(false);
      const results = await Promise.all(
        targets.map((target) =>
          persist({
            environmentId: target.environmentId,
            input: {
              patch: { profileSyncSourceId: id },
              expectedProfileSourceId: target.serverConfig?.settings.profileSyncSourceId ?? null,
            },
          }),
        ),
      );
      setFailure(results.some((result) => result._tag === "Failure"));
      setBusy(false);
    },
    [persist, targets],
  );

  if (!settings && !source.conflict && writable && !failure) return null;
  if (!settings && !source.conflict && !source.sourceId && !failure) return null;
  if (!settings)
    return (
      <div
        className="flex items-center justify-between gap-2 px-2 py-1 text-xs text-muted-foreground"
        role="status"
      >
        <span>
          {source.conflict
            ? "Choose a profile source"
            : failure
              ? "Profile sync needs attention"
              : "Profile organization is read-only"}
        </span>
        <Link
          to="/settings/general"
          className="shrink-0 rounded-sm underline underline-offset-2 focus-visible:outline focus-visible:outline-ring"
        >
          Review
        </Link>
      </div>
    );
  return (
    <div className="space-y-2 px-2 py-1 text-xs text-muted-foreground" role="status">
      <p>
        {source.conflict
          ? "Devices have different profile collections. Choose the shared source in Manage profiles. Existing collections will be retained."
          : !writable
            ? `Profile organization is read-only. Connect or update ${sourceDevice?.label ?? "the profile source"}; chats remain available on their hosts.`
            : `Profiles and spaces are shared live from ${sourceDevice?.label ?? "this device"}.`}
      </p>
      <>
        <label className="flex items-center gap-2">
          <span>Shared source</span>
          <select
            aria-label="Shared profile source"
            value={source.sourceId ?? ""}
            disabled={busy}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-foreground"
            onChange={(event) => {
              const selected = targets.find(
                (target) => target.environmentId === event.target.value,
              );
              if (selected) void chooseSource(selected.environmentId);
            }}
          >
            <option value="" disabled>
              Choose device
            </option>
            {source.sourceId &&
            !targets.some((target) => target.environmentId === source.sourceId) ? (
              <option value={source.sourceId}>{sourceDevice?.label ?? "Source unavailable"}</option>
            ) : null}
            {targets.map((target) => (
              <option key={target.environmentId} value={target.environmentId}>
                {target.label} ({target.serverConfig?.settings.profiles.length ?? 0} profiles)
              </option>
            ))}
          </select>
        </label>
        <p>Choosing another device uses its saved collection. Existing collections are retained.</p>
      </>
      {failure ? (
        <div>
          Could not share the source with every device.{" "}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              if (requestedSource.current) void chooseSource(requestedSource.current);
              else {
                setFailure(false);
                setRetry((value) => value + 1);
              }
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
