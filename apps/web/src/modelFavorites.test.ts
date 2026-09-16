import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  ProviderInstanceId,
  ServerProvider,
  type ModelCapabilities,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  modelFavoriteKey,
  modelFavoriteOptions,
  modelFavoriteUnavailable,
  modelFavoriteLabel,
} from "./modelFavorites";

const decodeProvider = Schema.decodeUnknownSync(ServerProvider);
const caps: ModelCapabilities = {
  optionDescriptors: [
    {
      id: "reasoningEffort",
      label: "Effort",
      type: "select",
      currentValue: "medium",
      options: [
        { id: "medium", label: "Medium" },
        { id: "max", label: "Max" },
      ],
    },
    { id: "fastMode", label: "Fast", type: "boolean", currentValue: true },
  ],
};
const favorite = {
  environmentId: EnvironmentId.make("device-a"),
  provider: ProviderInstanceId.make("codex"),
  accountEmail: "first@example.com",
  model: "astra",
  options: modelFavoriteOptions(caps),
};

describe("model setup favorites", () => {
  it("keeps device, account and option variants distinct without depending on option order", () => {
    const key = modelFavoriteKey(favorite);
    expect(modelFavoriteKey({ ...favorite, options: favorite.options.toReversed() })).toBe(key);
    for (const variant of [
      { ...favorite, environmentId: EnvironmentId.make("device-b") },
      { ...favorite, accountEmail: "second@example.com" },
      {
        ...favorite,
        options: modelFavoriteOptions(caps, [
          { id: "reasoningEffort", value: "max" },
          { id: "fastMode", value: true },
        ]),
      },
    ])
      expect(modelFavoriteKey(variant)).not.toBe(key);
  });
  it("saves defaults explicitly and restores Fast off after a Fast on setup", () => {
    expect(favorite.options).toEqual([
      { id: "reasoningEffort", value: "medium" },
      { id: "fastMode", value: false },
    ]);
    const fast = modelFavoriteOptions(caps, [
      { id: "reasoningEffort", value: "max" },
      { id: "fastMode", value: true },
    ]);
    expect(fast).toEqual([
      { id: "reasoningEffort", value: "max" },
      { id: "fastMode", value: true },
    ]);
    expect(modelFavoriteOptions(caps, favorite.options)).toEqual(favorite.options);
  });
  it("preserves Codex service tiers and labels Fast separately from reasoning", () => {
    const options = [
      { id: "reasoningEffort", value: "max" },
      { id: "serviceTier", value: "fast" },
    ];
    expect(modelFavoriteLabel({ ...favorite, options })).toBe("astra · Max · Fast");
    expect(
      modelFavoriteLabel({ ...favorite, options: [{ id: "serviceTier", value: "default" }] }),
    ).toBe("astra · Normal");
  });
  it("keeps unavailable and changed accounts from silently running the setup elsewhere", () => {
    expect(modelFavoriteUnavailable(favorite, undefined, false)).toBe("Host offline");
    expect(modelFavoriteUnavailable(favorite, undefined)).toBe(
      "Provider not configured on this host",
    );
    const provider = decodeProvider({
      instanceId: "codex",
      driver: "codex",
      displayName: "Codex",
      status: "ready",
      installed: true,
      enabled: true,
      version: null,
      checkedAt: "2026-09-13T00:00:00.000Z",
      auth: { status: "authenticated", email: "second@example.com" },
      models: [{ slug: "astra", name: "Astra", isCustom: false, capabilities: caps }],
    });
    expect(modelFavoriteUnavailable(favorite, provider)).toBe("Different account signed in");
    const signedIn = { ...provider, auth: { ...provider.auth, email: favorite.accountEmail } };
    expect(modelFavoriteUnavailable(favorite, signedIn)).toBeNull();
    expect(modelFavoriteUnavailable(favorite, { ...signedIn, installed: false })).toBe(
      "Provider is not installed",
    );
    expect(modelFavoriteUnavailable(favorite, { ...signedIn, enabled: false })).toBe(
      "Provider is disabled",
    );
    expect(
      modelFavoriteUnavailable(favorite, { ...signedIn, auth: { status: "unauthenticated" } }),
    ).toBe("Sign-in required");
    expect(
      modelFavoriteUnavailable(favorite, { ...signedIn, auth: { status: "authenticated" } }),
    ).toBe("Cannot verify the saved account");
    expect(
      modelFavoriteUnavailable(
        { ...favorite, options: [{ id: "reasoningEffort", value: "unsupported" }] },
        signedIn,
      ),
    ).toBe("Saved options are no longer supported");
  });
});
