import json
import logging
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.aihub import AIHubService
from schemas.aihub import GenTxtRequest, ChatMessage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


class MessageItem(BaseModel):
    role: str
    content: str


class GenerateCodeRequest(BaseModel):
    messages: List[MessageItem]
    project_context: Optional[str] = None


SYSTEM_PROMPT = """You are an expert full-stack web developer AI assistant and a friendly pair programmer. Your job is to generate complete, working web applications based on user requirements, while maintaining a helpful conversational tone.

When the user describes what they want, you MUST respond with a valid JSON object containing the files to create/update. The JSON format is:

{
  "files": [
    {
      "filename": "index.html",
      "content": "<!DOCTYPE html>...",
      "type": "html"
    },
    {
      "filename": "styles.css", 
      "content": "body { ... }",
      "type": "css"
    },
    {
      "filename": "script.js",
      "content": "// JavaScript code...",
      "type": "js"
    }
  ],
  "description": "A friendly, conversational message (1-3 sentences) describing what you built or changed, followed by a follow-up question to guide the user. For example: 'I've created a modern todo app with a clean dark theme and smooth animations. You can see it in the preview panel on the right! Would you like me to add a feature to filter tasks by status, or change the color scheme?'"
}

Rules:
1. Always generate complete, working code - never use placeholders or TODOs
2. Use modern HTML5, CSS3, and vanilla JavaScript (ES6+)
3. Make the UI visually appealing with good styling
4. Ensure the code works standalone in a browser without any build tools
5. If modifying existing code, include ALL files (even unchanged ones) in your response
6. For multi-file projects, always include an index.html as the entry point
7. Use responsive design principles
8. Add appropriate comments in the code
9. If the user asks to modify existing code, incorporate their changes while keeping the rest intact
10. ONLY output the JSON object, no markdown code blocks, no extra text before or after the JSON
11. The "description" field is CRITICAL - it must be conversational, friendly, and always end with a follow-up question or suggestion to help the user iterate. Think of yourself as a helpful AI pair programmer guiding the user through building their app step by step.
12. Never put code or technical JSON in the description field - keep it human-readable and encouraging
13. Make sure the JSON is valid - properly escape all special characters in strings (newlines as \\n, quotes as \\", backslashes as \\\\, tabs as \\t)
14. Keep the response concise - avoid unnecessarily large files that might get truncated"""


def clean_ai_response(raw_content: str) -> str:
    """Clean and extract valid JSON from AI response.
    
    Handles common issues:
    - Markdown code blocks (```json ... ```)
    - Extra text before/after JSON
    - Multiple code block formats
    """
    content = raw_content.strip()
    
    # Strategy 1: Remove markdown code blocks
    # Match ```json, ```JSON, ```javascript, or just ```
    code_block_pattern = r'```(?:json|JSON|javascript|js)?\s*\n?([\s\S]*?)```'
    code_block_match = re.search(code_block_pattern, content)
    if code_block_match:
        content = code_block_match.group(1).strip()
    
    # Strategy 2: Find the outermost JSON object by matching braces
    start_idx = content.find('{')
    if start_idx == -1:
        return raw_content
    
    # Find matching closing brace by counting
    brace_count = 0
    end_idx = -1
    in_string = False
    escape_next = False
    
    for i in range(start_idx, len(content)):
        char = content[i]
        
        if escape_next:
            escape_next = False
            continue
        
        if char == '\\' and in_string:
            escape_next = True
            continue
        
        if char == '"' and not escape_next:
            in_string = not in_string
            continue
        
        if in_string:
            continue
        
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0:
                end_idx = i
                break
    
    if end_idx > start_idx:
        return content[start_idx:end_idx + 1]
    
    # Strategy 3: Fallback - use lastIndexOf
    last_brace = content.rfind('}')
    if last_brace > start_idx:
        return content[start_idx:last_brace + 1]
    
    return raw_content


def try_repair_json(json_str: str) -> Optional[str]:
    """Attempt to repair truncated or slightly malformed JSON."""
    # Try as-is first
    try:
        json.loads(json_str)
        return json_str
    except json.JSONDecodeError:
        pass
    
    # Try adding closing brackets/braces
    # Count unclosed braces and brackets
    in_string = False
    escape_next = False
    braces = 0
    brackets = 0
    
    for char in json_str:
        if escape_next:
            escape_next = False
            continue
        if char == '\\' and in_string:
            escape_next = True
            continue
        if char == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == '{':
            braces += 1
        elif char == '}':
            braces -= 1
        elif char == '[':
            brackets += 1
        elif char == ']':
            brackets -= 1
    
    # If we're inside a string, try to close it
    repaired = json_str.rstrip()
    if in_string:
        repaired += '"'
    
    # Close any unclosed brackets and braces
    repaired += ']' * brackets
    repaired += '}' * braces
    
    try:
        json.loads(repaired)
        return repaired
    except json.JSONDecodeError:
        pass
    
    # Try more aggressive repair: truncate to last complete file entry
    # Find the last complete "}" that closes a file object in the files array
    try:
        # Find "files": [ and work from there
        files_match = re.search(r'"files"\s*:\s*\[', json_str)
        if files_match:
            # Find all complete file objects
            array_start = files_match.end()
            last_complete_obj_end = -1
            depth = 0
            in_str = False
            esc = False
            
            for i in range(array_start, len(json_str)):
                c = json_str[i]
                if esc:
                    esc = False
                    continue
                if c == '\\' and in_str:
                    esc = True
                    continue
                if c == '"' and not esc:
                    in_str = not in_str
                    continue
                if in_str:
                    continue
                if c == '{':
                    depth += 1
                elif c == '}':
                    depth -= 1
                    if depth == 0:
                        last_complete_obj_end = i
            
            if last_complete_obj_end > 0:
                # Construct valid JSON up to last complete file object
                truncated = json_str[:last_complete_obj_end + 1]
                # Try to find description after files array or add a default
                repaired_json = truncated + '], "description": "Code generated successfully. Would you like me to make any changes?"}'
                try:
                    json.loads(repaired_json)
                    return repaired_json
                except json.JSONDecodeError:
                    pass
    except Exception:
        pass
    
    return None


def validate_and_clean_response(raw_content: str) -> dict:
    """Validate AI response and return cleaned JSON dict.
    
    Returns a dict with 'content' (cleaned JSON string) and 'valid' (bool).
    """
    cleaned = clean_ai_response(raw_content)
    
    # Try direct parse
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict) and "files" in parsed:
            return {"content": cleaned, "valid": True, "parsed": parsed}
    except json.JSONDecodeError:
        pass
    
    # Try repair
    repaired = try_repair_json(cleaned)
    if repaired:
        try:
            parsed = json.loads(repaired)
            if isinstance(parsed, dict) and "files" in parsed:
                logger.info("Successfully repaired truncated JSON response")
                return {"content": repaired, "valid": True, "parsed": parsed}
        except json.JSONDecodeError:
            pass
    
    # Return original with invalid flag
    logger.warning(f"Could not validate AI response JSON. First 300 chars: {raw_content[:300]}")
    return {"content": raw_content, "valid": False, "parsed": None}


@router.post("/generate")
async def generate_code(
    data: GenerateCodeRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """Generate code using AI - returns complete JSON response"""
    service = AIHubService()

    messages = [ChatMessage(role="system", content=SYSTEM_PROMPT)]

    if data.project_context:
        messages.append(ChatMessage(
            role="user",
            content=f"Current project files context:\n{data.project_context}"
        ))
        messages.append(ChatMessage(
            role="assistant",
            content="I understand the current project state. I'll modify or build upon these files based on your next instruction."
        ))

    for msg in data.messages:
        messages.append(ChatMessage(role=msg.role, content=msg.content))

    # Model fallback chain: try each model in order until one succeeds
    fallback_models = ["claude-opus-4.6", "deepseek-v4-pro", "gpt-5.4"]
    last_error = None
    model_used = None

    for model in fallback_models:
        request = GenTxtRequest(
            messages=messages,
            model=model,
            max_tokens=32768,
        )

        try:
            full_content = ""
            async for chunk in service.gentxt_stream(request):
                full_content += chunk

            if not full_content.strip():
                logger.warning(f"Model {model} returned empty response, trying next")
                last_error = "Empty response"
                continue

            # Validate and clean the response
            result = validate_and_clean_response(full_content)
            
            if result["valid"]:
                model_used = model
                logger.info(f"AI generation succeeded with model: {model}")
                return {"content": result["content"], "model_used": model_used, "valid": True}
            else:
                # Response received but JSON invalid - try a repair request with same model
                logger.warning(f"Model {model} returned invalid JSON, attempting repair request")
                repair_messages = [
                    ChatMessage(role="system", content="You previously generated an invalid JSON response. Please fix it and return ONLY a valid JSON object with the format: {\"files\": [...], \"description\": \"...\"}. No markdown, no extra text."),
                    ChatMessage(role="user", content=f"Fix this JSON and return only the corrected valid JSON:\n\n{full_content[:8000]}")
                ]
                repair_request = GenTxtRequest(
                    messages=repair_messages,
                    model=model,
                    max_tokens=32768,
                )
                try:
                    repair_content = ""
                    async for chunk in service.gentxt_stream(repair_request):
                        repair_content += chunk
                    
                    repair_result = validate_and_clean_response(repair_content)
                    if repair_result["valid"]:
                        model_used = model
                        logger.info(f"AI repair succeeded with model: {model}")
                        return {"content": repair_result["content"], "model_used": model_used, "valid": True}
                except Exception as repair_e:
                    logger.warning(f"Repair attempt failed for {model}: {repair_e}")
                
                # Still return the original content even if invalid - frontend will handle
                model_used = model
                logger.info(f"AI generation completed with model: {model} (response may need frontend parsing)")
                return {"content": full_content, "model_used": model_used, "valid": False}
                
        except Exception as e:
            error_msg = str(e)
            logger.warning(f"Model {model} failed: {error_msg}, trying next model")
            last_error = error_msg
            continue

    # All models failed
    logger.error(f"All AI models failed. Last error: {last_error}")
    raise HTTPException(
        status_code=500,
        detail=f"AI generation failed with all models. Last error: {last_error}"
    )