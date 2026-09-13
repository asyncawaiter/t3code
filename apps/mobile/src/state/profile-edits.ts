import {
  createProfileEditQueue,
  type ProfileEditState,
} from "@t3tools/client-runtime/state/profiles";
import { Atom } from "effect/unstable/reactivity";
import { writeFileAtomically } from "../lib/atomic-file";
import { appAtomRegistry } from "./atom-registry";

export const profileEditsAtom = Atom.make<ProfileEditState>({
  loaded: false,
  draft: null,
  error: null,
}).pipe(Atom.keepAlive);
const file = async () => {
  const { File, Paths } = await import("expo-file-system");
  return new File(Paths.document, "pending-profile-edits.json");
};
export const profileEdits = createProfileEditQueue({
  read: async () => {
    const target = await file();
    return target.exists ? target.text() : null;
  },
  write: async (value) => writeFileAtomically(await file(), value),
  changed: (state) => appAtomRegistry.set(profileEditsAtom, state),
});
