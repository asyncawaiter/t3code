import {
  createProfileEditQueue,
  type ProfileEditState,
} from "@t3tools/client-runtime/state/profiles";
import { Atom } from "effect/unstable/reactivity";
import { appAtomRegistry } from "../rpc/atomRegistry";

export const profileEditsAtom = Atom.make<ProfileEditState>({
  loaded: false,
  draft: null,
  error: null,
}).pipe(Atom.keepAlive);
const key = "t3.pending-profile-edits.v1";
export const profileEdits = createProfileEditQueue({
  read: async () => globalThis.localStorage.getItem(key),
  write: async (value) => globalThis.localStorage.setItem(key, value),
  changed: (state) => appAtomRegistry.set(profileEditsAtom, state),
  // ponytail: insecure HTTP lacks Web Locks; use HTTPS for concurrent browser windows.
  ...(globalThis.navigator?.locks
    ? {
        lock: (scope: "edit" | "sync", run: () => Promise<void>) =>
          globalThis.navigator.locks.request(`${key}:${scope}`, run),
      }
    : {}),
});

globalThis.addEventListener?.("storage", (event) => {
  if (event.key === key) void profileEdits.refresh().catch(() => {});
});
