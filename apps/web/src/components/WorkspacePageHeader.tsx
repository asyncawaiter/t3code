import type { ComponentPropsWithoutRef } from "react";

import { WorkspaceViews } from "./spaces/WorkspaceViews";
import { cn } from "../lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";

/** Shared workspace top-bar geometry. */
export function WorkspacePageHeader({
  electron = false,
  embedded = false,
  workspaceViews = false,
  children,
  reserveNativeControls = electron,
  className,
  ...props
}: ComponentPropsWithoutRef<"header"> & {
  readonly electron?: boolean;
  readonly embedded?: boolean;
  readonly workspaceViews?: boolean;
  readonly reserveNativeControls?: boolean;
}) {
  return (
    <>
      <header
        className={cn(
          "flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 pl-[calc(env(safe-area-inset-left)+0.75rem)] pr-[calc(env(safe-area-inset-right)+0.75rem)] [[data-panel-animations=true]_&]:motion-safe:transition-[padding-left,padding-right] [[data-panel-animations=true]_&]:motion-safe:[transition-duration:var(--panel-animation-duration)] [[data-panel-animations=true]_&]:motion-safe:ease-out sm:pl-[calc(env(safe-area-inset-left)+1.25rem)] sm:pr-[calc(env(safe-area-inset-right)+1.25rem)]",
          electron && "drag-region",
          reserveNativeControls && "wco:pr-[var(--workspace-native-controls-inset)]",
          !embedded && COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          !embedded && "[[data-columns-rail=true]_&]:pl-[var(--workspace-rail-inset)]",
          className,
        )}
        {...props}
      >
        {children}
      </header>
      {workspaceViews && <WorkspaceViews />}
    </>
  );
}
