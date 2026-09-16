import {
  appendBrowsePathSegment,
  ensureBrowseDirectoryPath,
} from "@t3tools/client-runtime/state/projects";

/** A new folder is a single child of the directory confirmed by the selected device. */
export function newProjectFolderPath(parentPath: string, name: string, platform: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || /[/\\\x00-\x1f]/.test(trimmed)) {
    throw new Error("Enter a folder name without slashes or control characters.");
  }
  if (
    platform === "win32" &&
    (/[<>:"|?*]|[. ]$/.test(trimmed) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(trimmed))
  ) {
    throw new Error("This folder name is not supported on Windows.");
  }
  return appendBrowsePathSegment(ensureBrowseDirectoryPath(parentPath), trimmed).replace(
    /[/\\]$/,
    "",
  );
}

export {
  appendBrowsePathSegment,
  canNavigateUp,
  ensureBrowseDirectoryPath,
  findProjectByPath,
  getBrowseDirectoryPath,
  getBrowseLeafPathSegment,
  getBrowseParentPath,
  hasTrailingPathSeparator,
  inferProjectTitleFromPath,
  isExplicitRelativeProjectPath,
  isFilesystemBrowseQuery,
  isUnsupportedWindowsProjectPath,
  normalizeProjectPathForComparison,
  normalizeProjectPathForDispatch,
  resolveProjectPathForDispatch,
} from "@t3tools/client-runtime/state/projects";
