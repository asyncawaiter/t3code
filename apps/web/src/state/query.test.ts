import { expect, it } from "vite-plus/test";
import * as Cause from "effect/Cause";
import { formatEnvironmentQueryError } from "./query";
it("preserves the reason from string RPC defects and typed failures", () => {
  expect(formatEnvironmentQueryError(Cause.die("Unknown request tag: projects.instructions"))).toBe(
    "Unknown request tag: projects.instructions",
  );
  expect(formatEnvironmentQueryError(Cause.fail(new Error("Permission denied")))).toBe(
    "Permission denied",
  );
});
