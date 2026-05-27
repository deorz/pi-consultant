---
name: consultant-policy
description: Use only when the user explicitly asks to use the consultant-policy skill, invokes /skill:consultant-policy, or asks for pi-consultant policy. Covers consult_expert, consult_session, record_lesson, disclosure, advice handling, and lessons.
---

# Consultant Policy

Use this workflow when you are the primary worker model and the `consult_expert`, `consult_session`, and `record_lesson` tools are available.

## Scope

This skill only covers the `pi-consultant` extension workflow. It explains when to use the extension tools, how much context to disclose, how to treat consultant advice, and when to record lessons.

Do not call the consultant for routine questions, obvious fixes, or simple errors where the next step is already clear.

## Extension Tools

Use only the `pi-consultant` tools that are available in the current session:

- `consult_expert` — focused advice from the configured consultant model.
- `consult_session` — recovery guidance using the current Pi conversation branch gathered by the extension.
- `record_lesson` — project-local reusable lessons after verified success.

Tool arguments must match each tool schema exactly.

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

For `consult_session`, provide only a short `reason` and optional `focus`. The extension gathers the current Pi conversation branch and existing tool results automatically. Use `maxEntries` only when an explicit privacy or cost cap is needed.

## How to Call `consult_expert`

Send only the minimum context needed for the question. Never include secrets, tokens, private keys, `.env` contents, or unrelated full files.

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

Check advice against local evidence before acting on it. If `consult_session` returns a recovery plan, use it as guidance unless it conflicts with user instructions or local evidence.

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
