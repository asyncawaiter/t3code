import { useEffect, useRef } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { isEditableFocused } from "../lib/editableFocus";
import { isCommandPaletteOpen } from "../commandPaletteBus";

/** Popups that own Escape themselves; the docked side panel stays open and does not. */
const ESCAPE_OWNERS =
  '[role="dialog"][data-open]:not([data-slot="sheet-popup"]), [role="alertdialog"][data-open], [role="dialog"][aria-modal="true"], [role="menu"], [role="listbox"]';

/**
 * Escape on the dashboard returns to wherever the user was before opening it (Cmd+Shift+H,
 * the sidebar button, the palette), with that page's history state so columns refocus.
 */
export function DashboardReturnHost() {
  const router = useRouter();
  const location = useLocation();
  const onDashboard = location.pathname === "/dashboard";
  const before = useRef<{ href: string; state: Record<string, unknown> } | null>(null);
  useEffect(() => {
    if (onDashboard) return;
    // The router assigns its own entry keys; carrying the old ones over would confuse it.
    const state = Object.fromEntries(
      Object.entries(location.state).filter(([key]) => !key.startsWith("__TSR")),
    );
    before.current = { href: location.href, state };
  }, [onDashboard, location.href, location.state]);

  useEffect(() => {
    if (!onDashboard) return;
    // Decided at capture time, before a popup's own Escape handler closes it.
    let eligible = false;
    const check = (event: KeyboardEvent) => {
      eligible =
        event.key === "Escape" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !isEditableFocused(event.target) &&
        !isCommandPaletteOpen() &&
        !document.querySelector(ESCAPE_OWNERS);
    };
    // Acted on after bubbling, so anything on the page that handles Escape goes first.
    const goBack = (event: KeyboardEvent) => {
      const back = before.current;
      if (!eligible || event.defaultPrevented || !back) return;
      event.preventDefault();
      void router.navigate({ href: back.href, state: back.state });
    };
    window.addEventListener("keydown", check, true);
    window.addEventListener("keydown", goBack);
    return () => {
      window.removeEventListener("keydown", check, true);
      window.removeEventListener("keydown", goBack);
    };
  }, [onDashboard, router]);
  return null;
}
