"""
TDD Tests for AI Context Management Utilities.

These tests verify:
1. Token estimation accuracy
2. Smart file context building (full vs. summarized)
3. Conversation windowing (first + recent + summary)
4. Code summary generation
5. Token budget allocation
"""

import pytest
from utils.ai_context import (
    estimate_tokens,
    estimate_tokens_for_messages,
    build_file_context,
    build_conversation_window,
    build_code_summary,
    allocate_token_budget,
    _find_mentioned_files,
    _summarize_messages,
    _extract_code_features,
    CHARS_PER_TOKEN,
    MAX_TOKEN_BUDGET,
)


# ============================================================
# Token Estimation Tests
# ============================================================

class TestEstimateTokens:
    """Test token estimation from text."""
    
    def test_empty_string(self):
        assert estimate_tokens("") == 0
    
    def test_none_input(self):
        assert estimate_tokens(None) == 0
    
    def test_short_text(self):
        # "hello" = 5 chars -> 5 // 4 = 1 token
        assert estimate_tokens("hello") == 1
    
    def test_medium_text(self):
        # 100 chars -> 25 tokens
        text = "a" * 100
        assert estimate_tokens(text) == 25
    
    def test_code_text(self):
        code = "function hello() { console.log('world'); }"
        # 43 chars -> 10 tokens
        expected = len(code) // CHARS_PER_TOKEN
        assert estimate_tokens(code) == expected
    
    def test_large_text(self):
        # 10000 chars -> 2500 tokens
        text = "x" * 10000
        assert estimate_tokens(text) == 2500
    
    def test_returns_integer(self):
        result = estimate_tokens("abc")  # 3 chars -> 0 tokens (3//4=0)
        assert isinstance(result, int)
    
    def test_never_negative(self):
        assert estimate_tokens("") >= 0
        assert estimate_tokens("a") >= 0


class TestEstimateTokensForMessages:
    """Test token estimation for message lists."""
    
    def test_empty_messages(self):
        assert estimate_tokens_for_messages([]) == 0
    
    def test_single_message(self):
        messages = [{"role": "user", "content": "hello world"}]
        # 4 (overhead) + 11//4 = 4 + 2 = 6
        result = estimate_tokens_for_messages(messages)
        assert result == 6
    
    def test_multiple_messages(self):
        messages = [
            {"role": "user", "content": "a" * 100},
            {"role": "assistant", "content": "b" * 200},
        ]
        # (4 + 25) + (4 + 50) = 83
        result = estimate_tokens_for_messages(messages)
        assert result == 83
    
    def test_missing_content_key(self):
        messages = [{"role": "user"}]
        # 4 (overhead) + 0 (empty content) = 4
        result = estimate_tokens_for_messages(messages)
        assert result == 4


# ============================================================
# File Context Building Tests
# ============================================================

class TestBuildFileContext:
    """Test smart file context building."""
    
    def test_empty_files(self):
        result = build_file_context([], [])
        assert result == ""
    
    def test_small_project_includes_all(self):
        """When total files fit in budget, include everything."""
        files = [
            {"filename": "index.html", "content": "<h1>Hello</h1>"},
            {"filename": "style.css", "content": "body { color: red; }"},
        ]
        result = build_file_context(files, [], token_budget=5000)
        assert "index.html" in result
        assert "style.css" in result
        assert "<h1>Hello</h1>" in result
        assert "body { color: red; }" in result
    
    def test_large_project_summarizes(self):
        """When files exceed budget, summarize non-mentioned files."""
        files = [
            {"filename": "index.html", "content": "x" * 1000},
            {"filename": "styles.css", "content": "y" * 5000},
            {"filename": "script.js", "content": "z" * 5000},
        ]
        messages = [{"role": "user", "content": "change the index.html header"}]
        
        # Very small budget forces summarization
        result = build_file_context(files, messages, token_budget=500)
        
        # index.html should be included (mentioned)
        assert "index.html" in result
        # Other files should be summarized
        assert "Other project files" in result or "styles.css" in result
    
    def test_mentioned_files_prioritized(self):
        """Files mentioned in messages should be included fully."""
        files = [
            {"filename": "index.html", "content": "<div>Main</div>"},
            {"filename": "app.js", "content": "const x = 1;"},
            {"filename": "utils.js", "content": "function util() {}"},
        ]
        messages = [{"role": "user", "content": "update the app.js file"}]
        
        result = build_file_context(files, messages, token_budget=200)
        # app.js and index.html (entry point) should be included
        assert "app.js" in result
        assert "index.html" in result
    
    def test_always_includes_index_html(self):
        """index.html should always be included as entry point."""
        files = [
            {"filename": "index.html", "content": "<html></html>"},
            {"filename": "other.js", "content": "x" * 100},
        ]
        messages = [{"role": "user", "content": "make a change"}]
        
        result = build_file_context(files, messages, token_budget=500)
        assert "index.html" in result


class TestFindMentionedFiles:
    """Test file mention detection in messages."""
    
    def test_direct_mention(self):
        files = [{"filename": "script.js"}, {"filename": "style.css"}]
        messages = [{"role": "user", "content": "update script.js"}]
        
        result = _find_mentioned_files(files, messages)
        assert "script.js" in result
    
    def test_case_insensitive(self):
        files = [{"filename": "App.js"}]
        messages = [{"role": "user", "content": "change app.js"}]
        
        result = _find_mentioned_files(files, messages)
        assert "App.js" in result
    
    def test_no_mention_includes_index(self):
        files = [
            {"filename": "index.html"},
            {"filename": "other.js"},
        ]
        messages = [{"role": "user", "content": "make it blue"}]
        
        result = _find_mentioned_files(files, messages)
        assert "index.html" in result
    
    def test_multiple_mentions(self):
        files = [
            {"filename": "a.html"},
            {"filename": "b.css"},
            {"filename": "c.js"},
        ]
        messages = [{"role": "user", "content": "update a.html and c.js"}]
        
        result = _find_mentioned_files(files, messages)
        assert "a.html" in result
        assert "c.js" in result


# ============================================================
# Conversation Window Tests
# ============================================================

class TestBuildConversationWindow:
    """Test conversation windowing logic."""
    
    def test_empty_messages(self):
        result = build_conversation_window([])
        assert result == []
    
    def test_short_conversation_unchanged(self):
        """Short conversations should pass through unchanged."""
        messages = [
            {"role": "user", "content": "build a todo app"},
            {"role": "assistant", "content": "Here's your todo app!"},
            {"role": "user", "content": "add dark mode"},
        ]
        result = build_conversation_window(messages, token_budget=5000)
        assert len(result) == 3
        assert result[0]["content"] == "build a todo app"
    
    def test_keeps_first_message(self):
        """First user message (original requirement) should always be kept."""
        messages = [{"role": "user", "content": "original requirement"}]
        messages += [{"role": "user", "content": f"msg {i}"} for i in range(20)]
        
        result = build_conversation_window(messages, token_budget=5000, max_messages=10)
        assert result[0]["content"] == "original requirement"
    
    def test_keeps_recent_messages(self):
        """Most recent messages should be preserved."""
        messages = [{"role": "user", "content": f"msg {i}"} for i in range(30)]
        
        result = build_conversation_window(messages, token_budget=5000, max_messages=10)
        # Last message should be present
        assert any(m["content"] == "msg 29" for m in result)
    
    def test_adds_summary_for_middle(self):
        """Middle messages should be summarized when conversation is long."""
        messages = [
            {"role": "user", "content": "build a calculator"},
        ]
        for i in range(20):
            messages.append({"role": "user", "content": f"change {i}"})
            messages.append({"role": "assistant", "content": f"done {i}"})
        
        result = build_conversation_window(messages, token_budget=3000, max_messages=10)
        # Should have a summary message
        has_summary = any("summary" in m.get("content", "").lower() for m in result)
        assert has_summary or len(result) <= 10
    
    def test_respects_token_budget(self):
        """Result should not exceed token budget."""
        messages = [
            {"role": "user", "content": "x" * 1000}
            for _ in range(50)
        ]
        
        budget = 500
        result = build_conversation_window(messages, token_budget=budget)
        total_tokens = estimate_tokens_for_messages(result)
        assert total_tokens <= budget
    
    def test_single_message(self):
        messages = [{"role": "user", "content": "hello"}]
        result = build_conversation_window(messages)
        assert len(result) == 1
        assert result[0]["content"] == "hello"


class TestSummarizeMessages:
    """Test message summarization."""
    
    def test_empty_messages(self):
        result = _summarize_messages([])
        assert "summary" in result.lower()
    
    def test_includes_user_requests(self):
        messages = [
            {"role": "user", "content": "add a button"},
            {"role": "assistant", "content": "Done!"},
        ]
        result = _summarize_messages(messages)
        assert "add a button" in result
    
    def test_truncates_long_messages(self):
        messages = [{"role": "user", "content": "x" * 200}]
        result = _summarize_messages(messages)
        # Should be truncated with ...
        assert "..." in result


# ============================================================
# Code Summary Tests
# ============================================================

class TestBuildCodeSummary:
    """Test code summary generation."""
    
    def test_empty_files(self):
        result = build_code_summary([])
        assert "No files" in result
    
    def test_with_description(self):
        files = [{"filename": "index.html", "content": "<h1>Hi</h1>", "type": "html"}]
        result = build_code_summary(files, "Built a landing page")
        assert "Built a landing page" in result
        assert "index.html" in result
    
    def test_multiple_files(self):
        files = [
            {"filename": "index.html", "content": "<div></div>", "type": "html"},
            {"filename": "style.css", "content": "body {}", "type": "css"},
            {"filename": "app.js", "content": "const x = 1;", "type": "js"},
        ]
        result = build_code_summary(files, "Todo app")
        assert "index.html" in result
        assert "style.css" in result
        assert "app.js" in result
    
    def test_without_description(self):
        files = [{"filename": "test.html", "content": "hello", "type": "html"}]
        result = build_code_summary(files)
        assert "Generated 1 files" in result
        assert "test.html" in result


class TestExtractCodeFeatures:
    """Test code feature extraction."""
    
    def test_html_form(self):
        result = _extract_code_features("<form><input></form>", "html")
        assert "form" in result
    
    def test_html_canvas(self):
        result = _extract_code_features("<canvas id='game'></canvas>", "html")
        assert "canvas" in result
    
    def test_css_responsive(self):
        result = _extract_code_features("@media (max-width: 768px) { }", "css")
        assert "responsive" in result
    
    def test_css_animations(self):
        result = _extract_code_features("@keyframes spin { from {} to {} }", "css")
        assert "animations" in result
    
    def test_js_functions(self):
        code = "function hello() {} const world = () => {}"
        result = _extract_code_features(code, "js")
        assert "functions" in result
    
    def test_js_event_handlers(self):
        result = _extract_code_features("btn.addEventListener('click', fn)", "js")
        assert "event handlers" in result
    
    def test_empty_content(self):
        result = _extract_code_features("", "html")
        assert result == ""


# ============================================================
# Token Budget Allocation Tests
# ============================================================

class TestAllocateTokenBudget:
    """Test token budget allocation."""
    
    def test_basic_allocation(self):
        result = allocate_token_budget(system_prompt_tokens=2000, total_budget=10000)
        # Remaining: 8000
        assert result["file_context"] == int(8000 * 0.35)
        assert result["conversation"] == int(8000 * 0.40)
        assert result["output"] == int(8000 * 0.25)
    
    def test_large_system_prompt(self):
        """If system prompt uses all budget, allocations should be 0."""
        result = allocate_token_budget(system_prompt_tokens=30000, total_budget=28000)
        assert result["file_context"] == 0
        assert result["conversation"] == 0
        assert result["output"] == 0
    
    def test_default_budget(self):
        result = allocate_token_budget(system_prompt_tokens=3000)
        remaining = MAX_TOKEN_BUDGET - 3000
        assert result["file_context"] == int(remaining * 0.35)
        assert result["conversation"] == int(remaining * 0.40)
    
    def test_all_values_non_negative(self):
        result = allocate_token_budget(system_prompt_tokens=50000)
        assert all(v >= 0 for v in result.values())
    
    def test_sum_not_exceed_budget(self):
        result = allocate_token_budget(system_prompt_tokens=2000, total_budget=10000)
        total_allocated = sum(result.values())
        assert total_allocated <= 8000  # remaining budget