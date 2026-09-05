# Forking a chat

Fork a chat when you want to try something different from a point in the conversation without
disturbing the original. Forking opens a new chat that starts from that point, while the source
chat keeps running untouched.

## Starting a fork

New forks append a numbered suffix to the original title, such as `Fix login (fork 1)`
and `Fix login (fork 2)`. Forking a fork continues the numbering without stacking
suffixes. You can rename the new chat normally.

On any assistant response, open the fork icon next to **Copy** and choose **Fork in a new tab**.
While a response is still streaming, the same action is available on its working row. Forking
there uses the response as it stands at that moment, even if it has not finished.

Forking opens a new chat and switches you to it right away.

## What the new chat shows

The new chat starts empty. At the top of its timeline, a **Continued from chat** row links back to
the source chat and jumps to the exact message you forked from. Nothing else from the source chat
is shown here: no earlier messages, no tool activity, no plans.

The **Continued from chat** row always links to the source chat. If the source chat was later
deleted, following the link shows the usual not-found view.

On mobile, forking a chat is not available yet, but if a chat was forked elsewhere, the
**Continued from chat** link still appears and works.

## What the agent receives

Even though the new chat looks empty, the agent is not starting from nothing. On your first message
in the new chat, T3 Code sends the agent the prior conversation up through the point you forked
from, as text alongside your message. This includes the user and assistant messages, short
summaries of what tools did, and any plan the assistant proposed. It does not include the
assistant's reasoning or the raw output of tool calls.

Your message itself is sent and saved exactly as you typed it. The prior conversation is added as
context around it, not mixed into what you wrote.

## Switching provider or model

Before you send your first message in the forked chat, you can change the provider or model. The
new chat starts with the same provider, model, and mode as the source chat, but nothing is locked
in until you send that first message.

## When history doesn't all fit

Very long conversations can exceed what fits in a single message to the agent. When that happens,
T3 Code keeps the most recent parts of the conversation and drops the oldest, and shows a notice in
the chat that older history was omitted to fit the input limit.

## Shared files, no separate checkout

A forked chat works in the same checkout as its source: same project, same branch, same working
directory. Edits made in either chat are visible in both. Forking does not create a new worktree,
and you cannot use checkpoint restore to undo one chat's changes without affecting the other.

## The source chat keeps going

Forking never pauses or changes the source chat. It keeps running, and you can keep working in it,
independently of anything that happens in the fork.
