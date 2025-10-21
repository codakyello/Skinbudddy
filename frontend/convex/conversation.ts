import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_CONTEXT_CONFIG } from "../context/config";
import { countTextTokens } from "./_utils/token";
import type { Id } from "./_generated/dataModel";
import OpenAI from "openai";
import { internal } from "./_generated/api";

type ConversationRole = "user" | "assistant" | "system" | "tool";

type ResolvedConfig = typeof DEFAULT_CONTEXT_CONFIG;

const SUMMARISER_MODEL = "gpt-4o-mini";

function resolveConfig(raw?: any): ResolvedConfig {
  if (!raw) return { ...DEFAULT_CONTEXT_CONFIG };
  return {
    ...DEFAULT_CONTEXT_CONFIG,
    ...raw,
  } as ResolvedConfig;
}

function now() {
  return Date.now();
}

function tokensFromMessages(messages: Array<{ content: string }>): number {
  return messages.reduce((total, msg) => total + countTextTokens(msg.content), 0);
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenise(text: string): Set<string> {
  if (!text) return new Set();
  const normalised = normalise(text);
  return new Set(normalised.split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersect = 0;
  for (const token of a) {
    if (b.has(token)) intersect += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union ? intersect / union : 0;
}

async function fetchMessages(
  db: any,
  sessionId: Id<"conversationSessions">
) {
  return await db
    .query("conversationMessages")
    .withIndex("by_sessionId_index", (q: any) => q.eq("sessionId", sessionId))
    .order("asc")
    .collect();
}

async function updateMessageTiers(
  ctx: any,
  sessionId: Id<"conversationSessions">,
  config: ResolvedConfig
) {
  const messages = await fetchMessages(ctx.db, sessionId);
  const total = messages.length;
  if (!total) return messages;

  const recentStart = Math.max(0, total - config.recentMessageCount);
  const midStart = Math.max(0, recentStart - config.midRangeWindow);

  await Promise.all(
    messages.map(async (message: any, idx: number) => {
      let tier: "recent" | "mid" | "historical";
      if (idx >= recentStart) tier = "recent";
      else if (idx >= midStart) tier = "mid";
      else tier = "historical";
      const previousTier = message.tier;
      if (previousTier !== tier) {
        await ctx.db.patch(message._id, { tier });
      }
      message.tier = tier;
    })
  );

  return messages;
}

async function generateSummaryText(
  snippets: Array<{ role: string; content: string }>,
  focus: "mid" | "historical",
  maxTokens: number
): Promise<string | undefined> {
  if (!snippets.length) return undefined;
  const body = snippets
    .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
    .join("\n");

  const truncated = body.slice(-8000);

  const systemPrompt =
    focus === "mid"
      ? "You summarise the latest portion of a skincare shopping assistant conversation. Capture actionable requests, clarifications, and unresolved questions in under 120 words."
      : "You maintain a rolling high-level summary of a skincare shopping assistant conversation. Capture enduring facts, preferences, and decisions in under 200 words.";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback: crude summary using simple truncation.
    return truncated.slice(-Math.min(truncated.length, maxTokens * 4));
  }

  const client = new OpenAI({ apiKey });
  try {
    const isGPT5 = /(^|\b)gpt-5(\b|\-)/i.test(SUMMARISER_MODEL);
    const resp = await client.responses.create({
      model: SUMMARISER_MODEL,
      store: false,
      include: ["reasoning.encrypted_content"],
      ...(isGPT5 ? { reasoning: { effort: "medium" as const } } : {}),
      input: [
        { role: "system", type: "message", content: systemPrompt },
        {
          role: "user",
          type: "message",
          content: `Summarise the following snippets:\n\n${truncated}`,
        },
      ],
      ...(isGPT5 ? { temperature: 1 as const } : { temperature: 0.2 }),
      max_output_tokens: Math.min(maxTokens, 600),
    });
    const content = (resp as any).output_text?.trim?.();
    return content || truncated.slice(0, maxTokens * 4);
  } catch (error) {
    console.warn("summary generation failed", error);
    return truncated.slice(0, maxTokens * 4);
  }
}

export const createSession = mutation({
  args: {
    userId: v.optional(v.string()),
    config: v.optional(v.any()),
  },
  handler: async (ctx, { userId, config }) => {
    const nowTs = now();
    const sessionId = await ctx.db.insert("conversationSessions", {
      userId,
      pinnedMessageIds: [],
      rollingSummary: undefined,
      rollingSummaryTokens: 0,
      midSummary: undefined,
      midSummaryTokens: 0,
      totalTokens: 0,
      messageCount: 0,
      lastSummaryAt: undefined,
      config: config ?? null,
      createdAt: nowTs,
      updatedAt: nowTs,
    });
    return { sessionId };
  },
});

export const appendMessage = mutation({
  args: {
    sessionId: v.id("conversationSessions"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("tool")
    ),
    content: v.string(),
    pinned: v.optional(v.boolean()),
  },
  handler: async (ctx, { sessionId, role, content, pinned }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const config = resolveConfig(session.config);
    const nowTs = now();
    const tokens = countTextTokens(content);
    const index = session.messageCount;

    const messageId = await ctx.db.insert("conversationMessages", {
      sessionId,
      index,
      role,
      content,
      tokens,
      pinned: pinned ?? false,
      tier: "recent",
      createdAt: nowTs,
    });

    const pinnedIds = new Set<Id<"conversationMessages">>(
      session.pinnedMessageIds ?? []
    );
    if (pinned) {
      if (pinnedIds.size >= config.pinnedMessageLimit) {
        // drop the oldest pinned entry to make room
        const first = pinnedIds.values().next().value;
        if (first) pinnedIds.delete(first);
      }
      pinnedIds.add(messageId);
    }

    await ctx.db.patch(sessionId, {
      messageCount: session.messageCount + 1,
      totalTokens: session.totalTokens + tokens,
      pinnedMessageIds: Array.from(pinnedIds),
      updatedAt: nowTs,
    });

    const messages = await updateMessageTiers(ctx, sessionId, config);

    const newCount = session.messageCount + 1;
    const shouldSummarise =
      role === "assistant" &&
      newCount >= config.recentMessageCount &&
      newCount % config.summaryUpdateInterval === 0;

    return {
      sessionId,
      messageId,
      tokens,
      needsSummary: shouldSummarise,
      messageCount: messages.length,
    };
  },
});

export const recomputeSummaries = action({
  args: {
    sessionId: v.id("conversationSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const source = await ctx.runQuery(internal.conversation.getSummarySource, {
      sessionId,
    });
    if (!source) return { updated: false };

    const { session, messages } = source;
    const config = resolveConfig(session.config);
    const total = messages.length;
    if (!total) return { updated: false };

    const recentStart = Math.max(0, total - config.recentMessageCount);
    const midStart = Math.max(0, recentStart - config.midRangeWindow);

    const midMessages = messages.slice(midStart, recentStart);
    const historicalMessages = messages.slice(0, midStart);

    const midSummarySource = midMessages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));
    const historicalSource = historicalMessages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));

    const [midSummary, historicalSummary] = await Promise.all([
      generateSummaryText(midSummarySource, "mid", config.maxSummaryTokens),
      generateSummaryText(
        session.rollingSummary
          ? [
              { role: "summary", content: session.rollingSummary },
              ...historicalSource,
            ]
          : historicalSource,
        "historical",
        config.maxSummaryTokens
      ),
    ]);

    await ctx.runMutation(internal.conversation.applySummaries, {
      sessionId,
      midSummary: midSummary ?? undefined,
      historicalSummary: historicalSummary ?? undefined,
      midStart,
      recentStart,
    });

    return { updated: true };
  },
});

async function upsertSummaryRecord(
  ctx: any,
  sessionId: Id<"conversationSessions">,
  tier: "mid" | "historical",
  summary: string | undefined,
  rangeStart: number,
  rangeEnd: number
) {
  const existing = await ctx.db
    .query("conversationSummaries")
    .withIndex("by_sessionId_tier", (q: any) =>
      q.eq("sessionId", sessionId).eq("tier", tier)
    )
    .unique();

  if (!summary) {
    if (existing) await ctx.db.delete(existing._id);
    return;
  }

  const payload = {
    summary,
    tokens: countTextTokens(summary),
    rangeStart,
    rangeEnd,
    createdAt: now(),
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
  } else {
    await ctx.db.insert("conversationSummaries", {
      sessionId,
      tier,
      ...payload,
    });
  }
}

export const getSummarySource = internalQuery({
  args: {
    sessionId: v.id("conversationSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    const messages = await fetchMessages(ctx.db, sessionId);
    return { session, messages };
  },
});

export const applySummaries = internalMutation({
  args: {
    sessionId: v.id("conversationSessions"),
    midSummary: v.optional(v.string()),
    historicalSummary: v.optional(v.string()),
    midStart: v.number(),
    recentStart: v.number(),
  },
  handler: async (
    ctx,
    { sessionId, midSummary, historicalSummary, midStart, recentStart }
  ) => {
    const nowTs = now();
    await ctx.db.patch(sessionId, {
      midSummary: midSummary ?? undefined,
      midSummaryTokens: midSummary ? countTextTokens(midSummary) : 0,
      rollingSummary: historicalSummary ?? undefined,
      rollingSummaryTokens: historicalSummary
        ? countTextTokens(historicalSummary)
        : 0,
      lastSummaryAt: nowTs,
      updatedAt: nowTs,
    });

    await upsertSummaryRecord(
      ctx,
      sessionId,
      "mid",
      midSummary,
      midStart,
      recentStart - 1
    );
    await upsertSummaryRecord(ctx, sessionId, "historical", historicalSummary, 0, midStart - 1);
  },
});

type ContextMessage = {
  role: ConversationRole;
  content: string;
  tokens: number;
  category: "summary" | "pinned" | "semantic" | "recent";
  messageId?: Id<"conversationMessages">;
};

export const getContext = query({
  args: {
    sessionId: v.id("conversationSessions"),
    configOverride: v.optional(v.any()),
  },
  handler: async (ctx, { sessionId, configOverride }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const config = resolveConfig(configOverride ?? session.config);
    const messages = await fetchMessages(ctx.db, sessionId);

    const pinnedSet = new Set<Id<"conversationMessages">>(
      session.pinnedMessageIds ?? []
    );
    const recentStart = Math.max(0, messages.length - config.recentMessageCount);

    const includedRecent = messages.slice(recentStart);
    const includedRecentIds = new Set<Id<"conversationMessages">>(
      includedRecent.map((msg: any) => msg._id)
    );

    const assembled: ContextMessage[] = [];

    if (session.rollingSummary) {
      const content = `Historical summary:\n${session.rollingSummary}`;
      assembled.push({
        role: "system",
        content,
        tokens: countTextTokens(content),
        category: "summary",
      });
    }

    if (session.midSummary) {
      const content = `Recent context:\n${session.midSummary}`;
      assembled.push({
        role: "system",
        content,
        tokens: countTextTokens(content),
        category: "summary",
      });
    }

    const pinnedMessages = messages.filter((msg: any) => pinnedSet.has(msg._id));
    pinnedMessages.sort((a: any, b: any) => a.index - b.index);
    const pinnedIds = new Set<Id<"conversationMessages">>(
      pinnedMessages.map((msg: any) => msg._id)
    );

    for (const msg of pinnedMessages) {
      const tokens = countTextTokens(msg.content);
      assembled.push({
        role: msg.role,
        content: msg.content,
        tokens,
        category: "pinned",
        messageId: msg._id,
      });
    }

    const lastUser = [...messages]
      .reverse()
      .find((msg: any) => msg.role === "user");
    const lastUserTokens = tokenise(lastUser?.content ?? "");

    const semanticCandidates = messages.filter((msg: any) => {
      if (pinnedIds.has(msg._id)) return false;
      if (includedRecentIds.has(msg._id)) return false;
      return msg.role !== "system";
    });

    type ScoredMessage = { msg: any; score: number };
    const semanticRanked = (semanticCandidates as any[])
      .map<ScoredMessage>((msg: any) => ({
        msg,
        score: jaccard(lastUserTokens, tokenise(msg.content)),
      }))
      .filter((item: ScoredMessage) => item.score >= config.semanticSimilarityThreshold)
      .sort(
        (a: ScoredMessage, b: ScoredMessage) => b.score - a.score
      )
      .slice(0, config.semanticCandidateLimit)
      .map((item: ScoredMessage) => item.msg);

    const semanticIds = new Set<Id<"conversationMessages">>(
      semanticRanked.map((msg: any) => msg._id)
    );

    for (const msg of semanticRanked) {
      const tokens = countTextTokens(msg.content);
      assembled.push({
        role: msg.role,
        content: msg.content,
        tokens,
        category: "semantic",
        messageId: msg._id,
      });
    }

    for (const msg of includedRecent) {
      const tokens = countTextTokens(msg.content);
      assembled.push({
        role: msg.role,
        content: msg.content,
        tokens,
        category: "recent",
        messageId: msg._id,
      });
    }

    let totalTokens = assembled.reduce((total, item) => total + item.tokens, 0);
    if (totalTokens > config.maxContextTokens) {
      // Trim oldest recent messages first.
      for (let i = assembled.length - 1; i >= 0 && totalTokens > config.maxContextTokens; i--) {
        const item = assembled[i];
        if (item.category !== "recent") continue;
        assembled.splice(i, 1);
        totalTokens -= item.tokens;
      }
    }

    return {
      sessionId,
      messages: assembled.map(({ role, content }) => ({ role, content })),
      tokenCount: totalTokens,
      pinnedIds: Array.from(pinnedIds),
      semanticIds: Array.from(semanticIds),
    };
  },
});

export const resetSession = mutation({
  args: {
    sessionId: v.id("conversationSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const messages = await fetchMessages(ctx.db, sessionId);
    await Promise.all(messages.map((msg: any) => ctx.db.delete(msg._id)));
    await ctx.db.patch(sessionId, {
      pinnedMessageIds: [],
      rollingSummary: undefined,
      rollingSummaryTokens: 0,
      midSummary: undefined,
      midSummaryTokens: 0,
      totalTokens: 0,
      messageCount: 0,
      lastSummaryAt: undefined,
      updatedAt: now(),
    });
    const summaries = await ctx.db
      .query("conversationSummaries")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", sessionId))
      .collect();
    await Promise.all(summaries.map((record: any) => ctx.db.delete(record._id)));
  },
});
