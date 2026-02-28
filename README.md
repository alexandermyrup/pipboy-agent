# PIP-BOY 4000

A post-apocalyptic survival assistant that runs entirely on your local machine. No internet, no cloud, no telemetry — just a retro CRT terminal powered by local LLMs through Ollama.

PIP-BOY 4000 answers any survival question with practical, actionable advice: first aid, shelter, water purification, self-defense, field medicine, natural disasters, and more. It treats every query as if you have no other resources available.

## Prerequisites

- **Python 3.11+**
- **Ollama** — local LLM runtime ([ollama.com](https://ollama.com))
- At least one Ollama model installed — browse available models at [ollama.com/library](https://ollama.com/library) (e.g., `ollama pull llama3.1` or `ollama pull qwen3.5`)

## Install

```bash
git clone https://github.com/alexandermyrup/pipboy-agent.git
cd pipboy-agent
pip install -r requirements.txt
```

## Run

1. Start Ollama (if not already running):
   ```bash
   ollama serve
   ```

2. Launch PIP-BOY 4000:
   ```bash
   python app.py
   ```

   This starts the FastAPI backend and opens a native desktop window. On first launch you'll be prompted to select a model.

## Configuration

Settings are stored in `config.json`:

| Key | Default | Description |
|-----|---------|-------------|
| `active_model` | *(none)* | Currently selected Ollama model |
| `ollama_url` | `http://localhost:11434` | Ollama API base URL |
| `app_host` | `127.0.0.1` | Host the backend binds to |
| `app_port` | `8042` | Port the backend listens on |

Edit `config.json` directly and restart the app for changes to take effect.

The system prompt (the personality and instructions sent to the model) lives in `system_prompt.txt` and can also be edited through the in-app settings panel.

## Architecture

```
app.py          — Entry point: starts FastAPI server + native window (pywebview)
api.py          — FastAPI backend: chat streaming, model management, safety review chain
router.py       — Query classifier: detects urgent/emergency queries for safety review
system_prompt.txt — System prompt sent to the LLM
config.json     — Persisted settings (model, URLs, ports)
static/
  index.html    — CRT terminal UI
  style.css     — Green phosphor retro styling
  app.js        — Chat logic, streaming, model selection
```

**How a message flows:**

1. User sends a message via the terminal UI
2. `router.py` classifies it as urgent (emergency) or general knowledge
3. The active model generates a streamed response
4. If urgent: a second pass runs a safety review on the advice
5. Response streams back to the UI token-by-token

## Platform Notes

- **macOS**: Works out of the box with `pywebview`.
- **Windows**: Requires `pywebview` with the default CEF or EdgeChromium backend. Install normally via pip.
- **Linux**: Requires GTK3 and WebKit2 for `pywebview`. Install system dependencies first:
  ```bash
  # Debian/Ubuntu
  sudo apt install python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1

  # Fedora
  sudo dnf install python3-gobject gtk3 webkit2gtk4.1
  ```

## Ethical Disclaimer

PIP-BOY 4000 is designed as a fictional survival tool. Its system prompt instructs the model to answer all survival-related questions without refusal, operating under the premise that civilization has collapsed and the user has no other resources.

This is a creative/educational project. The unrestricted survival framing exists for the post-apocalyptic scenario only. The advice comes from a local LLM and should not be treated as professional medical, legal, or safety guidance. Use your own judgment.
