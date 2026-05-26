# Small Model Consultant for Pi

A Pi package for workflows where a small/local worker model does most coding work and can consult a larger model for advice.

## Features

- `consult_expert` tool calls a configured larger model.
- `consult_session` sends the current Pi conversation branch and failure signals to the consultant for recovery guidance.
- Default consultant: `openai-codex/gpt-5.5`.
- `record_lesson` stores durable project-local lessons.
- Relevant lessons are injected into future turns.
- Conservative nudges warn about repeated tool errors and high context usage.
- `consultant-policy` skill teaches worker models when to consult and when to record lessons.

## Install locally

```bash
pi install ./
```

For temporary testing without changing your normal Pi settings:

```bash
PI_CODING_AGENT_DIR="$(mktemp -d)" pi install ./
```

## Consultant model configuration

Defaults:

```text
openai-codex/gpt-5.5
```

Configuration uses hardcoded defaults plus optional JSON config files.

| File | Scope |
| --- | --- |
| `~/.pi/agent/consultant.json` | Global |
| `.pi/consultant/config.json` | Project-local, overrides global |

Example config:

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

Project config overrides global config. Invalid config files are ignored with console errors.

Authenticate with Pi before using subscription models:

```text
/login
```

Select OpenAI/Codex if needed.

## Usage

Ask the worker model to use the policy skill or rely on automatic skill loading:

```text
Use the consultant-policy skill while working on this task.
```

Manual consultation example:

```text
Use consult_expert. Question: Why might this TypeScript test fail with module not found? Context: I added extensions/foo.ts and imported it from test/foo.test.ts. Attempted: checked the path once. Desired output: likely causes and next diagnostics.
```

Session consultation example:

```text
Use consult_session with reason "repeated edit validation failures" and focus "recover safely and give next exact steps".
```

`consult_session` sends the current Pi conversation branch, tool calls/results already present in the session, compaction summaries, and detected failure signals to the configured consultant model. It does not automatically read additional project files from disk. Use the optional `maxEntries` tool argument only when you explicitly want to cap session context for privacy or cost.

Record a lesson after verified success:

```text
Use record_lesson with title "Run targeted tests first", problem "Full suite output hid the useful failure", successfulApproach "Run the smallest failing test first", confidence "high", tags ["testing"].
```

## Memory

Project lessons are stored at:

```text
.pi/consultant/lessons.jsonl
```

Review this file before committing. Add `.pi/consultant/` to `.gitignore` if lessons may contain project-private details.

## Safety

The consultant has no tool access. It only sees context explicitly supplied to `consult_expert`, current conversation-branch context gathered by `consult_session`, or compact lesson snippets injected by this extension.

Do not send secrets, credentials, private keys, `.env` contents, or unrelated full files to the consultant.
