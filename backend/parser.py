"""Compatibility CLI for the parser service."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.parser import *  # noqa: E402,F403
from backend.services.parser import main  # noqa: E402

if __name__ == "__main__":
    main()
