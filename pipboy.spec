# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for PIP-BOY 4000 macOS .app bundle."""

import sys
from pathlib import Path

block_cipher = None
src = Path(SPECPATH)

a = Analysis(
    [str(src / "app.py")],
    pathex=[str(src)],
    binaries=[],
    datas=[
        (str(src / "static"), "static"),
        (str(src / "system_prompt.txt"), "."),
        (str(src / "config.json"), "."),
    ],
    hiddenimports=[
        "webview",
        "webview.platforms.cocoa",
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "fastapi",
        "api",
        "router",
        "paths",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "PyQt5",
        "PySide6",
        "PySide2",
        "PyQt6",
        "tkinter",
        "matplotlib",
        "numpy",
        "pandas",
        "scipy",
        "IPython",
        "jupyter",
        "notebook",
        "nbformat",
        "black",
        "pygments",
        "PIL",
        "zmq",
        "pygame",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="PIP-BOY 4000",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    target_arch=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="PIP-BOY 4000",
)

app = BUNDLE(
    coll,
    name="PIP-BOY 4000.app",
    bundle_identifier="com.pipboy4000.app",
)
