import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isBashToolResult } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { DEFAULT_CONSULTANT_CONFIG, readConsultantConfig } from "./consultant/config.js";
import { appendLesson, findRelevantLessons } from "./consultant/lesson-store.js";
import {
  isHarmlessNoMatchBashError,
  shouldEscalateToSessionConsult,
  shouldWarnForContextUsage,
} from "./consultant/nudges.js";
import {
  buildConsultantUserPrompt,
  buildContextPressureNudge,
  buildRepeatedErrorNudge,
  buildSessionConsultantUserPrompt,
  buildSessionConsultNudge,
  CONSULTANT_SYSTEM_PROMPT,
  formatLessonsForInjection,
  SESSION_CONSULTANT_SYSTEM_PROMPT,
} from "./consultant/prompts.js";
import { buildSessionTranscript, detectFailureSignalsFromEntries, detectFailureSignalsFromToolResult } from "./consultant/session-context.js";
import type { ConsultSessionInput } from "./consultant/types.js";

const ConsultExpertSchema = Type.Object({
  question: Type.String({ description: "The specific question for the consultant." }),
  context: Type.Optional(Type.String({ description: "Compact relevant context, logs, file snippets, or constraints." })),
  attempted: Type.Optional(Type.String({ description: "What the worker already tried and what happened." })),
  desiredOutput: Type.Optional(Type.String({ description: "The kind of answer desired: diagnosis, plan, review, etc." })),
});

type ConsultExpertParams = Static<typeof ConsultExpertSchema>;

const ConsultSessionSchema = Type.Object({
  reason: Type.String({ description: "Why broad session consultation is needed, such as repeated invalid tool calls or context pressure." }),
  focus: Type.Optional(Type.String({ description: "Optional area for the consultant to focus on, such as recovery plan or next safe steps." })),
  maxEntries: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, description: "Optional cap for recent session entries. Omit to include the full current conversation branch." })),
});

type ConsultSessionParams = Static<typeof ConsultSessionSchema>;

const RecordLessonSchema = Type.Object({
  title: Type.String({ description: "Short reusable lesson title." }),
  problem: Type.String({ description: "The problem or recurring failure pattern." }),
  rootCause: Type.Optional(Type.String({ description: "Known root cause, if verified." })),
  failedApproaches: Type.Optional(Type.Array(Type.String(), { description: "Approaches that did not work." })),
  successfulApproach: Type.String({ description: "Verified approach that worked." }),
  triggersForFuture: Type.Optional(Type.Array(Type.String(), { description: "Signals that this lesson may apply in the future." })),
  confidence: Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")]),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Search tags such as testing, models, auth, pi." })),
});

type RecordLessonParams = Static<typeof RecordLessonSchema>;

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} };
}

async function callConsultantModel(
  ctx: ExtensionContext,
  config: ReturnType<typeof readConsultantConfig>,
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const model = ctx.modelRegistry.find(config.provider, config.model);
  if (!model) {
    return `Consultant model not found: ${config.provider}/${config.model}. Run \`pi --list-models ${config.provider}\` to inspect available models, or update ~/.pi/agent/consultant.json or .pi/consultant/config.json.`;
  }

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) return `Consultant auth failed for ${config.provider}/${config.model}: ${auth.error}`;
  if (!auth.apiKey) return `No auth available for ${config.provider}/${config.model}. Run /login for the provider or configure credentials.`;

  const response = await complete(
    model,
    {
      systemPrompt,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: userPrompt }],
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: auth.apiKey,
      headers: auth.headers,
      maxTokens: config.maxTokens,
      signal,
    },
  );

  const text = response.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return text || "Consultant returned an empty response. Continue with local debugging or retry with more focused context.";
}

async function runSessionConsultation(
  params: ConsultSessionInput,
  ctx: ExtensionContext,
  config: ReturnType<typeof readConsultantConfig>,
  signal: AbortSignal | undefined,
): Promise<string> {
  const maxEntries = typeof params.maxEntries === "number" ? Math.max(1, Math.min(200, params.maxEntries)) : undefined;
  const entries = ctx.sessionManager.getBranch();
  const usage = normalizeContextUsage(ctx.getContextUsage());
  const contextUsage = usage && usage.contextWindow > 0
    ? {
        tokens: usage.tokens,
        contextWindow: usage.contextWindow,
        percent: usage.tokens / usage.contextWindow,
      }
    : undefined;

  const transcript = buildSessionTranscript({
    cwd: ctx.cwd,
    workerModel: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
    consultantModel: `${config.provider}/${config.model}`,
    contextUsage,
    entries,
    failureSignals: detectFailureSignalsFromEntries(entries),
    reason: params.reason,
    focus: params.focus,
    maxEntries,
  });

  return callConsultantModel(
    ctx,
    config,
    SESSION_CONSULTANT_SYSTEM_PROMPT,
    buildSessionConsultantUserPrompt(transcript),
    signal,
  );
}

export default function consultantExtension(pi: ExtensionAPI) {
  let config = DEFAULT_CONSULTANT_CONFIG;

  function refreshConfig(ctx: ExtensionContext) {
    config = readConsultantConfig(ctx.cwd);
    return config;
  }

  let consecutiveToolErrors = 0;
  let contextWarningSent = false;
  let sessionFailureCount = 0;
  let sessionConsultNudgeSent = false;

  async function deliverSessionConsultGuidance(reason: string, focus: string, ctx: ExtensionContext, signal: AbortSignal | undefined) {
    if (sessionConsultNudgeSent) return;
    sessionConsultNudgeSent = true;

    if (config.autoSessionConsult) {
      const advice = await runSessionConsultation({ reason, focus }, ctx, config, signal);
      pi.sendMessage(
        { customType: "consultant-session-advice", content: advice, display: true },
        { deliverAs: "steer", triggerTurn: true },
      );
      return;
    }

    pi.sendMessage(
      { customType: "consultant-nudge", content: buildSessionConsultNudge(reason), display: true },
      { deliverAs: "steer", triggerTurn: true },
    );
  }

  pi.registerTool({
    name: "consult_expert",
    label: "Consult Expert",
    description: "Ask a larger consultant model for concise advice. The consultant has no tool access and sees only the supplied context.",
    promptSnippet: "Ask the configured larger consultant model for advice when blocked or uncertain.",
    promptGuidelines: [
      "Use consult_expert only after a local attempt or when uncertainty/risk is high; provide compact context and never include secrets.",
      "After consult_expert returns advice, verify it locally before making success claims.",
    ],
    parameters: ConsultExpertSchema,
    async execute(_toolCallId, params: ConsultExpertParams, signal, _onUpdate, ctx) {
      const currentConfig = refreshConfig(ctx);
      const text = await callConsultantModel(
        ctx,
        currentConfig,
        CONSULTANT_SYSTEM_PROMPT,
        buildConsultantUserPrompt(params),
        signal,
      );
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "consult_session",
    label: "Consult Session",
    description: "Ask the larger consultant model to analyze the current Pi conversation branch, tool results, and failure signals. Sends session context to the configured consultant model.",
    promptSnippet: "Ask the larger consultant model to analyze the current session context and provide a recovery plan.",
    promptGuidelines: [
      "Use consult_session when stuck, after repeated tool failures, after process corrections from the user, or under high context pressure.",
      "Provide only a short reason and optional focus; the extension gathers the current conversation branch automatically.",
      "After consult_session returns guidance, execute concrete safe next steps instead of summarizing commands back to the user.",
    ],
    parameters: ConsultSessionSchema,
    async execute(_toolCallId, params: ConsultSessionParams, signal, _onUpdate, ctx) {
      const currentConfig = refreshConfig(ctx);
      const text = await runSessionConsultation(params, ctx, currentConfig, signal);
      return textResult(text);
    },
  });

  pi.registerTool({
    name: "record_lesson",
    label: "Record Lesson",
    description: "Record a durable project-local lesson after a problem has been resolved and verified.",
    promptSnippet: "Store a short reusable lesson in project-local consultant memory.",
    promptGuidelines: [
      "Use record_lesson only for verified, reusable lessons; keep lessons short, actionable, and free of secrets.",
    ],
    parameters: RecordLessonSchema,
    async execute(_toolCallId, params: RecordLessonParams, _signal, _onUpdate, ctx) {
      refreshConfig(ctx);
      const lesson = await appendLesson(ctx.cwd, params);
      return textResult(`Recorded lesson ${lesson.id}: ${lesson.title}`);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    refreshConfig(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const currentConfig = refreshConfig(ctx);
    sessionConsultNudgeSent = false;

    const lessons = await findRelevantLessons(ctx.cwd, event.prompt, currentConfig.lessonInjectionLimit);
    const lessonText = formatLessonsForInjection(lessons);
    const usage = normalizeContextUsage(ctx.getContextUsage());
    const contextNudge = shouldWarnForContextUsage(usage, currentConfig.contextWarningThreshold) && !contextWarningSent && usage?.tokens && usage.contextWindow
      ? buildContextPressureNudge(usage.tokens / usage.contextWindow)
      : "";

    if (contextNudge) {
      contextWarningSent = true;
      if (currentConfig.autoSessionConsult) {
        await deliverSessionConsultGuidance("context pressure", "produce recovery and continuation plan", ctx, ctx.signal);
      }
    }

    const content = [lessonText, contextNudge].filter(Boolean).join("\n\n");
    if (!content) return;
    return {
      message: {
        customType: "consultant-context",
        content,
        display: true,
      },
    };
  });

  pi.on("tool_result", async (event, ctx) => {
    const currentConfig = refreshConfig(ctx);
    const output = event.content.map((part) => (part.type === "text" ? part.text : "")).join("\n");
    const failureSignals = detectFailureSignalsFromToolResult(event.toolName, event.isError, output);
    const hasProcessFailure = failureSignals.some((signal) =>
      ["invalid_tool", "validation_error", "edit_failure", "missing_path"].includes(signal.kind),
    );

    if (hasProcessFailure) {
      sessionFailureCount += 1;
    } else if (!event.isError) {
      sessionFailureCount = 0;
    }

    if (shouldEscalateToSessionConsult(sessionFailureCount, currentConfig.failureNudgeThreshold)) {
      sessionFailureCount = 0;
      await deliverSessionConsultGuidance("repeated invalid tool calls or schema failures", "diagnose worker process and propose exact recovery steps", ctx, ctx.signal);
      return;
    }

    const command = typeof event.input.command === "string" ? event.input.command : undefined;
    const isHarmlessSearchMiss = isBashToolResult(event) && isHarmlessNoMatchBashError(command, output);

    if (event.isError && !isHarmlessSearchMiss) {
      consecutiveToolErrors += 1;
    } else {
      consecutiveToolErrors = 0;
    }

    if (consecutiveToolErrors >= 2) {
      consecutiveToolErrors = 0;
      pi.sendMessage(
        { customType: "consultant-nudge", content: buildRepeatedErrorNudge(), display: true },
        { deliverAs: "steer", triggerTurn: true },
      );
      return;
    }

    const usage = normalizeContextUsage(ctx.getContextUsage());
    if (shouldWarnForContextUsage(usage, currentConfig.contextWarningThreshold) && !contextWarningSent && usage?.tokens && usage.contextWindow) {
      contextWarningSent = true;
      if (currentConfig.autoSessionConsult) {
        await deliverSessionConsultGuidance("context pressure", "produce recovery and continuation plan", ctx, ctx.signal);
        return;
      }
      pi.sendMessage(
        {
          customType: "consultant-nudge",
          content: buildContextPressureNudge(usage.tokens / usage.contextWindow),
          display: true,
        },
        { deliverAs: "steer", triggerTurn: true },
      );
    }
  });
}

function normalizeContextUsage(usage: { tokens?: number | null; contextWindow?: number | null } | undefined) {
  if (!usage || typeof usage.tokens !== "number" || typeof usage.contextWindow !== "number") return undefined;
  return { tokens: usage.tokens, contextWindow: usage.contextWindow };
}
