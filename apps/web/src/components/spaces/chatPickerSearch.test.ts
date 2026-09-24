import { expect, it } from "vite-plus/test";
import { scoreChatPickerMatch } from "./chatPickerSearch";

const rank = (query: string, chats: Array<[string, string[]]>) =>
  chats
    .map(([title, context]) => ({ title, score: scoreChatPickerMatch(title, context, query) }))
    .filter((chat) => chat.score !== null)
    .toSorted((a, b) => a.score! - b.score!)
    .map((chat) => chat.title);

it("matches visible labels only and ranks title hits first", () => {
  const chats: Array<[string, string[]]> = [
    ["New chat", ["Unsorted", "thoughts", "godel"]],
    ["Build docker image", ["POD", "Docs"]],
    ["Agent Design Documentation", ["POD", "POD"]],
    ["Planning", ["Docs space", "repo"]],
  ];
  expect(rank("doc", chats)).toEqual([
    "Build docker image",
    "Agent Design Documentation",
    "Planning",
  ]);
  expect(rank("design doc", chats)).toEqual(["Agent Design Documentation"]);
  expect(rank("adoc", chats)).toEqual(["Agent Design Documentation"]);
  expect(rank("  ", chats)).toHaveLength(4);
});
