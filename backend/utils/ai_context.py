"""
AI Context Management Utilities

Handles smart context building, conversation windowing, token estimation,
and budget management for multi-turn AI code generation conversations.
"""

from typing import List, Dict, Optional
import re


# Token estimation: ~4 chars per token for English, ~2 chars for code
CHARS_PER_TOKEN = 4
MAX_TOKEN_BUDGET = 28000  # Leave room for system prompt + output within 32k
FILE_CONTEXT_BUDGET_RATIO = 0.3  # 30% of budget for file context
CONVERSATION_BUDGET_RATIO = 0.5  # 50% of budget for conversation history
SYSTEM_PROMPT_BUDGET_RATIO = 0.2  # 20% reserved for system prompt


def estimate_tokens(text: str) -> int:
    """Estimate token count from text using character-based heuristic.
    
    Uses ~4 chars per token for English text. Code tends to be slightly
    more token-dense, but 4 chars/token is a reasonable average.
    
    Args:
        text: The text to estimate tokens for.
        
    Returns:
        Estimated token count (integer, minimum 0).
    """
    if not text:
        return 0
    return max(0, len(text) // CHARS_PER_TOKEN)


def estimate_tokens_for_messages(messages: List[Dict[str, str]]) -> int:
    """Estimate total tokens for a list of messages.
    
    Args:
        messages: List of message dicts with 'role' and 'content' keys.
        
    Returns:
        Total estimated token count.
    """
    total = 0
    for msg in messages:
        # Each message has overhead (~4 tokens for role + formatting)
        total += 4
        total += estimate_tokens(msg.get("content", ""))
    return total


def build_file_context(
    files: List[Dict[str, str]],
    recent_messages: List[Dict[str, str]],
    token_budget: Optional[int] = None,
) -> str:
    """Build smart file context for AI, respecting token budget.
    
    Strategy:
    - If total file content fits within budget, include all files fully.
    - If over budget, include files mentioned in recent messages fully,
      and provide a summary list of other files.
    
    Args:
        files: List of file dicts with 'filename' and 'content' keys.
        recent_messages: Recent conversation messages to detect mentioned files.
        token_budget: Maximum tokens for file context. Defaults to calculated budget.
        
    Returns:
        Formatted file context string.
    """
    if not files:
        return ""
    
    if token_budget is None:
        token_budget = int(MAX_TOKEN_BUDGET * FILE_CONTEXT_BUDGET_RATIO)
    
    # Calculate total token cost of all files
    all_files_content = "\n\n".join(
        f"--- {f['filename']} ---\n{f['content']}" for f in files
    )
    total_tokens = estimate_tokens(all_files_content)
    
    # If everything fits, return all files
    if total_tokens <= token_budget:
        return all_files_content
    
    # Otherwise, prioritize files mentioned in recent messages
    mentioned_files = _find_mentioned_files(files, recent_messages)
    
    # Build context with mentioned files first
    context_parts = []
    used_tokens = 0
    included_filenames = set()
    
    # Include mentioned files fully (up to budget)
    for f in files:
        if f["filename"] in mentioned_files:
            file_text = f"--- {f['filename']} ---\n{f['content']}"
            file_tokens = estimate_tokens(file_text)
            if used_tokens + file_tokens <= token_budget - 200:  # Reserve 200 for summary
                context_parts.append(file_text)
                used_tokens += file_tokens
                included_filenames.add(f["filename"])
    
    # Add summary of remaining files
    remaining_files = [f for f in files if f["filename"] not in included_filenames]
    if remaining_files:
        summary_lines = ["[Other project files (not shown in full):"]
        for f in remaining_files:
            line_count = f["content"].count("\n") + 1
            summary_lines.append(f"  - {f['filename']} ({line_count} lines, {f.get('type', 'unknown')} file)")
        summary_lines.append("]")
        summary = "\n".join(summary_lines)
        context_parts.append(summary)
    
    return "\n\n".join(context_parts)


def _find_mentioned_files(
    files: List[Dict[str, str]],
    messages: List[Dict[str, str]],
) -> set:
    """Find filenames mentioned in recent messages.
    
    Args:
        files: Available project files.
        messages: Recent messages to search through.
        
    Returns:
        Set of mentioned filenames.
    """
    mentioned = set()
    filenames = {f["filename"] for f in files}
    
    # Combine all recent message content
    all_text = " ".join(msg.get("content", "") for msg in messages).lower()
    
    for filename in filenames:
        # Check if filename is mentioned directly
        if filename.lower() in all_text:
            mentioned.add(filename)
    
    # If no files mentioned, include the main entry file
    if not mentioned:
        for f in files:
            if f["filename"] in ("index.html", "main.html", "app.html"):
                mentioned.add(f["filename"])
                break
    
    # Always include index.html if it exists (it's the entry point)
    for f in files:
        if f["filename"] == "index.html":
            mentioned.add("index.html")
            break
    
    return mentioned


def build_conversation_window(
    messages: List[Dict[str, str]],
    token_budget: Optional[int] = None,
    max_messages: int = 20,
) -> List[Dict[str, str]]:
    """Build an optimized conversation window for AI context.
    
    Strategy:
    - Always keep the first user message (original requirement).
    - Always keep the last N messages (recent context).
    - For messages in between, include a brief summary if they exceed budget.
    
    Args:
        messages: Full conversation history (role + content dicts).
        token_budget: Maximum tokens for conversation. Defaults to calculated budget.
        max_messages: Maximum number of messages to include.
        
    Returns:
        Optimized list of messages for AI context.
    """
    if not messages:
        return []
    
    if token_budget is None:
        token_budget = int(MAX_TOKEN_BUDGET * CONVERSATION_BUDGET_RATIO)
    
    # If messages fit within limits, return all
    if len(messages) <= max_messages:
        total_tokens = estimate_tokens_for_messages(messages)
        if total_tokens <= token_budget:
            return messages
    
    # Strategy: first message + summary of middle + last messages
    first_msg = messages[0] if messages else None
    
    # Determine how many recent messages to keep
    recent_count = min(15, len(messages) - 1)
    recent_msgs = messages[-recent_count:] if recent_count > 0 else []
    
    # Check if first + recent fits
    result = []
    if first_msg and first_msg not in recent_msgs:
        result.append(first_msg)
    
    # Calculate remaining budget after first message
    first_tokens = estimate_tokens_for_messages(result)
    remaining_budget = token_budget - first_tokens
    
    # Check if recent messages fit
    recent_tokens = estimate_tokens_for_messages(recent_msgs)
    
    if recent_tokens <= remaining_budget:
        # If there are middle messages, add a summary
        middle_msgs = messages[1:-recent_count] if recent_count < len(messages) - 1 else []
        if middle_msgs:
            summary = _summarize_messages(middle_msgs)
            summary_msg = {"role": "assistant", "content": summary}
            summary_tokens = estimate_tokens_for_messages([summary_msg])
            if first_tokens + summary_tokens + recent_tokens <= token_budget:
                result.append(summary_msg)
        result.extend(recent_msgs)
    else:
        # Trim recent messages to fit budget
        trimmed_recent = []
        used = first_tokens
        for msg in reversed(recent_msgs):
            msg_tokens = estimate_tokens_for_messages([msg])
            if used + msg_tokens <= token_budget:
                trimmed_recent.insert(0, msg)
                used += msg_tokens
            else:
                break
        result.extend(trimmed_recent)
    
    return result


def _summarize_messages(messages: List[Dict[str, str]]) -> str:
    """Create a brief summary of skipped messages.
    
    Args:
        messages: Messages to summarize.
        
    Returns:
        A brief summary string.
    """
    user_requests = []
    assistant_actions = []
    
    for msg in messages:
        content = msg.get("content", "")
        # Truncate long messages for summary
        short = content[:100] + "..." if len(content) > 100 else content
        
        if msg.get("role") == "user":
            user_requests.append(short)
        elif msg.get("role") == "assistant":
            assistant_actions.append(short)
    
    parts = ["[Previous conversation summary:"]
    if user_requests:
        parts.append(f"  User requested: {'; '.join(user_requests[:5])}")
    if assistant_actions:
        parts.append(f"  Assistant actions: {'; '.join(assistant_actions[:5])}")
    parts.append("]")
    
    return "\n".join(parts)


def build_code_summary(files: List[Dict[str, str]], description: str = "") -> str:
    """Build a concise code summary for storing with assistant messages.
    
    This summary helps the AI understand what was previously generated
    without needing to see the full file contents in conversation history.
    
    Args:
        files: List of generated files with 'filename', 'content', 'type' keys.
        description: The AI's description of what it built.
        
    Returns:
        A concise summary string.
    """
    if not files:
        return description or "No files generated."
    
    file_summaries = []
    for f in files:
        filename = f.get("filename", "unknown")
        content = f.get("content", "")
        line_count = content.count("\n") + 1
        
        # Extract key features from the content
        features = _extract_code_features(content, f.get("type", ""))
        feature_str = f" ({features})" if features else ""
        
        file_summaries.append(f"{filename} [{line_count} lines]{feature_str}")
    
    summary = f"Generated {len(files)} files: {', '.join(file_summaries)}"
    if description:
        summary = f"{description}\n[Files: {', '.join(f.get('filename', '') for f in files)}]"
    
    return summary


def _extract_code_features(content: str, file_type: str) -> str:
    """Extract key features from code content for summary.
    
    Args:
        content: File content.
        file_type: Type of file (html, css, js).
        
    Returns:
        Brief feature description.
    """
    features = []
    
    if file_type == "html":
        # Count major elements
        if "<form" in content.lower():
            features.append("form")
        if "<table" in content.lower():
            features.append("table")
        if "<canvas" in content.lower():
            features.append("canvas")
        if "<nav" in content.lower():
            features.append("nav")
    elif file_type == "css":
        # Count rules roughly
        rule_count = content.count("{")
        if rule_count > 0:
            features.append(f"~{rule_count} rules")
        if "@media" in content:
            features.append("responsive")
        if "animation" in content or "@keyframes" in content:
            features.append("animations")
    elif file_type == "js":
        # Count functions
        func_count = len(re.findall(r'(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))', content))
        if func_count > 0:
            features.append(f"~{func_count} functions")
        if "addEventListener" in content:
            features.append("event handlers")
        if "fetch(" in content or "XMLHttpRequest" in content:
            features.append("API calls")
    
    return ", ".join(features) if features else ""


def allocate_token_budget(
    system_prompt_tokens: int,
    total_budget: int = MAX_TOKEN_BUDGET,
) -> Dict[str, int]:
    """Allocate token budget across different context sections.
    
    Args:
        system_prompt_tokens: Tokens used by the system prompt.
        total_budget: Total available token budget.
        
    Returns:
        Dict with 'file_context', 'conversation', 'output' budgets.
    """
    remaining = total_budget - system_prompt_tokens
    
    if remaining <= 0:
        return {"file_context": 0, "conversation": 0, "output": 0}
    
    # Allocate: 35% files, 40% conversation, 25% output
    return {
        "file_context": int(remaining * 0.35),
        "conversation": int(remaining * 0.40),
        "output": int(remaining * 0.25),
    }