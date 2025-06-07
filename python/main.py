import logging
from re import S
import traceback
import asyncio
import base64
import os
import threading
from dataclasses import dataclass
from copy import deepcopy
from typing import Dict, Tuple

from session import Session
from server import Server
from gui import GUI, GUISessionState

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, filename="debug.log", filemode="a")

HOST = "0.0.0.0"
PORT = 35714

button_symbol = {
    "Up": "↑",
    "Down": "↓",
    "Left": "←",
    "Right": "→",
    "Start": "☰",
    "Back": "❐",
    "Guide": "⭙",
}


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


async def server_main(gui: GUI) -> None:
    server = Server()

    def server_close_threadsafe() -> None:
        asyncio.run_coroutine_threadsafe(server.close(), server.main_loop)

    async def gui_session_add(server: Server, session: Session) -> None:
        gui.session_add_after_idle(session.session_id)
        session.on_change.add(gui_session_change)

    async def gui_session_change(session: Session) -> None:
        gui.session_change_after_idle(
            session.session_id, GUISessionState.from_session(session)
        )

    async def gui_session_del(server: Server, session: Session) -> None:
        gui.session_del_after_idle(session.session_id)

    server.on_connect.add(gui_session_add)
    server.on_disconnect.add(gui_session_del)

    gui.on_close.add(server_close_threadsafe)
    await server.run(HOST, PORT, get_path_prefix())


def server_thread_func(gui: GUI) -> None:
    try:
        asyncio.run(server_main(gui))
    except Exception:
        log.error(traceback.format_exc())
        gui.report_error()
        gui.close()


def main() -> None:
    gui = GUI()
    server_thread = threading.Thread(
        target=server_thread_func, args=(gui,), daemon=True
    )
    server_thread.start()
    gui.mainloop()
    server_thread.join()


if __name__ == "__main__":
    main()
