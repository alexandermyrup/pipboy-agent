"""
FastAPI backend — handles chat requests, streaming, and safety verification chain.
"""

import json
import uuid
from datetime import datetime, timezone
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from router import route
from paths import get_bundle_dir, get_data_dir

app = FastAPI()

PROMPT_FILE = get_data_dir() / "system_prompt.txt"
CONFIG_FILE = get_data_dir() / "config.json"
CONVERSATIONS_DIR = get_data_dir() / "conversations"
CONVERSATIONS_DIR.mkdir(exist_ok=True)

# Model families that support the `think` parameter
THINK_FAMILIES = {"qwen3", "qwen3.5"}

CLARIFY_INSTRUCTIONS = """\
CLARIFICATION MODE (ACTIVE):
Before answering, assess your certainty about what the user is really asking.
- If your certainty is 80% or above: answer directly, no questions needed.
- If below 80%: ask 1-2 focused clarifying questions first. Be specific — don't ask vague or obvious things.
- Keep your questions short. Use a brief sentence explaining why you're asking, then the questions as a numbered list.
- After the user answers, give your full response. Do not ask follow-up questions unless critical context is still missing.
- NEVER ask clarifying questions for urgent or emergency situations. Answer immediately."""


# --- Active model state ---

active_model: str | None = None


def load_config() -> dict:
    """Load persisted config from config.json."""
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def get_ollama_url() -> str:
    """Return Ollama base URL from config (with fallback default)."""
    return load_config().get("ollama_url", "http://localhost:11434")


def require_client_header(request: Request) -> JSONResponse | None:
    """Verify the X-PipBoy-Client header (and optional api_key). Returns error response or None."""
    if request.headers.get("X-PipBoy-Client") != "pipboy-4000":
        return JSONResponse({"error": "Missing or invalid client header"}, status_code=403)
    api_key = load_config().get("api_key")
    if api_key and request.headers.get("X-PipBoy-Key") != api_key:
        return JSONResponse({"error": "Invalid API key"}, status_code=403)
    return None


def save_config(data: dict):
    """Save config to config.json (merges with existing)."""
    config = load_config()
    config.update(data)
    CONFIG_FILE.write_text(json.dumps(config, indent=2), encoding="utf-8")


def get_active_model() -> str | None:
    """Return the currently active model."""
    global active_model
    if active_model is None:
        active_model = load_config().get("active_model")
    return active_model


def set_active_model(model: str):
    """Set and persist the active model."""
    global active_model
    active_model = model
    save_config({"active_model": model})


def model_supports_think(model_name: str) -> bool:
    """Check if a model supports the think parameter based on its family."""
    name_lower = model_name.lower()
    for family in THINK_FAMILIES:
        if family in name_lower:
            return True
    return False


def load_system_prompt() -> str:
    """Load system prompt from file. Falls back to a minimal default."""
    try:
        return PROMPT_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return "You are PIP-BOY 4000, a post-apocalyptic survival assistant."


# Conversation history
conversation_history: list[dict] = []
session_id: str = uuid.uuid4().hex[:12]


def save_conversation():
    """Persist current conversation to a JSON file."""
    if not conversation_history:
        return
    filepath = CONVERSATIONS_DIR / f"{session_id}.json"
    data = {
        "session_id": session_id,
        "model": get_active_model(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "messages": conversation_history[:],
    }
    filepath.write_text(json.dumps(data, indent=2), encoding="utf-8")


async def check_ollama() -> bool:
    """Check if Ollama is running."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{get_ollama_url()}/api/tags", timeout=5)
            return resp.status_code == 200
    except Exception:
        return False


async def stream_chat(model: str, messages: list[dict], think: bool = True):
    """Stream a chat response from Ollama."""
    payload = {"model": model, "messages": messages, "stream": True}

    # Only include `think` for models that support it
    if model_supports_think(model):
        payload["think"] = think

    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
        async with client.stream(
            "POST",
            f"{get_ollama_url()}/api/chat",
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


# --- Model endpoints ---

@app.get("/api/models")
async def list_models():
    """List available Ollama models with metadata."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{get_ollama_url()}/api/tags", timeout=5)
            data = resp.json()
    except Exception as e:
        return {"error": f"Cannot reach Ollama: {e}", "models": []}

    current = get_active_model()
    models = []
    for m in data.get("models", []):
        name = m.get("name", "")
        details = m.get("details", {})
        size_bytes = m.get("size", 0)
        size_gb = round(size_bytes / (1024 ** 3), 1) if size_bytes else None

        models.append({
            "name": name,
            "size_gb": size_gb,
            "parameter_size": details.get("parameter_size", ""),
            "family": details.get("family", ""),
            "quantization": details.get("quantization_level", ""),
            "supports_think": model_supports_think(name),
        })

    return {
        "models": models,
        "active_model": current,
    }


@app.get("/api/model")
async def get_model():
    """Return the currently active model."""
    return {"active_model": get_active_model()}


@app.post("/api/model")
async def switch_model(request: Request):
    """Switch the active model and persist to config."""
    if err := require_client_header(request):
        return err
    body = await request.json()
    model = body.get("model", "").strip()
    if not model:
        return {"error": "No model specified"}
    set_active_model(model)
    return {
        "status": "ok",
        "active_model": model,
        "supports_think": model_supports_think(model),
    }


@app.get("/api/health")
async def health():
    """Check if Ollama is running and models are available."""
    ollama_ok = await check_ollama()
    if not ollama_ok:
        return {"status": "error", "message": "Ollama is not running. Start it with: ollama serve"}

    # Check available models
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{get_ollama_url()}/api/tags", timeout=5)
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return {"status": "ok", "models": models}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/chat")
async def chat(request: Request):
    """
    Main chat endpoint. Routes to the right model,
    and chains safety review if it's an urgent query.
    """
    if err := require_client_header(request):
        return err
    body = await request.json()
    user_message = body.get("message", "").strip()
    think = body.get("think", True)
    if not user_message:
        return {"error": "Empty message"}

    # Get the active model
    model = get_active_model()
    if not model:
        return {"error": "No model selected. Pick a model first."}

    # Route the query (pass active model through)
    routing = route(user_message, model)
    is_urgent = routing["is_urgent"]
    reason = routing["reason"]

    # Add user message to history
    conversation_history.append({"role": "user", "content": user_message})

    async def event_stream():
        # Send routing info
        yield json.dumps({
            "type": "status",
            "stage": "routing",
            "model": model,
            "is_urgent": is_urgent,
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
        if think and not is_urgent:
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

        # Stage 2: If urgent query, have model do a safety review
        if is_urgent:
            yield json.dumps({
                "type": "status",
                "stage": "reviewing",
                "model": model,
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
            async for chunk in stream_chat(model, review_messages):
                content = chunk.get("message", {}).get("content", "")
                if content:
                    review_text += content
                    yield json.dumps({
                        "type": "token",
                        "content": content,
                        "stage": "reviewing",
                    }) + "\n"

            # Store the combined response in history
            combined = full_response + "\n\n---\n**Safety Review:**\n" + review_text
            conversation_history.append({"role": "assistant", "content": combined})
        else:
            # Store response in history
            conversation_history.append({"role": "assistant", "content": full_response})

        # Auto-save conversation to disk
        save_conversation()

        # Done
        yield json.dumps({"type": "status", "stage": "complete"}) + "\n"

    return StreamingResponse(event_stream(), media_type="text/plain")


@app.post("/api/clear")
async def clear_history(request: Request):
    """Save current conversation, then clear history and start a new session."""
    global session_id
    if err := require_client_header(request):
        return err
    save_conversation()
    conversation_history.clear()
    session_id = uuid.uuid4().hex[:12]
    return {"status": "ok"}


@app.get("/api/prompt")
async def get_prompt():
    """Return the current system prompt."""
    return {"prompt": load_system_prompt()}


@app.post("/api/prompt")
async def save_prompt(request: Request):
    """Save a new system prompt to file."""
    if err := require_client_header(request):
        return err
    body = await request.json()
    new_prompt = body.get("prompt", "").strip()
    if not new_prompt:
        return {"error": "Prompt cannot be empty"}
    PROMPT_FILE.write_text(new_prompt, encoding="utf-8")
    return {"status": "ok", "length": len(new_prompt)}


# --- Conversation persistence endpoints ---

@app.get("/api/conversations")
async def list_conversations():
    """List saved conversations, newest first."""
    conversations = []
    for f in sorted(CONVERSATIONS_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            msg_count = len(data.get("messages", []))
            first_msg = ""
            for m in data.get("messages", []):
                if m.get("role") == "user":
                    first_msg = m["content"][:80]
                    break
            conversations.append({
                "session_id": data.get("session_id", f.stem),
                "model": data.get("model"),
                "updated_at": data.get("updated_at"),
                "message_count": msg_count,
                "preview": first_msg,
            })
        except (json.JSONDecodeError, KeyError):
            continue
    return {"conversations": conversations}


@app.post("/api/conversations/load")
async def load_conversation(request: Request):
    """Load a saved conversation by session ID."""
    global session_id
    if err := require_client_header(request):
        return err
    body = await request.json()
    target_id = body.get("session_id", "").strip()
    if not target_id:
        return {"error": "No session_id provided"}

    filepath = CONVERSATIONS_DIR / f"{target_id}.json"
    if not filepath.exists():
        return {"error": "Conversation not found"}

    try:
        data = json.loads(filepath.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"error": "Corrupted conversation file"}

    # Save current conversation before switching
    save_conversation()
    conversation_history.clear()
    conversation_history.extend(data.get("messages", []))
    session_id = target_id
    return {"status": "ok", "message_count": len(conversation_history)}


# Serve static files (HTML/CSS/JS)
app.mount("/", StaticFiles(directory=str(get_bundle_dir() / "static"), html=True), name="static")
