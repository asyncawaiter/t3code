import { describe, expect, it } from "vite-plus/test";

import { claimWorkspaceFileLookup, matchWorkspaceFile } from "./workspaceFileLookup";

const file = (path: string) => ({ path, kind: "file" as const });

describe("matchWorkspaceFile", () => {
  const entries = [
    file("apps/web/src/lib/columnsReturn.ts"),
    file("apps/server/src/provider/Layers/ClaudeAdapter.ts"),
    file("apps/server/src/provider/Services/ClaudeAdapter.ts"),
    file("README.md"),
    file("docs/README.md"),
    { path: "apps/web/src/components", kind: "directory" as const },
  ];

  it("opens the path as written when it exists", () => {
    expect(matchWorkspaceFile("README.md", entries)).toEqual({ kind: "match", path: "README.md" });
  });

  it("finds the one file a partial path ends with", () => {
    expect(matchWorkspaceFile("lib/columnsReturn.ts", entries)).toEqual({
      kind: "match",
      path: "apps/web/src/lib/columnsReturn.ts",
    });
    expect(matchWorkspaceFile("./columnsReturn.ts", entries)).toEqual({
      kind: "match",
      path: "apps/web/src/lib/columnsReturn.ts",
    });
  });

  it("never picks between same-named files, but lists touched ones first", () => {
    expect(
      matchWorkspaceFile("ClaudeAdapter.ts", entries, (path) => path.includes("Layers")),
    ).toEqual({
      kind: "choose",
      paths: [
        "apps/server/src/provider/Layers/ClaudeAdapter.ts",
        "apps/server/src/provider/Services/ClaudeAdapter.ts",
      ],
    });
  });

  it("does not match a partial segment of a name", () => {
    expect(matchWorkspaceFile("Return.ts", entries)).toEqual({ kind: "none" });
  });

  it("resolves drifted casing only when unambiguous", () => {
    expect(matchWorkspaceFile("LIB/columnsreturn.ts", entries)).toEqual({
      kind: "match",
      path: "apps/web/src/lib/columnsReturn.ts",
    });
    expect(matchWorkspaceFile("foo.ts", [file("a/Foo.ts"), file("b/FOO.ts")]).kind).toBe("choose");
  });

  it("ignores folders and reports nothing found", () => {
    expect(matchWorkspaceFile("components", entries)).toEqual({ kind: "none" });
    expect(matchWorkspaceFile("missing.ts", entries)).toEqual({ kind: "none" });
  });
});

describe("claimWorkspaceFileLookup", () => {
  it("lets only the newest lookup win", () => {
    const first = claimWorkspaceFileLookup();
    const second = claimWorkspaceFileLookup();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});
