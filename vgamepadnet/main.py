import logging
import traceback
import asyncio
import base64
import os
import threading
import socket
from typing import List

from .session import Session
from .server import Server
from . import gui
from .gui import GUI

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, filename="debug.log", filemode="a")

HOST = "0.0.0.0"
PORT = 35714


def get_path_prefix() -> str:
    try:
        with open("path_prefix.txt", "r") as f:
            path_prefix = f.read().strip()
            if len(path_prefix) != 8 or not all(
                ch in "234567abcdefghijklmnopqrstuvwxyz" for ch in path_prefix
            ):
                raise FileNotFoundError("Update format")
            return path_prefix
    except FileNotFoundError:
        path_prefix = base64.b32encode(os.urandom(5)).decode("utf-8").lower()
        with open("path_prefix.txt", "w") as f:
            f.write(path_prefix)
        return path_prefix


async def server_main(guiwindow: GUI) -> None:
    server = Server()

    def server_close_threadsafe() -> None:
        asyncio.run_coroutine_threadsafe(server.close(), server.main_loop)

    async def gui_session_add(server: Server, session: Session) -> None:
        guiwindow.queue.put(gui.SessionAddEvent(session.session_id))
        session.on_change.add(gui_session_change)

    async def gui_session_change(session: Session) -> None:
        guiwindow.queue.put(
            gui.SessionChangeEvent(
                session.session_id, gui.SessionState.from_session(session)
            )
        )

    async def gui_session_del(server: Server, session: Session) -> None:
        guiwindow.queue.put(gui.SessionDelEvent(session.session_id))
        session.on_change.remove(gui_session_change)

    path_prefix = get_path_prefix()

    def gui_links() -> None:
        links: List[str] = []
        for ipaddr in socket.gethostbyname_ex(socket.gethostname())[2]:
            links.append(f"http://{ipaddr}:{PORT}/{path_prefix}/")
        guiwindow.queue.put(gui.LinkUpdateEvent(links))

    server.on_connect.add(gui_session_add)
    server.on_disconnect.add(gui_session_del)
    guiwindow.on_link_refresh_button_click.add(gui_links)
    gui_links()

    guiwindow.on_close.add(server_close_threadsafe)
    await server.run(HOST, PORT, path_prefix)


def server_thread_func(guiwindow: GUI) -> None:
    try:
        asyncio.run(server_main(guiwindow))
    except Exception:
        log.error(traceback.format_exc())
        guiwindow.queue.put(gui.ErrorEvent())
        guiwindow.queue.shutdown()


def main() -> None:
    guiwindow = GUI()
    server_thread = threading.Thread(
        target=server_thread_func, args=(guiwindow,), daemon=True
    )
    server_thread.start()
    guiwindow.mainloop()
    server_thread.join()
