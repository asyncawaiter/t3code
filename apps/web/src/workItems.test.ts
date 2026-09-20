import { expect, it } from "vite-plus/test";
import { workItemDraftKey } from "./workItems";

it("keeps Space captures separate from other Spaces and the general capture draft", () => {
  const pod = workItemDraftKey({ profileId: "work", spaceId: "pod" });
  expect(workItemDraftKey({ profileId: "work", spaceId: "pod", title: "New thought" })).toBe(pod);
  expect(workItemDraftKey({ profileId: "work", spaceId: "evals" })).not.toBe(pod);
  expect(workItemDraftKey({ profileId: "personal", spaceId: "pod" })).not.toBe(pod);
  expect(workItemDraftKey({})).toBe("new");
  expect(pod).not.toBe("new");
});
