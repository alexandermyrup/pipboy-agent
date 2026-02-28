# PIP-BOY 4000 — Roadmap

> Ideas and future directions. Not commitments — just a running list.

---

## Distribution & Onboarding

- [ ] **One-click install from GitHub** — Single download that works out of the box. Could be a `.dmg` for macOS, or a shell script (`curl | bash`) that pulls the repo, installs deps, and creates the .app shortcut automatically.
- [ ] **Easy local model connection** — Guide or auto-detect flow so other people can point PIP-BOY at their own Ollama instance. Should handle: Ollama not installed, model not pulled, wrong port, etc. Maybe a first-run setup screen.
- [ ] **Remove Python dependency** — Python + pip + venv is a friction point. Options:
  - Rewrite backend in Go or Rust (single binary, no runtime needed)
  - Bundle Python with PyInstaller/Nuitka (fatter but keeps current code)
  - Move to a JS/Electron or Tauri stack (Tauri = Rust backend + webview, similar to current pywebview approach but compiles to a native binary)
  - **Tauri is probably the best fit** — keeps the web UI, drops Python, produces a small native app

## Features

- [ ] **Conversation persistence** — Save/load chat history to disk so conversations survive restarts
- [ ] **Export conversations** — Save a chat as markdown or plain text
- [ ] **Multiple models** — Let the user pick from available Ollama models, not just hardcoded qwen3.5
- [ ] **Offline knowledge packs** — Bundled reference docs (first aid, edible plants, knot guides) that can be searched without the LLM
- [ ] **Voice input** — Hands-free querying via local speech-to-text (Whisper)
- [ ] **Mobile/tablet layout** — Responsive UI for smaller screens or a PWA wrapper

## Polish

- [ ] **Startup reliability** — Better error handling if Ollama is slow to start, port conflicts, etc.
- [ ] **Loading states** — Show something useful while waiting for the model to load on first query
- [ ] **System tray / menu bar** — Keep PIP-BOY running in background, quick access
- [ ] **Keyboard shortcuts** — Quick clear, focus input, scroll to top/bottom

## Stretch

- [ ] **Cross-platform** — Windows and Linux support (Tauri would help here)
- [ ] **Plugin system** — Let users add custom knowledge modules
- [ ] **Actual Pip-Boy hardware shell** — 3D printed case with a screen, runs on a Pi
