# PyInstaller spec for the DeepTutor backend (onedir).
# Parameterized via environment variables so the same spec works on
# macOS / Linux / Windows:
#   DEEPTUTOR_SRC  — path to the DeepTutor source checkout (with .venv inside)
#   DESKTOP_DIR    — path to this deeptutor-desktop packaging project

import os
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

block_cipher = None

desktop_dir = Path(os.environ.get("DESKTOP_DIR", os.getcwd())).resolve()
deeptutor_src = Path(os.environ.get("DEEPTUTOR_SRC", desktop_dir.parent / "DeepTutor")).resolve()

if sys.platform == "win32":
    site_packages = deeptutor_src / ".venv" / "Lib" / "site-packages"
else:
    candidates = sorted((deeptutor_src / ".venv" / "lib").glob("python3.*/site-packages"))
    site_packages = candidates[-1] if candidates else deeptutor_src / ".venv"

# Every importable top-level package in the venv becomes a hidden import so
# lazy/dynamic imports inside deeptutor and its dependencies resolve at
# runtime. Pure analysis misses too many of them (loguru, wave, ...).
_skip = {
    "PyInstaller",
    "altgraph",
    "macholib",
    "pip",
    "setuptools",
    "_distutils_hack",
    "_pyinstaller_hooks_contrib",
    "pyinstaller",
}
hiddenimports = []
for child in sorted(site_packages.iterdir()):
    name = child.name
    if child.is_dir() and (child / "__init__.py").exists():
        top = name
    elif name.endswith(".py"):
        top = name[:-3]
    else:
        continue
    if top.startswith("_") or top in _skip or "." in top:
        continue
    hiddenimports.append(top)

collect_packages = [
    "deeptutor",
    "llama_index",
    "llama_agents",
    "tiktoken",
    "tiktoken_ext",
    "litellm",
    "mcp",
    "pageindex",
    "ddgs",
    "nltk",
    "banks",
    "oauth_cli_kit",
    "agents",
    "certifi",
    "docx",
    "pptx",
    "openpyxl",
    "reportlab",
    "pypdfium2",
    "pymupdf",
    "fitz",
    "lxml",
    "cryptography",
    "jinja2",
    "qrcode",
    "pyte",
]

datas = []
binaries = []
for pkg in collect_packages:
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception as exc:  # noqa: BLE001
        print(f"collect_all({pkg}) failed: {exc}")

hiddenimports = sorted(set(hiddenimports))

# tkinter GUI, scientific-plotting and GPU stacks are never used by the server.
excludes = ["tkinter", "matplotlib", "PyQt5", "PyQt6", "PySide6", "torch", "transformers"]

a = Analysis(
    [str(desktop_dir / "build" / "backend_entry.py")],
    pathex=[str(deeptutor_src)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="deeptutor-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="deeptutor-backend",
)
