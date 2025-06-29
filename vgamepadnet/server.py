import logging
import asyncio
import traceback
from pathlib import Path
from typing import Awaitable, Union, Optional, Callable, Set

from aiohttp import web

from .session import Session

log = logging.getLogger(__name__)


class Server:
    """
    浏览器可以直接访问的操作服务器
    """

    def __init__(self) -> None:
        self.runner: Optional[web.AppRunner] = None
        self.app: Optional[web.Application] = None
        self.site: Optional[web.TCPSite] = None

        self.main_loop = asyncio.get_running_loop()

        self.clients: Set[Session] = set()
        self.session_id_used: Set[int] = set()

        self.on_connect: Set[Callable[[Server, Session], Awaitable[None]]] = set()
        self.on_disconnect: Set[Callable[[Server, Session], Awaitable[None]]] = set()

        self._close_event = asyncio.Event()

    @staticmethod
    def static_resp(
        filename: str, minetype: str
    ) -> Callable[[web.Request], Awaitable[web.Response]]:
        async def callback(request: web.Request) -> web.Response:
            with open(Path(__file__).parent.parent / "web" / filename, "rb") as f:
                return web.Response(
                    body=f.read(), charset="utf-8", content_type=minetype
                )

        return callback

    async def dynamic_websocket_handler(
        self, request: web.Request
    ) -> Union[web.WebSocketResponse, web.Response]:
        ws = web.WebSocketResponse(heartbeat=2)
        await ws.prepare(request)
        session_id_next = 1
        while session_id_next in self.session_id_used:
            session_id_next += 1
        self.session_id_used.add(session_id_next)
        session = Session(session_id_next, ws)
        self.clients.add(session)
        for cb in self.on_connect:
            try:
                await cb(self, session)
            except Exception:
                log.error(traceback.format_exc())
        await session.run()
        for cb in self.on_disconnect:
            try:
                await cb(self, session)
            except Exception:
                log.error(traceback.format_exc())
        self.clients.remove(session)
        self.session_id_used.remove(session_id_next)
        return ws

    async def run(self, host: str, port: int, path_prefix: str) -> None:
        self.app = web.Application()
        self.app.router.add_get(
            f"/{path_prefix}/websocket", self.dynamic_websocket_handler
        )
        self.app.router.add_get(
            f"/{path_prefix}/", self.static_resp("index.html", "text/html")
        )
        self.app.router.add_get(
            f"/{path_prefix}/script.js",
            self.static_resp("script.js", "text/javascript"),
        )
        self.app.router.add_get(
            f"/{path_prefix}/nosleep.js",
            self.static_resp("nosleep.js", "text/javascript"),
        )
        self.app.router.add_get(
            f"/{path_prefix}/style.css",
            self.static_resp("style.css", "text/css"),
        )
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        self.site = web.TCPSite(self.runner, host, port)
        await self.site.start()
        await self._close_event.wait()
        for client in self.clients.copy():
            await client.close()
        if self.runner is not None:
            await self.runner.cleanup()

    async def close(self) -> None:
        self._close_event.set()
