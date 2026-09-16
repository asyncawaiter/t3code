import { indexProfileSpaces, type Profile } from "@t3tools/contracts";

export function organizationChangeLabel(
  before: ReadonlyArray<Profile>,
  after: ReadonlyArray<Profile>,
): string | null {
  const oldProjects = new Map(
    before.flatMap((profile) => profile.projectKeys.map((key) => [key, profile] as const)),
  );
  const newProjects = new Map(
    after.flatMap((profile) => profile.projectKeys.map((key) => [key, profile] as const)),
  );
  const movedProjects = new Set<string>();
  for (const key of new Set([...oldProjects.keys(), ...newProjects.keys()])) {
    if (oldProjects.get(key)?.id !== newProjects.get(key)?.id)
      movedProjects.add(newProjects.get(key)?.name ?? "All / Unassigned");
  }
  if (movedProjects.size)
    return movedProjects.size === 1
      ? `Moved project to ${[...movedProjects][0]}`
      : "Updated project profiles";
  const previous = indexProfileSpaces(before);
  const next = indexProfileSpaces(after);
  const destinations = new Set<string>();
  for (const key of new Set([...previous.keys(), ...next.keys()])) {
    const a = previous.get(key),
      b = next.get(key);
    if (
      a?.profile.id === b?.profile.id &&
      a?.space.id === b?.space.id &&
      a?.projectKey === b?.projectKey
    )
      continue;
    if (
      a &&
      !b &&
      !after
        .find((profile) => profile.id === a.profile.id)
        ?.spaces?.some((space) => space.id === a.space.id)
    )
      continue;
    const profile =
      b?.profile ?? after.find((profile) => a && profile.projectKeys.includes(a.projectKey));
    destinations.add(
      b
        ? `${b.profile.name} / ${b.space.name}`
        : profile
          ? `${profile.name} / Unsorted`
          : "All / Unsorted",
    );
  }
  if (destinations.size)
    return destinations.size === 1 ? `Moved to ${[...destinations][0]}` : "Updated chat placements";
  return null;
}
