export type ContextConfig = {
  maxContextTokens: number;
  recentMessageCount: number;
  summaryUpdateInterval: number;
  midRangeWindow: number;
  maxSummaryTokens: number;
  enableSemanticSearch: boolean;
  pinnedMessageLimit: number;
  semanticCandidateLimit: number;
  semanticSimilarityThreshold: number;
};

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  maxContextTokens: 8000,
  recentMessageCount: 10,
  summaryUpdateInterval: 5,
  midRangeWindow: 20,
  maxSummaryTokens: 500,
  enableSemanticSearch: true,
  pinnedMessageLimit: 5,
  semanticCandidateLimit: 3,
  semanticSimilarityThreshold: 0.25,
};
