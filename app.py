"""
PIP-BOY 4000 — Main entry point.
Launches FastAPI backend in a background thread and opens a native desktop window.
"""

import json
import os
import sys
import threading
import time
import uvicorn
import webview
import httpx
from paths import get_bundle_dir, get_data_dir

# Ensure we're running from the bundle/source directory
os.chdir(str(get_bundle_dir()))

CONFIG_FILE = get_data_dir() / "config.json"


def _load_config() -> dict:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


_cfg = _load_config()
HOST = _cfg.get("app_host", "127.0.0.1")
PORT = _cfg.get("app_port", 8042)


def start_server():
    """Run FastAPI in a background thread."""
    uvicorn.run("api:app", host=HOST, port=PORT, log_level="warning")


def wait_for_server(timeout=15):
    """Wait for the FastAPI server to be ready."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = httpx.get(f"http://{HOST}:{PORT}/api/health", timeout=2)
            if resp.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.3)
    return False


def main():
    # Start FastAPI server in background
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Wait for server to be ready
    print("⣾ Starting PIP-BOY 4000...")
    if not wait_for_server():
        print("✗ Failed to start backend server. Exiting.")
        sys.exit(1)

    print("✓ PIP-BOY 4000 online. Opening terminal...")

    # Check for GTK3 on Linux (pywebview requires it)
    if sys.platform.startswith("linux"):
        try:
            import gi
            gi.require_version("Gtk", "3.0")
        except (ImportError, ValueError):
            print(
                "✗ GTK3 not found. pywebview needs GTK3 + WebKit2 on Linux.\n"
                "  Debian/Ubuntu: sudo apt install python3-gi python3-gi-cairo "
                "gir1.2-gtk-3.0 gir1.2-webkit2-4.1\n"
                "  Fedora: sudo dnf install python3-gobject gtk3 webkit2gtk4.1"
            )
            sys.exit(1)

    # Launch native desktop window
    window = webview.create_window(
        title="PIP-BOY 4000",
        url=f"http://{HOST}:{PORT}",
        width=900,
        height=700,
        min_size=(600, 400),
        resizable=True,
        background_color="#0a0e0a",
        text_select=True,
    )

    # Start the GUI event loop (blocks until window is closed)
    webview.start(debug=False)


if __name__ == "__main__":
    main()
