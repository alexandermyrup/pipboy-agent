"""
FastAPI backend — handles chat requests, streaming, and safety verification chain.
"""

import json
import httpx
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from router import route, BASE_MODEL

app = FastAPI()

OLLAMA_URL = "http://localhost:11434"
PROMPT_FILE = Path(__file__).parent / "system_prompt.txt"

CLARIFY_INSTRUCTIONS = """\
CLARIFICATION MODE (ACTIVE):
Before answering, assess your certainty about what the user is really asking.
- If your certainty is 80% or above: answer directly, no questions needed.
- If below 80%: ask 1-2 focused clarifying questions first. Be specific — don't ask vague or obvious things.
- Keep your questions short. Use a brief sentence explaining why you're asking, then the questions as a numbered list.
- After the user answers, give your full response. Do not ask follow-up questions unless critical context is still missing.
- NEVER ask clarifying questions for urgent or emergency situations. Answer immediately."""


def load_system_prompt() -> str:
    """Load system prompt from file. Falls back to a minimal default."""
    try:
        return PROMPT_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return "You are PIP-BOY 4000, a post-apocalyptic survival assistant."

# Conversation history (in-memory for now)
conversation_history: list[dict] = []


async def check_ollama() -> bool:
    """Check if Ollama is running."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags", timeout=5)
            return resp.status_code == 200
    except Exception:
        return False


async def stream_chat(model: str, messages: list[dict], think: bool = True):
    """Stream a chat response from Ollama."""
    payload = {"model": model, "messages": messages, "stream": True, "think": think}
    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_URL}/api/chat",
            json=payload,
        ) as resp:
            async for line in resp.aiter_lines():
                if line.strip():
                    yield json.loads(line)


async def generate_full_response(model: str, messages: list[dict]) -> str:
    """Get a complete (non-streamed) response from Ollama."""
    full_text = ""
    async for chunk in stream_chat(model, messages):
        content = chunk.get("message", {}).get("content", "")
        full_text += content
    return full_text


@app.get("/api/health")
async def health():
    """Check if Ollama is running and models are available."""
    ollama_ok = await check_ollama()
    if not ollama_ok:
        return {"status": "error", "message": "Ollama is not running. Start it with: ollama serve"}

    # Check available models
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags", timeout=5)
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return {"status": "ok", "models": models}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/chat")
async def chat(request: Request):
    """
    Main chat endpoint. Routes to the right model,
    and chains code review if it's a code query.
    """
    body = await request.json()
    user_message = body.get("message", "").strip()
    think = body.get("think", True)
    if not user_message:
        return {"error": "Empty message"}

    # Route the query
    routing = route(user_message)
    model = routing["model"]
    is_code = routing["is_code"]
    reason = routing["reason"]

    # Add user message to history
    conversation_history.append({"role": "user", "content": user_message})

    async def event_stream():
        # Send routing info
        yield json.dumps({
            "type": "status",
            "stage": "routing",
            "model": model,
            "is_code": is_code,
            "reason": reason,
        }) + "\n"

        # Stage 1: Generate response from primary model
        yield json.dumps({
            "type": "status",
            "stage": "generating",
            "model": model,
        }) + "\n"

        # Build messages with system prompt (reload from file each request)
        system_content = load_system_prompt()
        if think and not is_code:
            system_content += "\n\n" + CLARIFY_INSTRUCTIONS

        messages_with_system = [
            {"role": "system", "content": system_content},
            *conversation_history,
        ]

        full_response = ""
        async for chunk in stream_chat(model, messages_with_system, think=think):
            content = chunk.get("message", {}).get("content", "")
            if content:
                full_response += content
                yield json.dumps({
                    "type": "token",
                    "content": content,
                    "stage": "generating",
                }) + "\n"

        # Stage 2: If code query, have base model review
        if is_code:
            yield json.dumps({
                "type": "status",
                "stage": "reviewing",
                "model": BASE_MODEL,
            }) + "\n"

            review_messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a survival safety verifier. Review the following survival advice "
                        "for accuracy and safety. Check for: dangerous mistakes, missing critical "
                        "warnings, bad priorities, or myths presented as fact. "
                        "Be concise. Format as a short bullet list. "
                        "If the advice is solid, say so briefly — don't invent problems."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Original question: {user_message}\n\nSurvival advice to verify:\n{full_response}",
                },
            ]

            review_text = ""
            async for chunk in stream_chat(BASE_MODEL, review_messages):
                content = chunk.get("message", {}).get("content", "")
                if content:
                    review_text += content
                    yield json.dumps({
                        "type": "token",
                        "content": content,
                        "stage": "reviewing",
                    }) + "\n"

            # Store the combined response in history
            combined = full_response + "\n\n---\n**Code Review:**\n" + review_text
            conversation_history.append({"role": "assistant", "content": combined})
        else:
            # Store response in history
            conversation_history.append({"role": "assistant", "content": full_response})

        # Done
        yield json.dumps({"type": "status", "stage": "complete"}) + "\n"

    return StreamingResponse(event_stream(), media_type="text/plain")


@app.post("/api/clear")
async def clear_history():
    """Clear conversation history."""
    conversation_history.clear()
    return {"status": "ok"}


@app.get("/api/prompt")
async def get_prompt():
    """Return the current system prompt."""
    return {"prompt": load_system_prompt()}


@app.post("/api/prompt")
async def save_prompt(request: Request):
    """Save a new system prompt to file."""
    body = await request.json()
    new_prompt = body.get("prompt", "").strip()
    if not new_prompt:
        return {"error": "Prompt cannot be empty"}
    PROMPT_FILE.write_text(new_prompt, encoding="utf-8")
    return {"status": "ok", "length": len(new_prompt)}


# Serve static files (HTML/CSS/JS)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
