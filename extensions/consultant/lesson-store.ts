import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Lesson, LessonInput } from "./types.js";

export function getLessonFilePath(cwd: string): string {
  return join(cwd, ".pi", "consultant", "lessons.jsonl");
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9а-яё_-]+/iu)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
}

function validateLesson(value: unknown): Lesson | undefined {
  if (!value || typeof value !== "object") return undefined;
  const lesson = value as Partial<Lesson>;
  if (typeof lesson.id !== "string") return undefined;
  if (typeof lesson.createdAt !== "string") return undefined;
  if (typeof lesson.title !== "string") return undefined;
  if (typeof lesson.problem !== "string") return undefined;
  if (typeof lesson.successfulApproach !== "string") return undefined;
  if (!["low", "medium", "high"].includes(String(lesson.confidence))) return undefined;
  return lesson as Lesson;
}

export async function readLessons(cwd: string): Promise<Lesson[]> {
  try {
    const text = await readFile(getLessonFilePath(cwd), "utf8");
    const lessons: Lesson[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        const lesson = validateLesson(parsed);
        if (lesson) lessons.push(lesson);
      } catch {
        // Ignore malformed lines so one bad write does not break memory lookup.
      }
    }
    return lessons;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function appendLesson(cwd: string, input: LessonInput): Promise<Lesson> {
  const lesson: Lesson = {
    id: `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  const file = getLessonFilePath(cwd);
  await mkdir(join(cwd, ".pi", "consultant"), { recursive: true });
  await appendFile(file, `${JSON.stringify(lesson)}\n`, "utf8");
  return lesson;
}

function scoreLesson(lesson: Lesson, query: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return 0;

  const tagTokens = tokenize((lesson.tags ?? []).join(" "));
  const lessonTokens = tokenize(
    [
      lesson.title,
      lesson.problem,
      lesson.rootCause ?? "",
      lesson.successfulApproach,
      ...(lesson.failedApproaches ?? []),
      ...(lesson.triggersForFuture ?? []),
    ].join(" "),
  );

  let score = 0;
  for (const token of queryTokens) {
    if (tagTokens.has(token)) score += 3;
    if (lessonTokens.has(token)) score += 1;
  }
  if (lesson.confidence === "high") score += 0.5;
  if (lesson.confidence === "low") score -= 0.5;
  return score;
}

export async function findRelevantLessons(cwd: string, query: string, limit: number): Promise<Lesson[]> {
  const lessons = await readLessons(cwd);
  return lessons
    .map((lesson) => ({ lesson, score: scoreLesson(lesson, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map((item) => item.lesson);
}
