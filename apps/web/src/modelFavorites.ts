import type {
  ModelCapabilities,
  ModelFavorite,
  ProviderOptionSelection,
  ServerProvider,
} from "@t3tools/contracts";
import {
  buildProviderOptionSelectionsFromDescriptors,
  getProviderOptionDescriptors,
} from "@t3tools/shared/model";

export function modelFavoriteKey(favorite: ModelFavorite): string {
  return `favorite:${JSON.stringify([favorite.environmentId ?? null, favorite.provider, favorite.accountEmail ?? null, favorite.model, (favorite.options ?? []).toSorted((a, b) => a.id.localeCompare(b.id))])}`;
}

export function modelFavoriteOptions(
  caps: ModelCapabilities,
  selections?: ReadonlyArray<ProviderOptionSelection>,
): ReadonlyArray<ProviderOptionSelection> {
  return (
    buildProviderOptionSelectionsFromDescriptors(
      getProviderOptionDescriptors({
        caps,
        selections: selections?.some((option) => option.id === "fastMode")
          ? selections
          : [...(selections ?? []), { id: "fastMode", value: false }],
      }),
    ) ?? []
  );
}

export function modelFavoriteLabel(favorite: ModelFavorite): string {
  return [
    favorite.modelLabel ?? favorite.model,
    ...(favorite.options ?? []).flatMap(({ id, value }) =>
      id === "fastMode"
        ? [value ? "Fast" : "Normal"]
        : id === "serviceTier"
          ? [
              value === "default"
                ? "Normal"
                : value === "fast" || value === "priority"
                  ? "Fast"
                  : String(value),
            ]
          : typeof value === "string"
            ? [value[0]?.toUpperCase() + value.slice(1)]
            : [],
    ),
  ].join(" · ");
}

export function modelFavoriteUnavailable(
  favorite: ModelFavorite,
  provider: ServerProvider | undefined,
  connected = true,
): string | null {
  if (!connected) return "Host offline";
  if (!provider) return "Provider not configured on this host";
  if (provider.auth.status === "unauthenticated") return "Sign-in required";
  if (!provider.installed) return "Provider is not installed";
  if (!provider.enabled) return "Provider is disabled";
  if (favorite.accountEmail && !provider.auth.email) return "Cannot verify the saved account";
  if (
    favorite.accountEmail &&
    provider.auth.email?.toLowerCase() !== favorite.accountEmail.toLowerCase()
  )
    return "Different account signed in";
  if (provider.availability === "unavailable" || provider.status !== "ready")
    return "Provider unavailable";
  const model = provider.models.find((item) => item.slug === favorite.model);
  if (!model) return "Model unavailable";
  const resolved = modelFavoriteOptions(model.capabilities ?? {}, favorite.options);
  if (
    favorite.options?.some(
      (option) => !resolved.some((value) => value.id === option.id && value.value === option.value),
    )
  )
    return "Saved options are no longer supported";
  return null;
}
