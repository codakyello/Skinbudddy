# Conversation Context Pipeline Overview

## 1. Session Lifecycle
- **Client sends** `POST /api/chat` with `{ message, sessionId? }`.
- **API** checks for a `sessionId`. If missing, it calls `api.conversation.createSession` to create a Convex record and returns the new id.
- Each browser refresh (or explicit reset) means the client omits the id, creating a fresh session so the backend and UI stay aligned.

## 2. Persisting Messages
- The API appends the user’s message via `api.conversation.appendMessage`.
- The mutation stores message metadata (role, tokens, tier) and returns a flag indicating whether summaries should be recomputed.
- When `needsSummary` is true, the API triggers `api.conversation.recomputeSummaries` (an action) to update mid-range and historical summaries.

## 3. Building Context for the LLM
- The API requests `api.conversation.getContext`, which returns:
  - Rolling historical summary (if any)
  - Mid-range summary (recent past)
  - Pinned messages
  - Semantically relevant older snippets (based on Jaccard similarity)
  - Recent full messages (last N)
- The query also enforces the configured token budget by trimming least-recent messages if needed.

## 4. Calling the Model
- `callOpenAI` now accepts a preassembled message array (system prompt + context).
- It still manages MCP tool calls, looping until the model produces a textual answer.

## 5. Storing Assistant Replies
- After getting the reply, the API appends it via `api.conversation.appendMessage`.
- If the assistant message triggers `needsSummary`, the API runs `recomputeSummaries` again.
- The response payload includes `{ sessionId, reply, context }` so the client can display the answer and store the session id.

## 6. Supporting Utilities
- `context/config.ts` centralises tunable parameters (token budget, recent window, summary intervals, semantic thresholds).
- `convex/_utils/token.ts` offers a lightweight token estimator to avoid extra dependencies (swap in tiktoken later if desired).
- Internal Convex helpers `conversation.getSummarySource` and `conversation.applySummaries` split the summarisation pipeline between the action and mutation layers.

## 7. Frontend Responsibilities
- Persist the returned `sessionId` in client state so subsequent messages run in the same session.
- Drop the id (or call `resetSession`) to start over.
- Update UI rendering to consume `reply` and optionally inspect the returned context (e.g., for debugging or future features).
