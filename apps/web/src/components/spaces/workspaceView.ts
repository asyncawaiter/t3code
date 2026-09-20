export function workspaceView(value: unknown) {
  if (value === "monitor") return "columns";
  return value === "columns" || value === "folders" || value === "branches" ? value : undefined;
}
