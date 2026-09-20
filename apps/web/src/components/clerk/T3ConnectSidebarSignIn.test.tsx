import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";

const auth = vi.hoisted(() => ({
  status: "loading",
  isLoaded: false,
  isSignedIn: false,
  openSignIn: vi.fn(),
}));
vi.mock("@clerk/react", () => ({
  useAuth: () => auth,
  UserButton: Object.assign(() => createElement("button", null, "Account menu"), {
    UserProfilePage: () => null,
  }),
  ClerkLoading: ({ children }: { children: ReactNode }) =>
    auth.status === "loading" ? children : null,
  ClerkFailed: ({ children }: { children: ReactNode }) =>
    auth.status === "error" ? children : null,
}));
vi.mock("../../cloud/publicConfig", () => ({ hasCloudPublicConfig: () => true }));
vi.mock("./useT3ConnectAuthPrompt", () => ({
  useT3ConnectAuthPrompt: () => ({ authPrompt: null, openAuthPrompt: auth.openSignIn }),
}));
vi.mock("./MobileClientsUserProfilePage", () => ({ MobileClientsUserProfilePage: () => null }));
vi.mock("./T3ConnectUserProfilePage", () => ({ T3ConnectUserProfilePage: () => null }));
vi.mock("../ui/sidebar", () => ({
  SidebarMenu: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SidebarMenuItem: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SidebarMenuButton: (props: Record<string, unknown>) => createElement("button", props),
}));
import { T3ConnectSidebarAvatar, T3ConnectSidebarSignIn } from "./T3ConnectSidebarSignIn";
let renderer: ReactTestRenderer;
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  vi.unstubAllGlobals();
});
it("keeps cloud access visible through SDK failure and recovers without signing out", async () => {
  const reload = vi.fn();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { location: { reload } });
  const footer = () => (
    <>
      <T3ConnectSidebarSignIn />
      <T3ConnectSidebarAvatar />
    </>
  );
  await act(() => {
    renderer = create(footer());
  });
  expect(JSON.stringify(renderer.toJSON())).toContain("Connecting to T3 Connect");
  auth.status = "error";
  await act(() => renderer.update(footer()));
  expect(JSON.stringify(renderer.toJSON())).toContain("Retry T3 Connect");
  expect(reload).not.toHaveBeenCalled();
  await act(() => renderer.root.findByType("button").props.onClick());
  expect(reload).toHaveBeenCalledOnce();
  auth.status = "ready";
  auth.isLoaded = true;
  await act(() => renderer.update(footer()));
  expect(JSON.stringify(renderer.toJSON())).toContain("Sign in to T3 Connect");
  await act(() => renderer.root.findByType("button").props.onClick());
  expect(auth.openSignIn).toHaveBeenCalledOnce();
  auth.isSignedIn = true;
  await act(() => renderer.update(footer()));
  expect(JSON.stringify(renderer.toJSON())).toContain("Account menu");
  expect(JSON.stringify(renderer.toJSON())).not.toContain("Retry T3 Connect");
});
