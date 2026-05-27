import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { appendLesson, findRelevantLessons, getLessonFilePath, readLessons } from "../extensions/consultant/lesson-store.js";

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "pi-consultant-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("getLessonFilePath stores lessons under .pi/consultant", async () => {
  await withTempDir(async (dir) => {
    assert.equal(getLessonFilePath(dir), join(dir, ".pi", "consultant", "lessons.jsonl"));
  });
});

test("appendLesson writes JSONL and readLessons reads it back", async () => {
  await withTempDir(async (dir) => {
    const lesson = await appendLesson(dir, {
      title: "Use targeted tests first",
      problem: "Broad test suite made failures hard to isolate",
      successfulApproach: "Run the smallest failing test before the whole suite",
      confidence: "high",
      tags: ["testing", "debugging"],
    });

    assert.match(lesson.id, /^lesson-/);
    assert.equal(lesson.title, "Use targeted tests first");

    const fileText = await readFile(getLessonFilePath(dir), "utf8");
    assert.equal(fileText.trim().split("\n").length, 1);

    const lessons = await readLessons(dir);
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].successfulApproach, "Run the smallest failing test before the whole suite");
  });
});

test("readLessons skips malformed lines instead of throwing", async () => {
  await withTempDir(async (dir) => {
    const file = getLessonFilePath(dir);
    await mkdir(join(dir, ".pi", "consultant"), { recursive: true });
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(file, "not-json\n{\"id\":\"x\",\"createdAt\":\"now\",\"title\":\"Valid\",\"problem\":\"p\",\"successfulApproach\":\"s\",\"confidence\":\"medium\"}\n"),
    );

    const lessons = await readLessons(dir);
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].title, "Valid");
  });
});

test("findRelevantLessons ranks matching tags and text", async () => {
  await withTempDir(async (dir) => {
    await appendLesson(dir, {
      title: "Configure OpenAI-compatible local models",
      problem: "Local model rejected developer role and reasoning effort",
      rootCause: "Provider compatibility flags were missing",
      successfulApproach: "Set supportsDeveloperRole=false and supportsReasoningEffort=false",
      confidence: "high",
      tags: ["ollama", "models", "compat"],
    });
    await appendLesson(dir, {
      title: "Prefer targeted tests",
      problem: "Large test runs hide signal",
      successfulApproach: "Run one failing test first",
      confidence: "medium",
      tags: ["testing"],
    });

    const relevant = await findRelevantLessons(dir, "Ollama model compat problem with developer role", 1);
    assert.equal(relevant.length, 1);
    assert.equal(relevant[0].title, "Configure OpenAI-compatible local models");
  });
});
