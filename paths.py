"""
Path resolution for PIP-BOY 4000 — works both in dev mode and as a PyInstaller bundle.

Two kinds of paths:
  - bundle_dir: read-only files shipped with the app (static/, default configs)
  - data_dir:   writable user files (config.json, system_prompt.txt, conversations/)
"""

import shutil
import sys
from pathlib import Path

_SOURCE_DIR = Path(__file__).parent


def is_bundled() -> bool:
    """True when running inside a PyInstaller bundle."""
    return getattr(sys, "_MEIPASS", None) is not None


def get_bundle_dir() -> Path:
    """Return the directory containing bundled read-only files (static/, defaults)."""
    if is_bundled():
        return Path(sys._MEIPASS)
    return _SOURCE_DIR


def get_data_dir() -> Path:
    """Return the directory for writable user files (config, prompt, conversations).

    In dev mode this is just the project root.
    In a bundle it's ~/.pipboy4000/, created on first run with default files copied in.
    """
    if not is_bundled():
        return _SOURCE_DIR

    data = Path.home() / ".pipboy4000"
    data.mkdir(exist_ok=True)

    # Copy default files from bundle on first run
    bundle = get_bundle_dir()
    for filename in ("config.json", "system_prompt.txt"):
        dest = data / filename
        src = bundle / filename
        if not dest.exists() and src.exists():
            shutil.copy2(src, dest)

    return data
