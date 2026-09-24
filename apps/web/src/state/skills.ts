import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

/**
 * Skill inventory of one environment: every provider instance's installed skills with content
 * hashes. Fetched only while the Skills page is open; nothing about skills is pushed.
 */
export const skillInventory = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:skills:list",
  tag: WS_METHODS.skillsList,
  staleTimeMs: 15_000,
  idleTtlMs: 60_000,
});

export const skillBundle = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:skills:read",
  tag: WS_METHODS.skillsRead,
  staleTimeMs: 15_000,
  idleTtlMs: 60_000,
});

export const writeSkill = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:skills:write",
  tag: WS_METHODS.skillsWrite,
});

export const removeSkill = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:skills:remove",
  tag: WS_METHODS.skillsRemove,
});

export const restoreSkill = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:skills:restore",
  tag: WS_METHODS.skillsRestore,
});
