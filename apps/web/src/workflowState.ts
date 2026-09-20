import * as Schema from "effect/Schema";
import { create } from "zustand";
import { persist } from "zustand/middleware";

const WorkflowData = Schema.Struct({
  recentThreads: Schema.Array(Schema.String),
  profileThreads: Schema.Record(Schema.String, Schema.String),
  profileScroll: Schema.Record(Schema.String, Schema.Finite),
  reviewed: Schema.Record(Schema.String, Schema.String),
  kept: Schema.Record(Schema.String, Schema.String),
  triageQueue: Schema.Array(Schema.String),
  triageProfileId: Schema.optional(Schema.String),
  triageSpaceId: Schema.optional(Schema.String),
  triageUnsorted: Schema.optional(Schema.Boolean),
  triageScoped: Schema.optional(Schema.Boolean),
  dashboardScroll: Schema.Finite,
});
type WorkflowData = typeof WorkflowData.Type;
const decodeWorkflowData = Schema.decodeUnknownSync(WorkflowData);
const empty: WorkflowData = {
  recentThreads: [],
  profileThreads: {},
  profileScroll: {},
  reviewed: {},
  kept: {},
  triageQueue: [],
  dashboardScroll: 0,
};

export function recordWorkflowVisit(
  state: WorkflowData,
  key: string,
  profileId: string,
): WorkflowData {
  return {
    ...state,
    recentThreads: [key, ...state.recentThreads.filter((item) => item !== key)].slice(0, 20),
    profileThreads: { ...state.profileThreads, [profileId]: key },
  };
}

export const useWorkflowState = create<
  WorkflowData & {
    visit: (key: string, profileId: string) => void;
    review: (key: string, completion: string, keep: boolean) => void;
  }
>()(
  persist(
    (set) => ({
      ...empty,
      visit: (key, profileId) => set((state) => recordWorkflowVisit(state, key, profileId)),
      review: (key, completion, keep) =>
        set((state) => {
          const reviewed = { ...state.reviewed };
          const kept = { ...state.kept };
          if (keep) {
            kept[key] = completion;
            delete reviewed[key];
          } else {
            reviewed[key] = completion;
            delete kept[key];
          }
          return { reviewed, kept };
        }),
    }),
    {
      name: "t3.workflow.v1",
      merge: (stored, current) => {
        try {
          return { ...current, ...decodeWorkflowData(stored) };
        } catch {
          return current;
        }
      },
    },
  ),
);
