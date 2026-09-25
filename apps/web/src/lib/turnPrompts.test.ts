import { expect, it } from "vite-plus/test";

import { promptPreview, turnPrompts } from "./turnPrompts";

it("pairs each turn with the user message that started it", () => {
  const prompts = turnPrompts([
    { role: "user", text: "fix the diff panel", turnId: null },
    { role: "assistant", text: "on it", turnId: "t1" },
    { role: "assistant", text: "done", turnId: "t1" },
    { role: "user", text: "now the usage page", turnId: null },
    { role: "user", text: "and make it used-based", turnId: null },
    { role: "assistant", text: "ok", turnId: "t2" },
  ] as never);
  expect(prompts.get("t1")).toBe("fix the diff panel");
  expect(prompts.get("t2")).toBe("and make it used-based");
});

it("flattens a prompt to one line", () => {
  expect(promptPreview("  first line\n\n  second   line ")).toBe("first line second line");
});
