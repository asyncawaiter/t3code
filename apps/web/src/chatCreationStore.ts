import { ALL_PROFILE_ID } from "@t3tools/contracts";
import { useUiStateStore } from "./uiStateStore";
import { OUTSIDE_SPACES } from "./components/sidebar/Spaces.logic";
import { create } from "zustand";
import type { EnvironmentId, ProjectId, ScopedProjectRef, ThreadId } from "@t3tools/contracts";
import type { DraftId } from "./composerDraftStore";

export interface ChatCreationRequest {
  scope?: { profileId: string; spaceId?: string | undefined; unsorted: boolean };
  projectRef?: ScopedProjectRef;
  /** The chat whose setup a new chat copies: profile, space, project, device, working mode. */
  source?: {
    environmentId: EnvironmentId;
    threadId: ThreadId;
    projectId: ProjectId;
    worktreePath: string | null;
  };
  /**
   * Start from the focused chat (source), else the last new chat's location,
   * instead of the sidebar's profile and space. Set by the columns board.
   */
  followFocus?: boolean;
  /** Open without waiting for confirmation when the copied setup is ready. */
  instant?: boolean;
  draftId?: DraftId;
  onCreated?: (draft: {
    draftId: DraftId;
    threadId: ThreadId;
    projectRef: ScopedProjectRef;
  }) => Promise<void>;
}
export const useChatCreationStore = create<{ request: ChatCreationRequest | null }>(() => ({
  request: null,
}));
export function openChatCreation(request: ChatCreationRequest = {}) {
  useChatCreationStore.setState({ request });
}

export function revealChatLocation(profileId: string, spaceId: string | null) {
  useUiStateStore.setState({
    activeProfileId: profileId,
    spaceSelection: {
      profileId,
      filter: spaceId ?? (profileId === ALL_PROFILE_ID ? null : OUTSIDE_SPACES),
    },
  });
  window.dispatchEvent(new Event("t3:chat-location-changed"));
}
