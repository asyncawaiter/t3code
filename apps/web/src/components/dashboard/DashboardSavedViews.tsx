import { useState } from "react";
import * as Schema from "effect/Schema";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverTrigger, PopoverPopup } from "../ui/popover";
import { toastManager } from "../ui/toast";
import { BookmarkIcon, XIcon } from "lucide-react";

export const DashboardView = Schema.Struct({
  profileId: Schema.String,
  space: Schema.String,
  project: Schema.String,
  device: Schema.NullOr(Schema.String),
  provider: Schema.String,
  search: Schema.String,
  branch: Schema.String,
  pr: Schema.Literals(["all", "linked", "none"]),
  visibility: Schema.Literals(["active", "snoozed", "settled", "archived"]),
  group: Schema.Literals(["state", "space", "project"]),
  recent: Schema.Boolean,
});
export type DashboardView = typeof DashboardView.Type;
const SavedView = Schema.Struct({ name: Schema.String, view: DashboardView });
const SavedViews = Schema.Array(SavedView);

export function DashboardSavedViews({
  current,
  onApply,
}: {
  current: DashboardView;
  onApply: (view: DashboardView) => void;
}) {
  const [views, setViews] = useLocalStorage("t3.dashboard.savedViews", [], SavedViews);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const matching = views.find((item) => JSON.stringify(item.view) === JSON.stringify(current));
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setViews((previous) => [
      ...previous.filter((item) => item.name !== trimmed),
      { name: trimmed, view: current },
    ]);
    setName("");
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button size="xs" variant="ghost" className="max-w-48 gap-1.5 text-xs" />}
      >
        <BookmarkIcon className="size-3.5 shrink-0" />
        <span className="truncate">{matching?.name ?? "Saved views"}</span>
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-72" viewportClassName="p-3">
        <div className="mb-2 text-sm font-medium">Saved views</div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {views.map((item) => (
            <div className="flex items-center gap-1" key={item.name}>
              <Button
                size="xs"
                variant="ghost"
                className="min-w-0 flex-1 justify-start"
                onClick={() => {
                  onApply(item.view);
                  setOpen(false);
                }}
              >
                <span className="truncate">{item.name}</span>
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Delete view ${item.name}`}
                onClick={() => {
                  setViews((previous) => previous.filter((view) => view.name !== item.name));
                  toastManager.add({
                    title: `Deleted view ${item.name}`,
                    timeout: 5000,
                    actionProps: {
                      children: "Undo",
                      onClick: () =>
                        setViews((previous) =>
                          previous.some((view) => view.name === item.name)
                            ? previous
                            : [...previous, item],
                        ),
                    },
                  });
                }}
              >
                <XIcon className="size-3" />
              </Button>
            </div>
          ))}
          {!views.length ? (
            <p className="py-2 text-xs text-muted-foreground">
              Save a combination of scope, filters and grouping.
            </p>
          ) : null}
        </div>
        <form
          className="mt-3 flex gap-2 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Input
            size="compact"
            aria-label="View name"
            placeholder="Name this view"
            maxLength={64}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" size="xs" variant="outline" disabled={!name.trim()}>
            {views.some((item) => item.name === name.trim()) ? "Replace" : "Save"}
          </Button>
        </form>
      </PopoverPopup>
    </Popover>
  );
}
