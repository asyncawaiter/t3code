import { afterEach, expect, it, vi } from "vite-plus/test";

const env = vi.hoisted(() => ({ values: {} as Record<string, string> }));
vi.mock("../../scripts/lib/public-config.ts", () => ({ loadRepoEnv: () => env.values }));

afterEach(() => {
  for (const key of Object.keys(env.values)) delete process.env[key];
  env.values = {};
  vi.resetModules();
});

it("isolates the fork from upstream updates and gives its extensions the same app group", async () => {
  env.values = {
    T3CODE_IOS_BUNDLE_ID: "com.example.t3fork",
    T3CODE_IOS_TEAM_ID: "MYTEAM1234",
  };
  const { default: config } = await import("./app.config");
  expect(config.ios?.bundleIdentifier).toBe("com.example.t3fork");
  expect(config.ios?.appleTeamId).toBe("MYTEAM1234");
  expect(config.ios?.entitlements?.["keychain-access-groups"]).toEqual([
    "$(AppIdentifierPrefix)com.example.t3fork",
  ]);
  expect(config.updates?.enabled).toBe(false);
  expect(config.scheme).toBe("t3code-fork");
  const widgets = config.plugins?.find((item) => Array.isArray(item) && item[0] === "expo-widgets");
  const sharing = config.plugins?.find((item) => Array.isArray(item) && item[0] === "expo-sharing");
  expect(widgets).toEqual([
    "expo-widgets",
    expect.objectContaining({ groupIdentifier: "group.com.example.t3fork" }),
  ]);
  expect(sharing).toEqual([
    "expo-sharing",
    expect.objectContaining({
      ios: expect.objectContaining({ appGroupId: "group.com.example.t3fork" }),
    }),
  ]);
});

it("rejects an invalid custom identity before native project generation", async () => {
  env.values = { T3CODE_IOS_BUNDLE_ID: "not a bundle id" };
  await expect(import("./app.config")).rejects.toThrow("reverse-DNS");
});
