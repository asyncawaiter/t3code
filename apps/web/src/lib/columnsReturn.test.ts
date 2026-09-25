import { expect, it } from "vite-plus/test";

import { markColumnsReturnDestination, setColumnsReturn, takeColumnsReturn } from "./columnsReturn";

it("goes back only from the page the shortcut opened, once", () => {
  let backs = 0;
  setColumnsReturn(() => {
    backs += 1;
  });
  markColumnsReturnDestination({
    pathname: "/spaces/p1",
    search: { space: "s1", unsorted: false },
  });
  expect(takeColumnsReturn({ pathname: "/dashboard", search: {} })).toBeNull();
  // Filters the page adds on its own do not count as leaving it.
  const back = takeColumnsReturn({
    pathname: "/spaces/p1",
    search: { space: "s1", unsorted: false, focus: "env:t" },
  });
  back?.();
  expect(backs).toBe(1);
  expect(takeColumnsReturn({ pathname: "/spaces/p1", search: { space: "s1" } })).toBeNull();
});
