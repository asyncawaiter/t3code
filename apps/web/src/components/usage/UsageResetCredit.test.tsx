import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useResetCredit } from "./UsageLimits";

const consume = vi.hoisted(() => vi.fn());
vi.mock("../../state/server", () => ({ serverEnvironment: { consumeResetCredit: null } }));
vi.mock("../../state/presentation", () => ({ environmentPresentations: {} }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => consume }));

function Harness() {
  const reset = useResetCredit(EnvironmentId.make("device"), {
    instanceId: ProviderInstanceId.make("account"),
  });
  return (
    <button disabled={reset.busy} onClick={reset.redeem}>
      {reset.status}
    </button>
  );
}
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  consume.mockReset();
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});

it("blocks overlapping clicks and preserves the outcome alongside a refresh warning", async () => {
  let resolve!: (value: unknown) => void;
  consume.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await act(() => {
    renderer = create(<Harness />);
  });
  const click = renderer.root.findByType("button").props.onClick;
  let pending!: Promise<void>;
  await act(async () => {
    pending = click();
    await click();
  });
  expect(consume).toHaveBeenCalledTimes(1);
  expect(consume).toHaveBeenCalledWith({
    environmentId: "device",
    input: { instanceId: "account" },
  });
  expect(renderer.root.findByType("button").props.disabled).toBe(true);
  await act(async () => {
    resolve({
      _tag: "Success",
      value: { outcome: "noCredit", warning: "Balance refresh failed." },
    });
    await pending;
  });
  expect(renderer.root.findByType("button").children.join("")).toBe(
    "No reset credit left. Balance refresh failed.",
  );
  expect(renderer.root.findByType("button").props.disabled).toBe(false);
});

it("allows a retry after an uncertain request fails", async () => {
  consume.mockResolvedValueOnce({
    _tag: "Failure",
    cause: { error: new Error("Connection lost") },
  });
  consume.mockResolvedValueOnce({ _tag: "Success", value: { outcome: "alreadyRedeemed" } });
  await act(() => {
    renderer = create(<Harness />);
  });
  await act(() => renderer.root.findByType("button").props.onClick());
  expect(renderer.root.findByType("button").children.join("")).toBe("Connection lost");
  await act(() => renderer.root.findByType("button").props.onClick());
  expect(renderer.root.findByType("button").children.join("")).toBe(
    "That credit was already redeemed.",
  );
  expect(consume).toHaveBeenCalledTimes(2);
});
