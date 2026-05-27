export interface ContextUsageLike {
  tokens?: number;
  contextWindow?: number;
}

export function shouldWarnForContextUsage(usage: ContextUsageLike | undefined, threshold: number): boolean {
  if (!usage || typeof usage.tokens !== "number" || typeof usage.contextWindow !== "number") return false;
  if (usage.contextWindow <= 0) return false;
  return usage.tokens / usage.contextWindow >= threshold;
}

export function isHarmlessNoMatchBashError(command: string | undefined, output: string): boolean {
  if (!command) return false;
  const trimmedCommand = command.trim();
  const looksLikeSearch = /^(grep|rg)(\s|$)/.test(trimmedCommand);
  if (!looksLikeSearch) return false;

  const normalizedOutput = output.trim().toLowerCase();
  return normalizedOutput === "command exited with code 1" || normalizedOutput === "(no output)\n\ncommand exited with code 1";
}

export function shouldEscalateToSessionConsult(failureCount: number, threshold: number): boolean {
  return failureCount >= threshold;
}
