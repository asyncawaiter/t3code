import { useAtomValue } from "@effect/atom-react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Schema from "effect/Schema";
import {
  ChatBoards,
  DEFAULT_CHAT_BOARD,
  ServerSettingsError,
  type ChatBoard,
} from "@t3tools/contracts";
import { profileSourceAtom, serverEnvironment } from "../state/server";
import { useEnvironments } from "../state/environments";
import { useAtomCommand } from "../state/use-atom-command";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { useLocalStorage } from "./useLocalStorage";

const EMPTY: readonly ChatBoard[] = [];

/** Boards as shown: saved boards, minus leftover imports, with the default board first. */
export function displayedBoards(persisted: readonly ChatBoard[]) {
  const saved = persisted.filter(
    (board) => !(board.id.startsWith("import-") && board.name.startsWith("Imported ")),
  );
  return saved.some((board) => board.id === "default") ? saved : [DEFAULT_CHAT_BOARD, ...saved];
}

export function useChatBoards(boardId?: string) {
  const source = useAtomValue(profileSourceAtom);
  const { environments } = useEnvironments();
  const [cache, setCache] = useLocalStorage(
    `t3.columns-cache.${source.sourceId}`,
    EMPTY,
    ChatBoards,
  );
  const [selected, setSelected] = useLocalStorage(
    `t3.columns-selected.${source.sourceId}`,
    "default",
    Schema.String,
  );
  // A save's result stands in for the boards until the server's settings push replaces them,
  // so a change made right after a save builds on it instead of on the boards before it.
  const [saved, setSaved] = useState<{
    over: readonly ChatBoard[] | undefined;
    boards: readonly ChatBoard[];
  } | null>(null);
  const configBoards = source.config?.settings.chatBoards;
  const persisted = (saved && saved.over === configBoards ? saved.boards : configBoards) ?? cache;
  const boards = displayedBoards(persisted);
  const activeId = boardId ?? selected;
  const board =
    boards.find((board) => board.id === activeId) ??
    boards.find((board) => board.id === "default")!;
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /** The latest failure, readable right after an awaited save (state lags a render). */
  const lastError = useRef<string | null>(null);
  const connected = environments.some(
    (env) => env.environmentId === source.sourceId && env.connection.phase === "connected",
  );
  const unavailable = source.conflict
    ? "Resolve the shared profile source conflict in Settings before editing boards."
    : !source.sourceId
      ? "Choose a shared profile source in Settings to sync boards."
      : !connected
        ? "Reconnect the shared profile device to edit boards."
        : !source.config?.environment.capabilities.chatBoards
          ? "Update the shared profile device to sync boards."
          : null;
  const persist = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  useEffect(() => {
    if (source.config?.settings.chatBoards) setCache(source.config.settings.chatBoards);
  }, [source.config?.settings.chatBoards, setCache]);
  const save = useCallback(
    async (edited: readonly ChatBoard[], base: readonly ChatBoard[]) => {
      if (busy.current) {
        lastError.current = "Another board change is still saving. Try again in a moment.";
        setError(lastError.current);
        return false;
      }
      if (unavailable || !source.sourceId) {
        lastError.current = unavailable;
        setError(unavailable);
        return false;
      }
      busy.current = true;
      setPending(true);
      setError(null);
      try {
        const current = appAtomRegistry.get(profileSourceAtom);
        // Read before the request: a push landing before the reply then retires the overlay.
        const over = current.config?.settings.chatBoards;
        if (current.sourceId !== source.sourceId || current.conflict)
          throw new Error("The shared profile source changed. Reopen Columns before saving.");
        const result = await persist({
          environmentId: source.sourceId,
          input: {
            patch: { chatBoards: edited },
            baseChatBoards: base,
            expectedProfileSourceId: source.config?.settings.profileSyncSourceId ?? null,
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        const boards = result.value.chatBoards ?? [];
        setCache(boards);
        setSaved({ over, boards });
        lastError.current = null;
        return boards;
      } catch (error) {
        lastError.current =
          Schema.is(ServerSettingsError)(error) && error.cause instanceof Error
            ? error.cause.message
            : error instanceof Error
              ? error.message
              : "Board changes could not be saved. Reconnect and try again.";
        setError(lastError.current);
        return false as const;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [persist, setCache, source.sourceId, source.config, unavailable],
  );
  const update = async (next: ChatBoard) =>
    !!(await save(
      [next],
      persisted.filter((item) => item.id === next.id),
    ));
  return {
    boards,
    /** Boards as saved on the profile source; the base for a multi-board save. */
    persisted,
    lastError,
    board,
    selected,
    setSelected,
    update,
    save,
    pending,
    unavailable,
    error,
    remove: (item: ChatBoard) =>
      save(
        [],
        persisted.filter((saved) => saved.id === item.id),
      ),
  };
}
