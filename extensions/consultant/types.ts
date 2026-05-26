export type Confidence = "low" | "medium" | "high";

export interface ConsultantConfig {
  provider: string;
  model: string;
  maxTokens: number;
  lessonInjectionLimit: number;
  contextWarningThreshold: number;
  autoSessionConsult: boolean;
  failureNudgeThreshold: number;
}

export interface LessonInput {
  title: string;
  problem: string;
  rootCause?: string;
  failedApproaches?: string[];
  successfulApproach: string;
  triggersForFuture?: string[];
  confidence: Confidence;
  tags?: string[];
}

export interface Lesson extends LessonInput {
  id: string;
  createdAt: string;
}

export interface ConsultExpertInput {
  question: string;
  context?: string;
  attempted?: string;
  desiredOutput?: string;
}

export interface ConsultSessionInput {
  reason: string;
  focus?: string;
  maxEntries?: number;
}

export type FailureSignalKind =
  | "invalid_tool"
  | "validation_error"
  | "edit_failure"
  | "missing_path"
  | "tool_error"
  | "permission_loop"
  | "context_pressure";

export interface FailureSignal {
  kind: FailureSignalKind;
  summary: string;
  evidence?: string;
}

export interface SessionContextUsageSnapshot {
  tokens: number;
  contextWindow: number;
  percent: number;
}

export interface SessionContextSnapshot {
  cwd: string;
  workerModel?: string;
  consultantModel: string;
  contextUsage?: SessionContextUsageSnapshot;
  entries: unknown[];
  failureSignals: FailureSignal[];
  reason: string;
  focus?: string;
  maxEntries?: number;
}
