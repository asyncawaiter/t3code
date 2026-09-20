import { expect, it } from "vite-plus/test";
import { workspaceView } from "./workspaceView";

it("preserves supported views and maps old Monitor links to Columns", () => {
  expect(workspaceView("monitor")).toBe("columns");
  for (const view of ["columns", "folders", "branches"]) {
    expect(workspaceView(view)).toBe(view);
  }
  expect(workspaceView(undefined)).toBeUndefined();
  expect(workspaceView("invalid")).toBeUndefined();
});
