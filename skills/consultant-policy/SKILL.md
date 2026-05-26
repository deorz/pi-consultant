---
name: consultant-policy
description: Use when working as a small/local model with the pi-consultant Pi extension. Guides when to call consult_expert/consult_session, how to minimize disclosure, and when to record reusable lessons.
---

# Consultant Policy

Use this workflow when you are the primary worker model and the `consult_expert`, `consult_session`, and `record_lesson` tools are available.

## Default Behavior

Work independently first. Use normal local tools to inspect files, run targeted commands, and make small verified changes.

When the next safe step is clear, execute it yourself with available tools instead of asking the user to do it. Use the right tool for the object and task: inspect directories with listing/search tools, inspect files with file-reading tools, and run targeted read-only diagnostics when they are relevant.

Treat `grep`/`rg` exit code 1 with no output as "no matches found", not as a tool failure.

Do not call the consultant for routine file reading, obvious syntax fixes, or simple command failures with clear next steps.

## Tool Discipline

Only call tools that are actually available in the tool list. For this package, the expected tools are `consult_expert`, `consult_session`, and `record_lesson`.

Tool arguments must match the schema exactly. Do not add explanatory fields such as `reason` unless the tool schema includes them.

If a tool call fails validation or returns an error, do not claim success. Read the error, correct the next attempt, or change strategy.

## Coding Guardrails

When modifying code, follow these rules regardless of language, framework, or file type:

1. Understand before editing. Identify and read the real source files that define the behavior you need to change. Do not edit guessed paths or placeholder locations.
2. Prefer targeted edits over full rewrites. Use full-file writes only when you intentionally replace the entire file and have enough context to preserve required content.
3. Do not invent placeholder code and present it as implementation. If a placeholder is unavoidable, explicitly say it is incomplete and stop before claiming progress.
4. After every failed tool call, update your understanding. Do not claim the tool succeeded. Do not continue with the same assumption that caused the failure.
5. After code changes, run the smallest relevant verification command available for the project, such as a targeted test, build, typecheck, or compile command.
6. Do not claim a task is complete unless verification has run and the output supports the claim.
7. If verification fails and the cause is not obvious after local inspection, use the appropriate consultation mode with the failing output, changed files, and attempted fix.

## Consultation Modes

Use `consult_expert` for focused questions when you can provide compact, accurate context yourself.

Use `consult_session` when:

- you are stuck or confused about session state;
- repeated tool failures occurred;
- the user corrected your process;
- you cannot accurately summarize what happened;
- context usage is high;
- you received a nudge recommending session consultation;
- you are about to continue guessing.

For `consult_session`, provide only a short `reason` and optional `focus`. The extension gathers recent session transcript and tool results automatically.

## How to Call `consult_expert`

If the user explicitly asks you to consult the expert, do not ask the user to fill out the consultation form when enough context is already available. Build the consultation brief yourself from the current task, recent tool results, errors, attempted actions, and known constraints. Ask a clarifying question only when the missing information is essential and cannot be gathered with safe local tools.

Send only the minimum context needed. Never include secrets, tokens, private keys, `.env` contents, or unrelated full files.

Include:

- the exact question;
- compact task context;
- relevant error output or snippets;
- what you already tried;
- the kind of answer you need.

Good consultant question shape:

```text
Question: Why might this test still fail after changing X?
Context: We changed A in file B. The failing output is C. Relevant function is D.
Attempted: Tried E and F; E caused G, F had no effect.
Desired output: Give likely root causes and the next two diagnostics to run.
```

## How to Use Consultant Advice

Treat consultant advice as guidance, not proof. The consultant has no tool access and may have incomplete context.

After receiving advice:

1. If the consultant gives safe diagnostic/read-only commands, execute those commands yourself with available tools instead of asking the user to run them.
2. Check the advice against local files and command output.
3. Make the smallest reasonable change.
4. Run targeted verification.
5. Only claim success after evidence from local verification.

Do not merely summarize consultant commands back to the user. Use the consultant advice to continue the task.

If `consult_session` returns a recovery plan, follow the next exact safe steps unless they conflict with user instructions or local evidence.

## When to Record Lessons

Call `record_lesson` after you resolved and verified a reusable problem pattern, especially when:

- you initially used a wrong tool or workflow and then learned the correct one;
- consultant advice helped resolve the issue;
- a repeated error or nudge led to a durable correction;
- the user explicitly corrected your workflow.

Record a lesson only if it would help future work. Good lessons are short, actionable, and trigger-based:

```text
When seeing X, first check Y. Avoid Z because it caused A. Verified fix was B.
```

Do not record guesses, unverified theories, one-off task details, secrets, or long notes.

When calling `record_lesson`, `confidence` must be exactly one of these lowercase values: `low`, `medium`, or `high`. If `record_lesson` fails validation, fix the arguments and retry or report the failure honestly.

## Responding to Injected Lessons

If relevant learned lessons appear in context, consider them before choosing a strategy. Apply them only when relevant and verify locally.
