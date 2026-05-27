import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationHistory,
  buildSessionTranscript,
  detectFailureSignalsFromEntries,
  detectFailureSignalsFromToolResult,
  formatSessionEntry,
} from "../extensions/consultant/session-context.js";

test("formatSessionEntry formats user, assistant tool calls, and tool errors", () => {
  const user = {
    type: "message",
    message: { role: "user", content: "Add --list-fields" },
  };
  const assistant = {
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "I will edit a file." },
        { type: "toolCall", name: "edit", arguments: { path: "cmd/logcli/logcli" } },
      ],
    },
  };
  const toolResult = {
    type: "message",
    message: {
      role: "toolResult",
      toolName: "edit",
      isError: true,
      content: [{ type: "text", text: "ENOENT: no such file or directory" }],
    },
  };

  assert.match(formatSessionEntry(user), /\[User\]\nAdd --list-fields/);
  assert.match(formatSessionEntry(assistant), /\[Tool call: edit\]/);
  assert.match(formatSessionEntry(toolResult), /\[Tool result: edit ERROR\]/);
  assert.match(formatSessionEntry(toolResult), /ENOENT/);
});

test("detectFailureSignalsFromToolResult detects invalid tools and validation failures", () => {
  const invalidTool = detectFailureSignalsFromToolResult("brainstorming", true, "Tool brainstorming not found");
  assert.equal(invalidTool[0].kind, "invalid_tool");

  const validation = detectFailureSignalsFromToolResult(
    "edit",
    true,
    'Validation failed for tool "edit":\n  - edits.0: must not have additional properties',
  );
  assert.equal(validation[0].kind, "validation_error");

  const editMiss = detectFailureSignalsFromToolResult("edit", true, "Could not find the exact text in internal/logcli/options.go");
  assert.equal(editMiss[0].kind, "edit_failure");

  const missingPath = detectFailureSignalsFromToolResult("read", true, "ENOENT: no such file or directory");
  assert.equal(missingPath[0].kind, "missing_path");
});

test("detectFailureSignalsFromEntries scans recent tool result messages", () => {
  const entries = [
    {
      type: "message",
      message: {
        role: "toolResult",
        toolName: "edit",
        isError: true,
        content: [{ type: "text", text: 'Validation failed for tool "edit"' }],
      },
    },
    {
      type: "message",
      message: {
        role: "toolResult",
        toolName: "bash",
        isError: false,
        content: [{ type: "text", text: "ok" }],
      },
    },
  ];

  const signals = detectFailureSignalsFromEntries(entries);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].kind, "validation_error");
});

test("buildConversationHistory serializes the full branch by default and caps only when requested", () => {
  const entries = [
    {
      type: "message",
      id: "entry-1",
      parentId: null,
      timestamp: "2026-05-25T00:00:00.000Z",
      message: { role: "user", content: "older user request", timestamp: 1779667200000 },
    },
    {
      type: "message",
      id: "entry-2",
      parentId: "entry-1",
      timestamp: "2026-05-25T00:00:01.000Z",
      message: { role: "user", content: "newer user request", timestamp: 1779667201000 },
    },
  ];

  const full = buildConversationHistory(entries);
  const capped = buildConversationHistory(entries, 1);

  assert.match(full, /older user request/);
  assert.match(full, /newer user request/);
  assert.doesNotMatch(capped, /older user request/);
  assert.match(capped, /newer user request/);
});

test("buildSessionTranscript includes metadata, signals, and Pi-native full conversation history", () => {
  const transcript = buildSessionTranscript({
    cwd: "/repo",
    workerModel: "omlx/gemma",
    consultantModel: "openai-codex/gpt-5.5",
    contextUsage: { tokens: 75, contextWindow: 100, percent: 0.75 },
    reason: "repeated validation failures",
    focus: "recover safely",
    failureSignals: [{ kind: "validation_error", summary: "edit schema failed", evidence: "extra field reason" }],
    entries: [
      {
        type: "message",
        id: "entry-1",
        parentId: null,
        timestamp: "2026-05-25T00:00:00.000Z",
        message: { role: "user", content: "older", timestamp: 1779667200000 },
      },
      {
        type: "message",
        id: "entry-2",
        parentId: "entry-1",
        timestamp: "2026-05-25T00:00:01.000Z",
        message: { role: "user", content: "newer", timestamp: 1779667201000 },
      },
    ],
  });

  assert.match(transcript, /cwd: \/repo/);
  assert.match(transcript, /contextUsage: 75%/);
  assert.match(transcript, /edit schema failed/);
  assert.match(transcript, /## Conversation History/);
  assert.match(transcript, /older/);
  assert.match(transcript, /newer/);
});

test("buildSessionTranscript applies maxEntries only when explicitly supplied", () => {
  const transcript = buildSessionTranscript({
    cwd: "/repo",
    consultantModel: "openai-codex/gpt-5.5",
    reason: "focused recovery",
    maxEntries: 1,
    failureSignals: [],
    entries: [
      {
        type: "message",
        id: "entry-1",
        parentId: null,
        timestamp: "2026-05-25T00:00:00.000Z",
        message: { role: "user", content: "older capped message", timestamp: 1779667200000 },
      },
      {
        type: "message",
        id: "entry-2",
        parentId: "entry-1",
        timestamp: "2026-05-25T00:00:01.000Z",
        message: { role: "user", content: "newer capped message", timestamp: 1779667201000 },
      },
    ],
  });

  assert.doesNotMatch(transcript, /older capped message/);
  assert.match(transcript, /newer capped message/);
});
