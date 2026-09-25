import { type ReactNode, useLayoutEffect } from "react";

import {
  RIGHT_PANEL_SHEET_CLASS_NAME,
  RIGHT_PANEL_SHEET_LAYER_CLASS_NAME,
} from "../rightPanelLayout";
import { useResizeDrag } from "~/hooks/useResizeDrag";
import { cn } from "~/lib/utils";
import { RightPanelResizeHandle } from "./preview/RightPanelResizeHandle";
import { clampSidePanelWidth, useColumnsSidePanel } from "./spaces/columnsPanel";
import { Sheet, SheetPopup } from "./ui/sheet";

export function RightPanelSheet(props: {
  animationDurationMs: number;
  children: ReactNode;
  open: boolean;
  underFloatingPreview?: boolean;
  /**
   * Columns mode's side panel, owned by this chat key: no backdrop, clicks
   * outside neither close it nor get blocked, it never takes focus, the left
   * edge resizes it, and the board is told it is showing so no column sits
   * underneath.
   */
  sidePanelOwner?: string | null;
  onClose: () => void;
}) {
  const sidePanelOwner = props.sidePanelOwner ?? null;
  const side = sidePanelOwner !== null;
  const width = clampSidePanelWidth(useColumnsSidePanel((state) => state.width));
  const resizeHandlers = useResizeDrag<HTMLElement>(() => ({
    width,
    edge: "left",
    resize(value) {
      const next = clampSidePanelWidth(value);
      useColumnsSidePanel.getState().setWidth(next);
      return next;
    },
    // Commit once at drag-end to avoid 60Hz localStorage writes.
    finish: () => useColumnsSidePanel.getState().persistWidth(),
  }));
  const showSidePanel = side && props.open;
  useLayoutEffect(() => {
    if (!showSidePanel || sidePanelOwner === null) return;
    useColumnsSidePanel.getState().show(sidePanelOwner);
    return () => useColumnsSidePanel.getState().hide(sidePanelOwner);
  }, [showSidePanel, sidePanelOwner]);
  return (
    <Sheet
      open={props.open}
      modal={!side}
      disablePointerDismissal={side}
      onOpenChange={(open, details) => {
        if (open) return;
        // The side panel stays put while the reader works in the columns: a
        // non-modal dialog would also close on focus leaving it or on Escape
        // pressed in a composer. Only Escape inside the panel closes it; any
        // other Escape is handed back untouched to the page's own handlers.
        if (
          side &&
          !(
            details.reason === "escape-key" &&
            details.event.target instanceof Element &&
            details.event.target.closest('[data-slot="sheet-popup"]') !== null
          )
        ) {
          details.cancel();
          details.allowPropagation();
          return;
        }
        props.onClose();
      }}
    >
      <SheetPopup
        transitionDurationMs={props.animationDurationMs}
        side="right"
        showCloseButton={false}
        keepMounted
        backdropClassName={cn(
          props.underFloatingPreview && RIGHT_PANEL_SHEET_LAYER_CLASS_NAME,
          side && "hidden",
        )}
        viewportClassName={cn(
          props.underFloatingPreview && RIGHT_PANEL_SHEET_LAYER_CLASS_NAME,
          // The viewport spans the window; let clicks reach the columns beside the panel.
          side && "pointer-events-none",
        )}
        className={cn(RIGHT_PANEL_SHEET_CLASS_NAME, side && "pointer-events-auto")}
        {...(side
          ? { style: { width, maxWidth: "none" }, initialFocus: false, finalFocus: false }
          : {})}
      >
        {side ? <RightPanelResizeHandle handlers={resizeHandlers} /> : null}
        {props.children}
      </SheetPopup>
    </Sheet>
  );
}
