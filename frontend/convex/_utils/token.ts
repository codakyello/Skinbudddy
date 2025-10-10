const AVERAGE_CHAR_PER_TOKEN = 4;

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function countTextTokens(text: string): number {
  if (!text) return 0;
  const normalised = normalise(text);
  if (!normalised) return 0;
  const charEstimate = Math.ceil(normalised.length / AVERAGE_CHAR_PER_TOKEN);
  const wordEstimate = normalised.split(" ").length;
  return Math.max(charEstimate, wordEstimate);
}

export function estimateMessagesTokens(
  messages: Array<{ content: string }>
): number {
  return messages.reduce((total, item) => total + countTextTokens(item.content), 0);
}
