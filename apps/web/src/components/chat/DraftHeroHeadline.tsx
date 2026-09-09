import type { DraftId } from "~/composerDraftStore";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { openChatCreation } from "../../chatCreationStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface DraftHeroHeadlineProps {
  readonly draftId: DraftId | null;
  readonly activeProjectRef: ScopedProjectRef | null;
  readonly activeProjectTitle: string | null;
}

export function DraftHeroHeadline({
  draftId,
  activeProjectRef,
  activeProjectTitle,
}: DraftHeroHeadlineProps) {
  return (
    <h1 className="mx-auto w-full max-w-5xl text-center font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
      What should we build in{" "}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Change project"
              onClick={() =>
                openChatCreation({
                  ...(draftId ? { draftId } : {}),
                  ...(activeProjectRef ? { projectRef: activeProjectRef } : {}),
                })
              }
              className="pointer-events-auto inline-block max-w-64 truncate border-foreground/60 border-b border-dotted align-baseline text-foreground transition-colors hover:border-foreground/80 focus-visible:rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          {activeProjectTitle ?? "Choose a project"}
        </TooltipTrigger>
        <TooltipPopup>Change device, folder or space</TooltipPopup>
      </Tooltip>
      ?
    </h1>
  );
}
