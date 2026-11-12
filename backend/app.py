"""Stable ASGI entry point.

Application assembly and HTTP routes live in :mod:`backend.routes.application`.
Keeping this module preserves ``backend.app:app`` for Uvicorn and existing tools.
"""

from backend.routes.application import *  # noqa: F403
from backend.routes.application import _safe_next  # noqa: F401
