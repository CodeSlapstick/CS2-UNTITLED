"""Filesystem settings shared by the API, parser, and worker."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS_DIR = ROOT / "assets"
DEMOS_DIR = Path(os.environ.get("DEMOS_DIR", ROOT / "demos" / "uploads"))
JSON_DIR = Path(os.environ.get("JSON_DIR", ROOT / "output" / "json"))

PUBLIC_URL = os.environ.get("PUBLIC_URL", "").rstrip("/")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "").rstrip("/")
GUEST_DEMO_FILE = os.environ.get("GUEST_DEMO_FILE", "").strip()
