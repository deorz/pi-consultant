import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";
import type { FailureSignal, SessionContextSnapshot } from "./types.js";

type AgentMessage = Parameters<typeof convertToLlm>[0][number];

const MAX_ENTRY_CHARS = 3000;
const MAX_EVIDENCE_CHARS = 500;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[truncated ${text.length - maxChars} chars]`;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

function timestampFromEntry(record: Record<string, unknown>): number {
  const timestamp = typeof record.timestamp === "string" ? Date.parse(record.timestamp) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function entryToAgentMessage(entry: unknown): AgentMessage | undefined {
  const record = asRecord(entry);
  if (!record) return undefined;

  if (record.type === "message") {
    const message = asRecord(record.message);
    return message ? (message as unknown as AgentMessage) : undefined;
  }

  if (record.type === "compaction") {
    return {
      role: "compactionSummary",
      summary: String(record.summary ?? ""),
      tokensBefore: typeof record.tokensBefore === "number" ? record.tokensBefore : 0,
      timestamp: timestampFromEntry(record),
    } as AgentMessage;
  }

  if (record.type === "branch_summary") {
    return {
      role: "branchSummary",
      summary: String(record.summary ?? ""),
      fromId: String(record.fromId ?? ""),
      timestamp: timestampFromEntry(record),
    } as AgentMessage;
  }

  if (record.type === "custom_message") {
    return {
      role: "custom",
      customType: String(record.customType ?? "unknown"),
      content: optionalString(record.content) ?? (Array.isArray(record.content) ? record.content : stringify(record.content ?? "")),
      display: Boolean(record.display),
      details: record.details,
      timestamp: timestampFromEntry(record),
    } as AgentMessage;
  }

  return undefined;
}

export function entriesToAgentMessages(entries: unknown[], maxEntries?: number): AgentMessage[] {
  const selectedEntries = typeof maxEntries === "number" ? entries.slice(-Math.max(1, maxEntries)) : entries;
  return selectedEntries.map(entryToAgentMessage).filter((message): message is AgentMessage => Boolean(message));
}

export function buildConversationHistory(entries: unknown[], maxEntries?: number): string {
  const messages = entriesToAgentMessages(entries, maxEntries);
  return serializeConversation(convertToLlm(messages));
}

export function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return stringify(content ?? "");

  return content
    .map((block) => {
      const record = asRecord(block);
      if (!record) return stringify(block);
      if (record.type === "text") return typeof record.text === "string" ? record.text : "";
      if (record.type === "thinking") return typeof record.thinking === "string" ? `[thinking] ${record.thinking}` : "[thinking]";
      if (record.type === "toolCall") return `[toolCall ${String(record.name ?? "unknown")} ${stringify(record.arguments ?? {})}]`;
      if (record.type === "image") return "[image omitted]";
      return stringify(block);
    })
    .filter(Boolean)
    .join("\n");
}

function formatToolCalls(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    const record = asRecord(block);
    if (!record || record.type !== "toolCall") return [];
    return [`[Tool call: ${String(record.name ?? "unknown")}]\narguments: ${stringify(record.arguments ?? {})}`];
  });
}

export function formatSessionEntry(entry: unknown): string {
  const record = asRecord(entry);
  if (!record) return `[Unknown entry]\n${truncate(stringify(entry), MAX_ENTRY_CHARS)}`;

  if (record.type === "message") {
    const message = asRecord(record.message);
    if (!message) return `[Malformed message]\n${truncate(stringify(entry), MAX_ENTRY_CHARS)}`;
    const role = String(message.role ?? "unknown");
    const body = textFromContent(message.content);

    if (role === "user") return `[User]\n${truncate(body, MAX_ENTRY_CHARS)}`;
    if (role === "assistant") {
      const calls = formatToolCalls(message.content);
      const text = body.replace(/^\[toolCall .+\]$/gm, "").trim();
      return [`[Assistant]`, truncate(text || "[no text]", MAX_ENTRY_CHARS), ...calls].join("\n");
    }
    if (role === "toolResult") {
      const toolName = String(message.toolName ?? "unknown");
      const status = message.isError ? " ERROR" : "";
      return `[Tool result: ${toolName}${status}]\n${truncate(body, MAX_ENTRY_CHARS)}`;
    }
    return `[Message: ${role}]\n${truncate(body, MAX_ENTRY_CHARS)}`;
  }

  if (record.type === "custom_message") {
    return `[Custom message: ${String(record.customType ?? "unknown")}]\n${truncate(textFromContent(record.content), MAX_ENTRY_CHARS)}`;
  }

  if (record.type === "model_change") return `[Model change]\n${String(record.provider ?? "unknown")}/${String(record.modelId ?? "unknown")}`;
  if (record.type === "thinking_level_change") return `[Thinking level]\n${String(record.thinkingLevel ?? "unknown")}`;
  if (record.type === "compaction") return `[Compaction]\n${truncate(String(record.summary ?? ""), MAX_ENTRY_CHARS)}`;
  if (record.type === "branch_summary") return `[Branch summary]\n${truncate(String(record.summary ?? ""), MAX_ENTRY_CHARS)}`;

  return `[${String(record.type ?? "entry")}]\n${truncate(stringify(record), MAX_ENTRY_CHARS)}`;
}

function evidence(text: string): string {
  return truncate(text.trim(), MAX_EVIDENCE_CHARS);
}

export function detectFailureSignalsFromToolResult(toolName: string, isError: boolean, output: string): FailureSignal[] {
  if (!isError) return [];
  const signals: FailureSignal[] = [];
  const text = output.trim();

  if (/^Tool .+ not found/im.test(text)) {
    signals.push({ kind: "invalid_tool", summary: `Tool not found while calling ${toolName}`, evidence: evidence(text) });
  }
  if (/Validation failed for tool/im.test(text)) {
    signals.push({ kind: "validation_error", summary: `Tool schema validation failed for ${toolName}`, evidence: evidence(text) });
  }
  if (/Could not find the exact text|oldText must match|exact text/i.test(text) && toolName === "edit") {
    signals.push({ kind: "edit_failure", summary: "Edit failed because the target text did not match", evidence: evidence(text) });
  }
  if (/ENOENT|no such file or directory|Could not edit file/i.test(text)) {
    signals.push({ kind: "missing_path", summary: `Tool targeted a missing path via ${toolName}`, evidence: evidence(text) });
  }
  if (signals.length === 0) {
    signals.push({ kind: "tool_error", summary: `Tool ${toolName} returned an error`, evidence: evidence(text) });
  }

  return signals;
}

export function detectFailureSignalsFromEntries(entries: unknown[]): FailureSignal[] {
  const signals: FailureSignal[] = [];
  for (const entry of entries) {
    const record = asRecord(entry);
    if (!record || record.type !== "message") continue;
    const message = asRecord(record.message);
    if (!message || message.role !== "toolResult") continue;
    signals.push(
      ...detectFailureSignalsFromToolResult(
        String(message.toolName ?? "unknown"),
        Boolean(message.isError),
        textFromContent(message.content),
      ),
    );
  }
  return signals;
}

function formatFailureSignals(signals: FailureSignal[]): string {
  if (signals.length === 0) return "- No explicit failure signals detected in selected entries.";
  return signals
    .map((signal) => {
      const evidenceText = signal.evidence ? ` Evidence: ${signal.evidence.replace(/\n/g, " ")}` : "";
      return `- ${signal.kind}: ${signal.summary}.${evidenceText}`;
    })
    .join("\n");
}

export function buildSessionTranscript(snapshot: SessionContextSnapshot): string {
  const usage = snapshot.contextUsage
    ? `${Math.round(snapshot.contextUsage.percent * 100)}% (${snapshot.contextUsage.tokens}/${snapshot.contextUsage.contextWindow} tokens)`
    : "unknown";
  const focus = snapshot.focus ? `\nfocus: ${snapshot.focus}` : "";
  const maxEntries = typeof snapshot.maxEntries === "number" ? Math.max(1, snapshot.maxEntries) : undefined;
  const capLine = maxEntries ? `conversationEntryCap: ${maxEntries}` : "conversationEntryCap: none";
  const conversationHistory = buildConversationHistory(snapshot.entries, maxEntries);

  return [
    "## Session Metadata",
    `cwd: ${snapshot.cwd}`,
    `workerModel: ${snapshot.workerModel ?? "unknown"}`,
    `consultantModel: ${snapshot.consultantModel}`,
    `contextUsage: ${usage}`,
    capLine,
    `reason: ${snapshot.reason}${focus}`,
    "",
    "## Detected Failure Signals",
    formatFailureSignals(snapshot.failureSignals),
    "",
    "## Conversation History",
    conversationHistory || "[No conversation messages available]",
  ].join("\n");
}
