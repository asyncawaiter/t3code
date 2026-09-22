import * as Schema from "effect/Schema";
import { ChatBoard, type Profile } from "@t3tools/contracts";

const LegacyLayout = Schema.Struct({
  order: Schema.Array(Schema.String),
  hidden: Schema.Array(Schema.String),
  kept: Schema.Array(Schema.String),
});
const Strings = Schema.Array(Schema.String);
const Widths = Schema.Record(Schema.String, Schema.Finite);

const decodeLayout = Schema.decodeUnknownSync(LegacyLayout);
const decodeStrings = Schema.decodeUnknownSync(Strings);
const decodeWidths = Schema.decodeUnknownSync(Widths);
const decodeBoard = Schema.decodeUnknownSync(ChatBoard);

/** Original keys stay intact. Durable import IDs make retries and later visits idempotent. */
export function readLegacyChatBoards(storage: Storage, profiles: readonly Profile[]): ChatBoard[] {
  const scopes = new Set<string>();
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith("t3.chat-columns.")) continue;
    const suffix = key.slice("t3.chat-columns.".length);
    if (suffix.startsWith("scroll.")) continue;
    scopes.add(suffix.replace(/^(added|widths)\./, ""));
  }
  return [...scopes].sort().map((scope) => {
    const read = (prefix: string) =>
      JSON.parse(storage.getItem(`t3.chat-columns.${prefix}${scope}`) ?? "null");
    const raw = read("");
    const layout = raw === null ? { order: [], hidden: [], kept: [] } : decodeLayout(raw);
    const added = decodeStrings(read("added.") ?? []);
    const widths = decodeWidths(read("widths.") ?? {});
    const identityKey = `t3.columns-import-id.${scope}`;
    let id = storage.getItem(identityKey);
    if (!id) {
      id = `import-${crypto.randomUUID()}`;
      storage.setItem(identityKey, id);
    }
    const owner = profiles.find((profile) => scope.startsWith(`${profile.id}:`));
    const space = owner?.spaces?.find((space) => scope === `${owner.id}:${space.id}`);
    return decodeBoard({
      id,
      name: `Imported ${space?.name ?? owner?.name ?? "columns"}`.slice(0, 100),
      ...layout,
      order: [...new Set([...layout.order, ...added])],
      widths: Object.fromEntries(
        Object.entries(widths).map(([key, width]) => [key, Math.max(340, Math.min(1000, width))]),
      ),
    });
  });
}
