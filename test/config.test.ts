import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONSULTANT_CONFIG,
  getGlobalConsultantConfigPath,
  getProjectConsultantConfigPath,
  readConsultantConfig,
} from "../extensions/consultant/config.js";

async function makeConfigDirs() {
  const root = await mkdtemp(join(tmpdir(), "pi-consultant-config-"));
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  await mkdir(agentDir, { recursive: true });
  await mkdir(cwd, { recursive: true });
  return { agentDir, cwd };
}

test("readConsultantConfig returns hardcoded defaults when no files exist", async () => {
  const { agentDir, cwd } = await makeConfigDirs();

  const config = readConsultantConfig(cwd, { agentDir });

  assert.deepEqual(config, DEFAULT_CONSULTANT_CONFIG);
});

test("readConsultantConfig applies global config over defaults", async () => {
  const { agentDir, cwd } = await makeConfigDirs();
  await writeFile(
    getGlobalConsultantConfigPath(agentDir),
    JSON.stringify({ model: "gpt-5.5-large", maxTokens: 8192 }, null, 2),
    "utf8",
  );

  const config = readConsultantConfig(cwd, { agentDir });

  assert.equal(config.provider, DEFAULT_CONSULTANT_CONFIG.provider);
  assert.equal(config.model, "gpt-5.5-large");
  assert.equal(config.maxTokens, 8192);
});

test("readConsultantConfig applies project config over global config", async () => {
  const { agentDir, cwd } = await makeConfigDirs();
  await writeFile(
    getGlobalConsultantConfigPath(agentDir),
    JSON.stringify({ provider: "openai-codex", model: "global-model", autoSessionConsult: true }, null, 2),
    "utf8",
  );
  const projectPath = getProjectConsultantConfigPath(cwd);
  await mkdir(join(cwd, ".pi", "consultant"), { recursive: true });
  await writeFile(
    projectPath,
    JSON.stringify({ model: "project-model", failureNudgeThreshold: 3 }, null, 2),
    "utf8",
  );

  const config = readConsultantConfig(cwd, { agentDir });

  assert.equal(config.provider, "openai-codex");
  assert.equal(config.model, "project-model");
  assert.equal(config.autoSessionConsult, true);
  assert.equal(config.failureNudgeThreshold, 3);
});

test("readConsultantConfig ignores malformed config and logs a clear error", async () => {
  const { agentDir, cwd } = await makeConfigDirs();
  const messages: string[] = [];
  await writeFile(
    getGlobalConsultantConfigPath(agentDir),
    JSON.stringify({ provider: "openai-codex", model: "global-model" }, null, 2),
    "utf8",
  );
  await mkdir(join(cwd, ".pi", "consultant"), { recursive: true });
  await writeFile(getProjectConsultantConfigPath(cwd), JSON.stringify({ maxTokens: -1 }), "utf8");

  const config = readConsultantConfig(cwd, { agentDir, log: (message) => messages.push(message) });

  assert.equal(config.model, "global-model");
  assert.equal(config.maxTokens, DEFAULT_CONSULTANT_CONFIG.maxTokens);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Config error in project/);
});

test("config path helpers use Pi agent dir and project .pi/consultant directory", async () => {
  const { agentDir, cwd } = await makeConfigDirs();

  assert.equal(getGlobalConsultantConfigPath(agentDir), join(agentDir, "consultant.json"));
  assert.equal(getProjectConsultantConfigPath(cwd), join(cwd, ".pi", "consultant", "config.json"));
});
