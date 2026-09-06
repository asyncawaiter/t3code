import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId, type Profile } from "@t3tools/contracts";
import { resolveProfileSource } from "./profileSync.logic";

const godel = Schema.decodeUnknownSync(EnvironmentId)("godel");
const poly = Schema.decodeUnknownSync(EnvironmentId)("poly");
const profile: Profile = { id: "work", name: "Work", color: "gray", projectKeys: [] };
const config = (
  profiles: ReadonlyArray<Profile>,
  profileSyncSourceId: EnvironmentId | null = null,
) => ({ settings: { profiles, profileSyncSourceId } });

describe("profile source discovery", () => {
  it("shows Godel's existing profiles on an empty Poly installation", () => {
    const configs = new Map([
      [godel, config([profile])],
      [poly, config([])],
    ]);
    expect(resolveProfileSource(configs, poly)).toEqual({ sourceId: godel, conflict: false });
    expect(resolveProfileSource(configs, godel)).toEqual({ sourceId: godel, conflict: false });
  });
  it("retains the selected source when offline or when its last profile is deleted", () => {
    expect(resolveProfileSource(new Map([[poly, config([], godel)]]), poly)).toEqual({
      sourceId: godel,
      conflict: false,
    });
    expect(
      resolveProfileSource(
        new Map([
          [godel, config([], godel)],
          [poly, config([profile], godel)],
        ]),
        poly,
      ),
    ).toEqual({ sourceId: godel, conflict: false });
  });
  it("requires a choice for divergent collections and source pointers", () => {
    expect(
      resolveProfileSource(
        new Map([
          [godel, config([profile])],
          [poly, config([{ ...profile, name: "Other" }])],
        ]),
        poly,
      ).conflict,
    ).toBe(true);
    expect(
      resolveProfileSource(
        new Map([
          [godel, config([], godel)],
          [poly, config([], poly)],
        ]),
        poly,
      ).conflict,
    ).toBe(true);
  });
  it("chooses the same source for identical legacy copies regardless of connection order", () => {
    expect(
      resolveProfileSource(
        new Map([
          [poly, config([profile])],
          [godel, config([profile])],
        ]),
        poly,
      ).sourceId,
    ).toBe(godel);
  });
});
