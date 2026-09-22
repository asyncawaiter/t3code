import * as Schema from "effect/Schema";
import * as Equal from "effect/Equal";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

const Keys = Schema.Array(Schema.String.check(Schema.isMaxLength(300))).check(
  Schema.isMaxLength(500),
);
export const ChatBoard = Schema.Struct({
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  order: Keys,
  hidden: Keys,
  kept: Keys,
  labels: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        title: Schema.String.check(Schema.isMaxLength(500)),
        context: Schema.String.check(Schema.isMaxLength(1500)),
      }),
    ),
  ),
  widths: Schema.Record(
    Schema.String,
    Schema.Finite.check(Schema.isBetween({ minimum: 340, maximum: 1000 })),
  ),
});
export type ChatBoard = typeof ChatBoard.Type;
export const ChatBoards = Schema.Array(ChatBoard).check(Schema.isMaxLength(100));
const decodeBoards = Schema.decodeUnknownSync(ChatBoards);
export const DEFAULT_CHAT_BOARD: ChatBoard = {
  id: "default",
  name: "Columns",
  order: [],
  hidden: [],
  kept: [],
  widths: {},
};

/** Independent boards merge; concurrent edits to one board must never silently replace each other. */
export function mergeChatBoards(
  current: readonly ChatBoard[],
  base: readonly ChatBoard[],
  edited: readonly ChatBoard[],
) {
  const before = new Map(base.map((board) => [board.id, board]));
  const after = new Map(edited.map((board) => [board.id, board]));
  const live = new Map(current.map((board) => [board.id, board]));
  if (after.size !== edited.length) throw new Error("Board IDs must be unique.");
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(id),
      next = after.get(id),
      existing = live.get(id);
    if (Equal.equals(previous, next) || Equal.equals(existing, next)) continue;
    if (!Equal.equals(existing, previous))
      throw new Error(
        "This board changed on another device. Review the latest arrangement and try again.",
      );
    if (next) live.set(id, next);
    else if (id === "default") throw new Error("The default Columns board cannot be deleted.");
    else live.delete(id);
  }
  const result = decodeBoards([...live.values()]);
  if (new TextEncoder().encode(JSON.stringify(result)).length > 2_000_000)
    throw new Error(
      "Saved boards have reached the 2 MB limit. Remove unused boards or chats before adding more.",
    );
  return result;
}
