import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type { ConsultantConfig } from "./types.js";

export const DEFAULT_CONSULTANT_CONFIG: ConsultantConfig = {
  provider: "openai-codex",
  model: "gpt-5.5",
  maxTokens: 4096,
  lessonInjectionLimit: 3,
  contextWarningThreshold: 0.75,
  autoSessionConsult: false,
  failureNudgeThreshold: 2,
};

const ConsultantConfigFileSchema = Type.Object(
  {
    provider: Type.Optional(Type.String({ minLength: 1 })),
    model: Type.Optional(Type.String({ minLength: 1 })),
    maxTokens: Type.Optional(Type.Integer({ minimum: 1 })),
    lessonInjectionLimit: Type.Optional(Type.Integer({ minimum: 0 })),
    contextWarningThreshold: Type.Optional(Type.Number({ exclusiveMinimum: 0, exclusiveMaximum: 1 })),
    autoSessionConsult: Type.Optional(Type.Boolean()),
    failureNudgeThreshold: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

type ConsultantConfigFile = Static<typeof ConsultantConfigFileSchema>;

export interface ReadConsultantConfigOptions {
  agentDir?: string;
  log?: (message: string) => void;
}

export function getGlobalConsultantConfigPath(agentDir: string = getAgentDir()): string {
  return join(agentDir, "consultant.json");
}

export function getProjectConsultantConfigPath(cwd: string): string {
  return join(cwd, ".pi", "consultant", "config.json");
}

function validateConfigShape(raw: unknown, label: string, filePath: string, log: (message: string) => void): ConsultantConfigFile | undefined {
  if (Value.Check(ConsultantConfigFileSchema, raw)) {
    return raw as ConsultantConfigFile;
  }

  for (const error of Value.Errors(ConsultantConfigFileSchema, raw)) {
    log(
      `[small-model-consultant] Config error in ${label} config at ${filePath}: ${error.instancePath || "(root)"} — ${error.message}`,
    );
  }
  return undefined;
}

function readConfigFile(filePath: string, label: string, log: (message: string) => void): ConsultantConfigFile | undefined {
  if (!existsSync(filePath)) return undefined;

  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return validateConfigShape(raw, label, filePath, log);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[small-model-consultant] Failed to parse ${label} config at ${filePath}: ${message}`);
    return undefined;
  }
}

export function readConsultantConfig(cwd: string, options: ReadConsultantConfigOptions = {}): ConsultantConfig {
  const log = options.log ?? ((message: string) => console.error(message));
  const agentDir = options.agentDir ?? getAgentDir();
  const globalConfig = readConfigFile(getGlobalConsultantConfigPath(agentDir), "global", log);
  const projectConfig = readConfigFile(getProjectConsultantConfigPath(cwd), "project", log);

  return {
    ...DEFAULT_CONSULTANT_CONFIG,
    ...(globalConfig ?? {}),
    ...(projectConfig ?? {}),
  };
}
