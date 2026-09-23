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
import {
  readLegacyChatBoards,
  visibleChatBoards,
  chatBoardArrangement,
  isRecoveredChatBoard,
} from "../components/spaces/chatBoardMigration";

const EMPTY: readonly ChatBoard[] = [];
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
  const persisted = source.config?.settings.chatBoards ?? cache;
  const boards = visibleChatBoards(
    persisted.some((board) => board.id === "default")
      ? persisted
      : [DEFAULT_CHAT_BOARD, ...persisted],
  );
  const activeId = boardId ?? selected;
  const previous = persisted.find((board) => board.id === activeId);
  const board =
    boards.find((board) => board.id === activeId) ??
    (previous &&
      boards.find((board) => chatBoardArrangement(board) === chatBoardArrangement(previous))) ??
    boards.find((board) => board.id === "default")!;
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
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
      if (busy.current) return false;
      if (unavailable || !source.sourceId) {
        setError(unavailable);
        return false;
      }
      busy.current = true;
      setPending(true);
      setError(null);
      try {
        const current = appAtomRegistry.get(profileSourceAtom);
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
        setCache(result.value.chatBoards ?? []);
        return true;
      } catch (error) {
        setError(
          error instanceof ServerSettingsError && error.cause instanceof Error
            ? error.cause.message
            : error instanceof Error
              ? error.message
              : "Board changes could not be saved. Reconnect and try again.",
        );
        return false;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [persist, setCache, source.sourceId, source.config, unavailable],
  );
  const imported = useRef<string | null>(null);
  useEffect(() => {
    if (unavailable || !source.sourceId || imported.current === source.sourceId) return;
    imported.current = source.sourceId;
    const marker = `t3.columns-imported.${source.sourceId}`;
    try {
      if (localStorage.getItem(marker)) return;
      const previous = readLegacyChatBoards(localStorage, source.profiles);
      const missing = previous.filter(
        (board) =>
          !persisted.some(
            (saved) =>
              saved.id === board.id || chatBoardArrangement(saved) === chatBoardArrangement(board),
          ),
      );
      if (!missing.length) {
        localStorage.setItem(marker, "true");
        return;
      }
      void Promise.resolve()
        .then(() => save(missing, []))
        .then((saved) => {
          if (saved) localStorage.setItem(marker, "true");
        })
        .catch(() =>
          setError(
            "Previous boards are safe locally, but the import could not be recorded. Reopen Columns to retry.",
          ),
        );
    } catch {
      setError(
        "Previous boards could not be imported. Their original local settings have been kept.",
      );
    }
  }, [unavailable, source.sourceId, source.profiles, persisted, save]);
  const update = (next: ChatBoard) =>
    save(
      [next],
      persisted.filter((item) => item.id === next.id),
    );
  return {
    boards,
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
        persisted.filter(
          (saved) =>
            saved.id === item.id ||
            (isRecoveredChatBoard(item) &&
              isRecoveredChatBoard(saved) &&
              chatBoardArrangement(saved) === chatBoardArrangement(item)),
        ),
      ),
  };
}
