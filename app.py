"""
PIP-BOY 4000 — Main entry point.
Launches FastAPI backend in a background thread and opens a native macOS window.
"""

import os
import sys
import threading
import time
import uvicorn
import webview
import httpx

# Ensure we're running from the script's directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

HOST = "127.0.0.1"
PORT = 8042  # Vault-Tec approved port


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

    # Launch native macOS window
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
