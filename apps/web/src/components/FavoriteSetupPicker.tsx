import type { ModelFavorite } from "@t3tools/contracts";
import { useClientSettings } from "../hooks/useSettings";
import { useEnvironments } from "../state/environments";
import { modelFavoriteKey, modelFavoriteLabel, modelFavoriteUnavailable } from "../modelFavorites";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "./ui/select";

export function FavoriteSetupPicker({
  value,
  onChange,
}: {
  value: ModelFavorite | null;
  onChange: (favorite: ModelFavorite | null) => void;
}) {
  const favorites = useClientSettings((settings) => settings.favorites);
  const { environments } = useEnvironments();
  const setups = favorites.filter((favorite) => favorite.environmentId);
  if (!setups.length) return null;
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
      <span>Favorite setup</span>
      <Select
        value={value ? modelFavoriteKey(value) : "default"}
        onValueChange={(key) =>
          onChange(setups.find((favorite) => modelFavoriteKey(favorite) === key) ?? null)
        }
      >
        <SelectTrigger className="w-full min-w-0 font-normal" aria-label="Favorite setup">
          <SelectValue>{value ? modelFavoriteLabel(value) : "Use project defaults"}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value="default">Use project defaults</SelectItem>
          {setups.map((favorite) => {
            const environment = environments.find(
              (item) => item.environmentId === favorite.environmentId,
            );
            const provider = environment?.serverConfig?.providers.find(
              (item) => item.instanceId === favorite.provider,
            );
            const reason = modelFavoriteUnavailable(
              favorite,
              provider,
              environment?.connection.phase === "connected",
            );
            return (
              <SelectItem
                key={modelFavoriteKey(favorite)}
                value={modelFavoriteKey(favorite)}
                disabled={!!reason}
              >
                <span className="grid gap-0.5">
                  <span>{modelFavoriteLabel(favorite)}</span>
                  <span className="text-xs text-muted-foreground">
                    {environment?.label ?? favorite.environmentLabel ?? "Device unavailable"} /{" "}
                    {favorite.accountEmail ??
                      provider?.auth.email ??
                      provider?.displayName ??
                      favorite.provider}
                    {reason ? ` (${reason})` : ""}
                  </span>
                </span>
              </SelectItem>
            );
          })}
        </SelectPopup>
      </Select>
    </label>
  );
}
