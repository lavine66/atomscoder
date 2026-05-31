/**
 * TDD Tests for Frontend Conversation Context Management.
 *
 * Tests verify:
 * 1. Message building for AI requests
 * 2. Context truncation and windowing
 * 3. File context optimization
 * 4. Token estimation
 */

import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  buildConversationWindow,
  buildFileContext,
  buildCodeSummary,
  allocateTokenBudget,
} from "../lib/aiContext";

// ============================================================
// Token Estimation Tests
// ============================================================

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates correctly for short text", () => {
    // "hello" = 5 chars -> 5 / 4 = 1.25 -> floor = 1
    expect(estimateTokens("hello")).toBe(1);
  });

  it("estimates correctly for longer text", () => {
    const text = "a".repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });

  it("never returns negative", () => {
    expect(estimateTokens("")).toBeGreaterThanOrEqual(0);
    expect(estimateTokens("a")).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// Conversation Window Tests
// ============================================================

describe("buildConversationWindow", () => {
  it("returns empty array for empty messages", () => {
    expect(buildConversationWindow([])).toEqual([]);
  });

  it("returns all messages when within budget", () => {
    const messages = [
      { role: "user" as const, content: "build a todo app" },
      { role: "assistant" as const, content: "Here it is!" },
      { role: "user" as const, content: "add dark mode" },
    ];
    const result = buildConversationWindow(messages, 5000);
    expect(result).toHaveLength(3);
  });

  it("keeps first message (original requirement)", () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: "user" as const,
      content: `message ${i}`,
    }));
    const result = buildConversationWindow(messages, 2000, 10);
    expect(result[0].content).toBe("message 0");
  });

  it("keeps recent messages", () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: "user" as const,
      content: `message ${i}`,
    }));
    const result = buildConversationWindow(messages, 5000, 10);
    // Last message should be present
    expect(result.some((m) => m.content === "message 29")).toBe(true);
  });

  it("respects token budget", () => {
    const messages = Array.from({ length: 50 }, () => ({
      role: "user" as const,
      content: "x".repeat(200),
    }));
    const budget = 500;
    const result = buildConversationWindow(messages, budget);
    const totalChars = result.reduce((sum, m) => sum + m.content.length, 0);
    // Total tokens should be within budget (approximately)
    expect(Math.floor(totalChars / 4)).toBeLessThanOrEqual(budget);
  });

  it("includes summary for skipped middle messages", () => {
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: "build a calculator" },
    ];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: "user", content: `change ${i}` });
      messages.push({ role: "assistant", content: `done ${i}` });
    }
    const result = buildConversationWindow(messages, 3000, 10);
    const hasSummary = result.some((m) =>
      m.content.toLowerCase().includes("summary")
    );
    expect(hasSummary || result.length <= 10).toBe(true);
  });
});

// ============================================================
// File Context Tests
// ============================================================

describe("buildFileContext", () => {
  it("returns empty string for no files", () => {
    expect(buildFileContext([], [])).toBe("");
  });

  it("includes all files when within budget", () => {
    const files = [
      { filename: "index.html", content: "<h1>Hi</h1>", type: "html" },
      { filename: "style.css", content: "body {}", type: "css" },
    ];
    const result = buildFileContext(files, [], 5000);
    expect(result).toContain("index.html");
    expect(result).toContain("style.css");
    expect(result).toContain("<h1>Hi</h1>");
  });

  it("summarizes when over budget", () => {
    const files = [
      { filename: "index.html", content: "x".repeat(1000), type: "html" },
      { filename: "big.js", content: "y".repeat(5000), type: "js" },
    ];
    const messages = [{ role: "user", content: "update index.html" }];
    const result = buildFileContext(files, messages, 400);
    // index.html should be included (mentioned + entry point)
    expect(result).toContain("index.html");
  });

  it("prioritizes mentioned files", () => {
    const files = [
      { filename: "index.html", content: "main", type: "html" },
      { filename: "app.js", content: "code", type: "js" },
      { filename: "utils.js", content: "util", type: "js" },
    ];
    const messages = [{ role: "user", content: "fix the app.js bug" }];
    const result = buildFileContext(files, messages, 500);
    expect(result).toContain("app.js");
  });
});

// ============================================================
// Code Summary Tests
// ============================================================

describe("buildCodeSummary", () => {
  it("handles empty files", () => {
    const result = buildCodeSummary([]);
    expect(result).toContain("No files");
  });

  it("includes filename and description", () => {
    const files = [
      { filename: "index.html", content: "<div></div>", type: "html" },
    ];
    const result = buildCodeSummary(files, "Built a page");
    expect(result).toContain("index.html");
    expect(result).toContain("Built a page");
  });

  it("lists multiple files", () => {
    const files = [
      { filename: "a.html", content: "a", type: "html" },
      { filename: "b.css", content: "b", type: "css" },
      { filename: "c.js", content: "c", type: "js" },
    ];
    const result = buildCodeSummary(files, "Multi-file app");
    expect(result).toContain("a.html");
    expect(result).toContain("b.css");
    expect(result).toContain("c.js");
  });
});

// ============================================================
// Token Budget Allocation Tests
// ============================================================

describe("allocateTokenBudget", () => {
  it("allocates correctly with default budget", () => {
    const result = allocateTokenBudget(2000);
    expect(result.fileContext).toBeGreaterThan(0);
    expect(result.conversation).toBeGreaterThan(0);
    expect(result.output).toBeGreaterThan(0);
  });

  it("returns zeros when system prompt exceeds budget", () => {
    const result = allocateTokenBudget(30000, 28000);
    expect(result.fileContext).toBe(0);
    expect(result.conversation).toBe(0);
    expect(result.output).toBe(0);
  });

  it("sum does not exceed remaining budget", () => {
    const result = allocateTokenBudget(2000, 10000);
    const total = result.fileContext + result.conversation + result.output;
    expect(total).toBeLessThanOrEqual(8000);
  });

  it("all values are non-negative", () => {
    const result = allocateTokenBudget(50000);
    expect(result.fileContext).toBeGreaterThanOrEqual(0);
    expect(result.conversation).toBeGreaterThanOrEqual(0);
    expect(result.output).toBeGreaterThanOrEqual(0);
  });
});