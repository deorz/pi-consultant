import type { ConsultExpertInput, Lesson } from "./types.js";

export const CONSULTANT_SYSTEM_PROMPT = `You are a senior coding consultant advising a smaller local coding agent.

You do not have tool access. You only know the context explicitly provided in the prompt. Do not claim that you inspected files, ran commands, or verified behavior unless the provided context says so.

Give concise, actionable advice. Prefer:
- likely causes;
- next diagnostic steps;
- recommended implementation path;
- risks and checks before claiming success.

If the supplied context is insufficient, say exactly what information the worker should gather next. Do not ask for secrets or unnecessary private data.`;

export function buildConsultantUserPrompt(input: ConsultExpertInput): string {
  return [
    `## Question\n${input.question}`,
    input.context ? `## Context\n${input.context}` : undefined,
    input.attempted ? `## Attempted\n${input.attempted}` : undefined,
    input.desiredOutput ? `## Desired Output\n${input.desiredOutput}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

export function formatLessonsForInjection(lessons: Lesson[]): string {
  if (lessons.length === 0) return "";
  const lines = lessons.map((lesson, index) => {
    const tags = lesson.tags && lesson.tags.length > 0 ? ` Tags: ${lesson.tags.join(", ")}.` : "";
    return `${index + 1}. ${lesson.title}: ${lesson.successfulApproach} Confidence: ${lesson.confidence}.${tags}`;
  });
  return [
    "Relevant learned lessons from this project:",
    ...lines,
    "Apply these lessons only when they are relevant. Do not treat them as proof; verify locally.",
  ].join("\n");
}

export function buildContextPressureNudge(percent: number): string {
  return `Consultant workflow nudge: context usage is approximately ${Math.round(percent * 100)}%. Call consult_session for a compact recovery/continuation plan before continuing.`;
}

export function buildRepeatedErrorNudge(): string {
  return 'Consultant workflow nudge: multiple tool errors occurred recently. Stop guessing and call consult_session with reason "repeated tool errors".';
}

export const SESSION_CONSULTANT_SYSTEM_PROMPT = `You are a senior supervisor for a smaller local coding agent.

You do not have tool access. You only know the session transcript and metadata explicitly provided in the prompt. Do not claim that you inspected files, ran commands, or verified behavior beyond that transcript.

Analyze the session as an agent recovery problem. Identify:
1. Current user goal.
2. What went wrong in the worker's process.
3. Current known project/session state.
4. Recovery plan.
5. Next 3 exact safe steps for the worker.
6. What not to do.
7. Whether to record a lesson later.

Be concise and operational. If the worker should stop and ask the user, say so. Distinguish true errors from harmless no-match results such as grep/rg exit code 1 with no output.`;

export function buildSessionConsultantUserPrompt(transcript: string): string {
  return [
    "Please analyze this Pi coding-agent session and provide recovery guidance.",
    transcript,
  ].join("\n\n");
}

export function buildSessionConsultNudge(reason: string): string {
  return `Consultant workflow nudge: the session appears stuck or risky (${reason}). Call consult_session now with a short reason and optional focus. Do not continue guessing or asking permission for safe next steps.`;
}
