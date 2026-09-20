import { request } from "../rpc/client.ts";
import { type EnvironmentId, type ProjectReadFileResult, WS_METHODS } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Crypto from "effect/Crypto";
import { Atom } from "effect/unstable/reactivity";

import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentQueryAtomFamily,
} from "./runtime.ts";
import {
  type CreateProjectInput,
  type DeleteProjectInput,
  type UpdateProjectInput,
  createProject,
  deleteProject,
  updateProject,
} from "../operations/commands.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";

export type {
  CreateProjectInput,
  DeleteProjectInput,
  UpdateProjectInput,
} from "../operations/commands.ts";

export interface OptimisticProjectFile {
  readonly data: ProjectReadFileResult;
  readonly confirmedAgainst: object | null | undefined;
}

export interface OptimisticProjectFileTarget {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
}

function optimisticProjectFileKey(target: OptimisticProjectFileTarget): string {
  return JSON.stringify([target.environmentId, target.cwd, target.relativePath]);
}

export const loadProjectInstructions = Effect.fn("loadProjectInstructions")(function* (input: {
  cwd: string;
}) {
  return yield* request(WS_METHODS.projectsInstructions, input).pipe(
    Effect.catchCause(
      Effect.fn(function* (cause) {
        // Older connected devices report an unknown method as a string defect.
        if (Cause.squash(cause) !== `Unknown request tag: ${WS_METHODS.projectsInstructions}`)
          return yield* Effect.failCause(cause);
        return yield* request(WS_METHODS.projectsListEntries, input).pipe(
          Effect.map((listing) => ({
            files: listing.entries
              .filter(
                (entry) =>
                  entry.kind === "file" &&
                  (/(?:^|[/\\])(?:AGENTS(?:\.override)?\.md|CLAUDE\.md|GEMINI\.md|\.cursorrules)$/.test(
                    entry.path,
                  ) ||
                    /(?:^|[/\\])\.(?:cursor|claude)[/\\]rules[/\\].*\.(?:md|mdc)$/.test(
                      entry.path,
                    )),
              )
              .map((entry) => ({
                path: `${input.cwd.replace(/[/\\]+$/, "")}/${entry.path}`,
                scope: /[/\\]/.test(entry.path) ? ("subfolder" as const) : ("root" as const),
              })),
            truncated: listing.truncated,
            warnings: [
              "This device runs an older T3 server. Showing indexed instruction files only. Update T3 on this device to include parent and ignored instruction files.",
            ],
            excludedDirectories: [],
          })),
        );
      }),
    ),
  );
});

export function createProjectEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Crypto.Crypto | R, E>,
) {
  const projectScheduler = createAtomCommandScheduler();
  const fileScheduler = createAtomCommandScheduler();
  const optimisticFileFamily = Atom.family((key: string) =>
    Atom.make<OptimisticProjectFile | null>(null).pipe(
      Atom.withLabel(`environment-data:projects:optimistic-file:${key}`),
    ),
  );
  const projectConcurrency = {
    mode: "serial" as const,
    key: ({ environmentId, input }: { environmentId: string; input: { projectId: string } }) =>
      JSON.stringify([environmentId, input.projectId]),
  };
  return {
    instructions: createEnvironmentQueryAtomFamily(runtime, {
      label: "environment-data:projects:instructions",
      execute: loadProjectInstructions,
      staleTimeMs: 30_000,
      idleTtlMs: 60_000,
    }),
    searchEntries: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:projects:search-entries",
      tag: WS_METHODS.projectsSearchEntries,
      staleTimeMs: 15_000,
    }),
    listEntries: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:projects:list-entries",
      tag: WS_METHODS.projectsListEntries,
      staleTimeMs: 30_000,
      idleTtlMs: 5 * 60_000,
    }),
    readFile: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:projects:read-file",
      tag: WS_METHODS.projectsReadFile,
      staleTimeMs: 30_000,
      idleTtlMs: 5 * 60_000,
    }),
    optimisticFile: (target: OptimisticProjectFileTarget) =>
      optimisticFileFamily(optimisticProjectFileKey(target)),
    create: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:create",
      execute: (input: CreateProjectInput) => createProject(input),
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    update: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:update",
      execute: (input: UpdateProjectInput) => updateProject(input),
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    delete: createEnvironmentCommand(runtime, {
      label: "environment-data:commands:project:delete",
      execute: (input: DeleteProjectInput) => deleteProject(input),
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    writeFile: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:projects:write-file",
      tag: WS_METHODS.projectsWriteFile,
      scheduler: fileScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) =>
          JSON.stringify([environmentId, input.cwd, input.relativePath]),
      },
    }),
  };
}
