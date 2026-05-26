# pi-consultant Current State

Date: 2026-05-26

This document is the canonical description of the current `pi-consultant` extension behavior. Older specs, ADRs, and plans may describe earlier designs; use this file and `README.md` as the current source of truth.

## Package Shape

`pi-consultant` is an installable Pi package.

Relevant package resources:

```json
{
  "name": "pi-consultant",
  "pi": {
    "extensions": ["./extensions/consultant.ts"],
    "skills": ["./skills"]
  }
}
```

The manifest points at the concrete extension entry file so helper modules under `extensions/consultant/` are not loaded as standalone extensions.

## Runtime Tools

The extension registers three tools.

### `consult_expert`

Focused advice from the configured consultant model. The worker supplies the context manually.

Input:

```ts
{
  question: string,
  context?: string,
  attempted?: string,
  desiredOutput?: string
}
```

The consultant has no tool access and sees only the supplied fields.

### `consult_session`

Broad recovery guidance using the current Pi conversation branch gathered by the extension.

Input:

```ts
{
  reason: string,
  focus?: string,
  maxEntries?: number
}
```

`maxEntries` is optional and is only a per-call cap for privacy or cost control. If omitted, the extension serializes the full current Pi conversation branch.

### `record_lesson`

Stores a project-local reusable lesson after a verified success.

Input:

```ts
{
  title: string,
  problem: string,
  rootCause?: string,
  failedApproaches?: string[],
  successfulApproach: string,
  triggersForFuture?: string[],
  confidence: "low" | "medium" | "high",
  tags?: string[]
}
```

Lessons are stored at `.pi/consultant/lessons.jsonl`.

## Consultant Model Configuration

Configuration is file-based with hardcoded defaults.

Defaults:

```json
{
  "provider": "openai-codex",
  "model": "gpt-5.5",
  "maxTokens": 4096,
  "lessonInjectionLimit": 3,
  "contextWarningThreshold": 0.75,
  "autoSessionConsult": false,
  "failureNudgeThreshold": 2
}
```

Config files:

| File | Scope |
| --- | --- |
| `~/.pi/agent/consultant.json` | Global |
| `.pi/consultant/config.json` | Project-local, overrides global |

Merge order:

1. hardcoded defaults;
2. global config;
3. project config.

Config files are validated with TypeBox. Invalid or malformed config files are ignored and logged with a `[pi-consultant]` message.

## Session Consultation Context

`consult_session` uses Pi session state only. It does not read arbitrary project files from disk.

The session prompt contains:

- current working directory;
- worker model, if available;
- configured consultant model;
- context usage, if available;
- caller-provided `reason` and optional `focus`;
- detected failure signals from existing tool results;
- Pi-native serialized conversation history from `ctx.sessionManager.getBranch()`.

Conversation history is converted with Pi's `convertToLlm(...)` and serialized with `serializeConversation(...)`. Compaction summaries, branch summaries, custom messages, user messages, assistant messages, tool calls, and tool results are preserved where Pi's conversion supports them.

## Nudges and Automatic Session Advice

The extension is nudge-first by default. Remote session consultation is automatic only when `autoSessionConsult` is set to `true` in config.

Implemented nudge sources:

- high context usage at or above `contextWarningThreshold`;
- repeated process failures such as invalid tool calls, tool-schema validation errors, edit target misses, or missing paths;
- repeated generic tool errors.

Shell search no-match handling is intentionally special-cased: `grep` or `rg` exit code 1 with no output is treated as a harmless no-match result, not as a process failure.

The extension does not use language-specific test-output text heuristics and does not use prompt-wording heuristics for continuation detection.

## Lessons

Before each agent turn, the extension searches `.pi/consultant/lessons.jsonl` for lessons relevant to the new user prompt. It injects up to `lessonInjectionLimit` compact lesson snippets.

Lesson matching is simple keyword/tag scoring. Lessons are advisory; the worker should apply them only when relevant and verify locally.

## `consultant-policy` Skill

The bundled `consultant-policy` skill is intentionally narrow. It only covers how to use `pi-consultant` tools, how much context to disclose, how to treat consultant advice, and when to record lessons.

The skill description is explicit-use oriented: it should be loaded when the user asks to use the `consultant-policy` skill, invokes `/skill:consultant-policy`, or asks for `pi-consultant` policy.

The skill does not contain broad coding guardrails or generic tool-use rules.

## Privacy Boundaries

The consultant is advice-only and has no tool access.

The consultant sees only:

- fields supplied to `consult_expert`;
- current Pi conversation-branch context gathered by `consult_session`;
- compact lesson snippets injected into the worker context;
- metadata and failure signals derived from existing session entries.

Do not include secrets, credentials, private keys, `.env` contents, or unrelated full files in manual consultation context or lessons.

## Verification Commands

Primary local check:

```bash
npm run check
```

Package smoke install:

```bash
PI_CODING_AGENT_DIR="$(mktemp -d)" pi install ./
```

Extension startup smoke in an already authenticated Pi setup:

```bash
pi -e ./extensions/consultant.ts startup exit 0
```
