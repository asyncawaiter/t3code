import { describe, expect, it } from "vite-plus/test";
import { recordWorkflowVisit, useWorkflowState } from "./workflowState";

describe("workflow navigation and review", () => {
  it("keeps distinct devices in recent history and a separate last chat per profile", () => {
    const initial = useWorkflowState.getState();
    const work = recordWorkflowVisit(initial, "work:chat", "work");
    const personal = recordWorkflowVisit(work, "personal:chat", "personal");
    const returned = recordWorkflowVisit(personal, "work:chat", "work");
    expect(returned.recentThreads.slice(0, 2)).toEqual(["work:chat", "personal:chat"]);
    expect(returned.profileThreads).toMatchObject({ work: "work:chat", personal: "personal:chat" });
  });
  it("visits don't mark review; keeping and reviewing apply to the exact completion", () => {
    const initial = useWorkflowState.getState();
    try {
      useWorkflowState.setState({ reviewed: {}, kept: {} });
      useWorkflowState.getState().visit("env:chat", "work");
      expect(useWorkflowState.getState().reviewed).toEqual({});
      useWorkflowState.getState().review("env:chat", "2026-09-15T12:00:00Z", true);
      expect(useWorkflowState.getState().kept["env:chat"]).toBe("2026-09-15T12:00:00Z");
      useWorkflowState.getState().review("env:chat", "2026-09-15T12:00:00Z", false);
      expect(useWorkflowState.getState().kept["env:chat"]).toBeUndefined();
      expect(useWorkflowState.getState().reviewed["env:chat"]).not.toBe("2026-09-15T13:00:00Z");
    } finally {
      useWorkflowState.setState(initial);
    }
  });
});
