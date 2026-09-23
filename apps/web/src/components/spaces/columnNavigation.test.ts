import { expect, it } from "vite-plus/test";
import { columnSpaceScope, spaceColumnsNavigation } from "./columnNavigation";

it("keeps space destinations distinct from legacy and explicit custom boards", () => {
  expect(columnSpaceScope("/spaces/all", "?view=columns")).toBeUndefined();
  expect(
    columnSpaceScope("/spaces/all", "?view=columns&workspace=board&board=release"),
  ).toBeUndefined();
  expect(columnSpaceScope("/spaces/work", "?space=pod&view=columns")).toEqual({
    profileId: "work",
    spaceId: "pod",
    unsorted: false,
  });
  expect(columnSpaceScope("/spaces/all", "?workspace=space&view=columns")).toEqual({
    profileId: "all",
    spaceId: undefined,
    unsorted: false,
  });
  expect(
    spaceColumnsNavigation({ profileId: "work", spaceId: "pod", unsorted: false }, "device:chat"),
  ).toEqual({
    to: "/spaces/$profileId",
    params: { profileId: "work" },
    search: {
      view: "columns",
      workspace: "space",
      space: "pod",
      unsorted: false,
      focus: "device:chat",
    },
  });
});
