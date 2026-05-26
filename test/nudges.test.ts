import test from "node:test";
import assert from "node:assert/strict";
import { formatLessonsForInjection } from "../extensions/consultant/prompts.js";
import {
  isHarmlessNoMatchBashError,
  shouldEscalateToSessionConsult,
  shouldWarnForContextUsage,
} from "../extensions/consultant/nudges.js";

test("shouldWarnForContextUsage respects threshold and invalid usage", () => {
  assert.equal(shouldWarnForContextUsage(undefined, 0.75), false);
  assert.equal(shouldWarnForContextUsage({ tokens: 74, contextWindow: 100 }, 0.75), false);
  assert.equal(shouldWarnForContextUsage({ tokens: 75, contextWindow: 100 }, 0.75), true);
  assert.equal(shouldWarnForContextUsage({ tokens: 80 }, 0.75), false);
});

test("isHarmlessNoMatchBashError ignores grep no-match exit code", () => {
  assert.equal(isHarmlessNoMatchBashError('grep -R "router" -n .', "(no output)\n\nCommand exited with code 1"), true);
  assert.equal(isHarmlessNoMatchBashError('rg "router" .', "Command exited with code 1"), true);
  assert.equal(isHarmlessNoMatchBashError('find . -name missing', "(no output)"), false);
  assert.equal(isHarmlessNoMatchBashError('grep -R "router" -n .', "grep: ./secret: Permission denied\n\nCommand exited with code 2"), false);
});

test("shouldEscalateToSessionConsult respects failure threshold", () => {
  assert.equal(shouldEscalateToSessionConsult(1, 2), false);
  assert.equal(shouldEscalateToSessionConsult(2, 2), true);
  assert.equal(shouldEscalateToSessionConsult(3, 2), true);
});

test("formatLessonsForInjection returns compact markdown", () => {
  const text = formatLessonsForInjection([
    {
      id: "lesson-1",
      createdAt: "2026-05-22T00:00:00.000Z",
      title: "Use targeted tests",
      problem: "Broad test suite hid the failure",
      successfulApproach: "Run one failing test first",
      confidence: "high",
      tags: ["testing"],
    },
  ]);

  assert.match(text, /Relevant learned lessons/);
  assert.match(text, /Use targeted tests/);
  assert.match(text, /Run one failing test first/);
});
