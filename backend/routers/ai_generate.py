import logging
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
12. Never put code or technical JSON in the description field - keep it human-readable and encouraging"""


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
            max_tokens=16384,
        )

        try:
            full_content = ""
            async for chunk in service.gentxt_stream(request):
                full_content += chunk

            if not full_content.strip():
                logger.warning(f"Model {model} returned empty response, trying next")
                last_error = "Empty response"
                continue

            model_used = model
            logger.info(f"AI generation succeeded with model: {model}")
            return {"content": full_content, "model_used": model_used}
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