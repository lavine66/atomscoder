/**
 * AI Context Management Utilities (Frontend)
 *
 * Handles smart context building, conversation windowing, token estimation,
 * and budget management for multi-turn AI code generation conversations.
 */

const CHARS_PER_TOKEN = 4;
const MAX_TOKEN_BUDGET = 28000;

export interface MessageItem {
  role: "user" | "assistant";
  content: string;
}

export interface FileItem {
  filename: string;
  content: string;
  type: string;
}

/**
 * Estimate token count from text using character-based heuristic.
 * ~4 chars per token for English/code text.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(0, Math.floor(text.length / CHARS_PER_TOKEN));
}

/**
 * Estimate total tokens for a list of messages.
 */
export function estimateTokensForMessages(messages: MessageItem[]): number {
  let total = 0;
  for (const msg of messages) {
    total += 4; // overhead per message
    total += estimateTokens(msg.content || "");
  }
  return total;
}

/**
 * Build an optimized conversation window for AI context.
 *
 * Strategy:
 * - Always keep the first user message (original requirement).
 * - Always keep the last N messages (recent context).
 * - For messages in between, include a brief summary.
 */
export function buildConversationWindow(
  messages: MessageItem[],
  tokenBudget: number = MAX_TOKEN_BUDGET * 0.5,
  maxMessages: number = 20
): MessageItem[] {
  if (!messages.length) return [];

  // If messages fit within limits, return all
  if (messages.length <= maxMessages) {
    const totalTokens = estimateTokensForMessages(messages);
    if (totalTokens <= tokenBudget) {
      return messages;
    }
  }

  const firstMsg = messages[0];
  const recentCount = Math.min(15, messages.length - 1);
  const recentMsgs = recentCount > 0 ? messages.slice(-recentCount) : [];

  const result: MessageItem[] = [];

  // Always include first message if not already in recent
  if (firstMsg && !recentMsgs.includes(firstMsg)) {
    result.push(firstMsg);
  }

  const firstTokens = estimateTokensForMessages(result);
  const remainingBudget = tokenBudget - firstTokens;
  const recentTokens = estimateTokensForMessages(recentMsgs);

  if (recentTokens <= remainingBudget) {
    // Add summary of middle messages if they exist
    const middleMsgs =
      recentCount < messages.length - 1
        ? messages.slice(1, -recentCount)
        : [];

    if (middleMsgs.length > 0) {
      const summary = summarizeMessages(middleMsgs);
      const summaryMsg: MessageItem = { role: "assistant", content: summary };
      const summaryTokens = estimateTokensForMessages([summaryMsg]);

      if (firstTokens + summaryTokens + recentTokens <= tokenBudget) {
        result.push(summaryMsg);
      }
    }
    result.push(...recentMsgs);
  } else {
    // Trim recent messages to fit budget
    const trimmedRecent: MessageItem[] = [];
    let used = firstTokens;
    for (let i = recentMsgs.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokensForMessages([recentMsgs[i]]);
      if (used + msgTokens <= tokenBudget) {
        trimmedRecent.unshift(recentMsgs[i]);
        used += msgTokens;
      } else {
        break;
      }
    }
    result.push(...trimmedRecent);
  }

  return result;
}

/**
 * Create a brief summary of skipped messages.
 */
function summarizeMessages(messages: MessageItem[]): string {
  const userRequests: string[] = [];
  const assistantActions: string[] = [];

  for (const msg of messages) {
    const short =
      msg.content.length > 100
        ? msg.content.substring(0, 100) + "..."
        : msg.content;

    if (msg.role === "user") {
      userRequests.push(short);
    } else {
      assistantActions.push(short);
    }
  }

  const parts = ["[Previous conversation summary:"];
  if (userRequests.length) {
    parts.push(`  User requested: ${userRequests.slice(0, 5).join("; ")}`);
  }
  if (assistantActions.length) {
    parts.push(
      `  Assistant actions: ${assistantActions.slice(0, 5).join("; ")}`
    );
  }
  parts.push("]");

  return parts.join("\n");
}

/**
 * Build smart file context for AI, respecting token budget.
 *
 * Strategy:
 * - If total file content fits within budget, include all files fully.
 * - If over budget, include files mentioned in recent messages fully,
 *   and provide a summary list of other files.
 */
export function buildFileContext(
  files: FileItem[],
  recentMessages: MessageItem[],
  tokenBudget: number = MAX_TOKEN_BUDGET * 0.3
): string {
  if (!files.length) return "";

  // Calculate total token cost
  const allContent = files
    .map((f) => `--- ${f.filename} ---\n${f.content}`)
    .join("\n\n");
  const totalTokens = estimateTokens(allContent);

  // If everything fits, return all
  if (totalTokens <= tokenBudget) {
    return allContent;
  }

  // Find mentioned files
  const mentionedFiles = findMentionedFiles(files, recentMessages);

  const contextParts: string[] = [];
  let usedTokens = 0;
  const includedFilenames = new Set<string>();

  // Include mentioned files fully
  for (const f of files) {
    if (mentionedFiles.has(f.filename)) {
      const fileText = `--- ${f.filename} ---\n${f.content}`;
      const fileTokens = estimateTokens(fileText);
      if (usedTokens + fileTokens <= tokenBudget - 200) {
        contextParts.push(fileText);
        usedTokens += fileTokens;
        includedFilenames.add(f.filename);
      }
    }
  }

  // Summary of remaining files
  const remaining = files.filter((f) => !includedFilenames.has(f.filename));
  if (remaining.length) {
    const summaryLines = ["[Other project files (not shown in full):"];
    for (const f of remaining) {
      const lineCount = f.content.split("\n").length;
      summaryLines.push(
        `  - ${f.filename} (${lineCount} lines, ${f.type} file)`
      );
    }
    summaryLines.push("]");
    contextParts.push(summaryLines.join("\n"));
  }

  return contextParts.join("\n\n");
}

/**
 * Find filenames mentioned in recent messages.
 */
function findMentionedFiles(
  files: FileItem[],
  messages: MessageItem[]
): Set<string> {
  const mentioned = new Set<string>();
  const allText = messages.map((m) => m.content || "").join(" ").toLowerCase();

  for (const f of files) {
    if (allText.includes(f.filename.toLowerCase())) {
      mentioned.add(f.filename);
    }
  }

  // Always include index.html if it exists
  if (!mentioned.size || files.some((f) => f.filename === "index.html")) {
    const indexFile = files.find((f) => f.filename === "index.html");
    if (indexFile) mentioned.add("index.html");
  }

  return mentioned;
}

/**
 * Build a concise code summary for storing with assistant messages.
 */
export function buildCodeSummary(
  files: FileItem[],
  description: string = ""
): string {
  if (!files.length) return description || "No files generated.";

  if (description) {
    return `${description}\n[Files: ${files.map((f) => f.filename).join(", ")}]`;
  }

  const fileSummaries = files.map((f) => {
    const lineCount = f.content.split("\n").length;
    return `${f.filename} [${lineCount} lines]`;
  });

  return `Generated ${files.length} files: ${fileSummaries.join(", ")}`;
}

/**
 * Allocate token budget across different context sections.
 */
export function allocateTokenBudget(
  systemPromptTokens: number,
  totalBudget: number = MAX_TOKEN_BUDGET
): { fileContext: number; conversation: number; output: number } {
  const remaining = totalBudget - systemPromptTokens;

  if (remaining <= 0) {
    return { fileContext: 0, conversation: 0, output: 0 };
  }

  return {
    fileContext: Math.floor(remaining * 0.35),
    conversation: Math.floor(remaining * 0.4),
    output: Math.floor(remaining * 0.25),
  };
}