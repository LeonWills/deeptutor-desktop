"""PyInstaller entry point for the DeepTutor FastAPI backend.

Mirrors `deeptutor_cli.main serve` with desktop-friendly defaults: loopback
binding and a port taken from the environment so the Electron shell stays in
control of wiring.
"""

from __future__ import annotations

import os
import sys


def main() -> None:
    port = int(os.environ.get("DEEPTUTOR_BACKEND_PORT", "8001"))
    host = os.environ.get("DEEPTUTOR_BACKEND_HOST", "127.0.0.1")

    if sys.platform == "win32":
        import asyncio

        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    import uvicorn

    try:
        from deeptutor.services.config import (
            HTTP_KEEP_ALIVE_TIMEOUT,
            get_ws_max_size,
        )

        ws_max_size = get_ws_max_size()
        keep_alive = HTTP_KEEP_ALIVE_TIMEOUT
    except Exception:
        ws_max_size = 64 * 1024 * 1024
        keep_alive = 75

    uvicorn.run(
        "deeptutor.api.main:app",
        host=host,
        port=port,
        reload=False,
        workers=1,
        proxy_headers=False,
        ws_max_size=ws_max_size,
        timeout_keep_alive=keep_alive,
        log_level="info",
    )


if __name__ == "__main__":
    main()
