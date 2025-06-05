import logging
import traceback
import asyncio
import socket
import base64
import os
from typing import Awaitable, Union, Optional, Callable
import tkinter as tk
from tkinter import ttk
import threading

from aiohttp import web, WSMsgType
import vgamepad  # type: ignore

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, filename="debug.log", filemode="a")

WS_HEARTBEAT = 2
PORT = 35714


class VGamepadNet:
    def __init__(self, pad_id: int) -> None:
        self.pad_id = pad_id

        self.vibrate = 0.0
        self.vibrate_peak = 0.0

        self.ws: Optional[web.WebSocketResponse] = None
        self.main_loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()

        self.gamepad = vgamepad.VX360Gamepad()
        self.gamepad.register_notification(self.update_status)

    def update_status(  # type: ignore
        self, client, target, large_motor, small_motor, led_number, user_data
    ):
        self.vibrate = max(large_motor, small_motor) / 255
        if self.vibrate_peak < self.vibrate:
            self.vibrate_peak = self.vibrate
        log.debug(f"< vibrate {self.vibrate}")
        if self.ws is not None:
            coro = self.ws.send_str(f"vibrate {self.vibrate}")
            asyncio.run_coroutine_threadsafe(coro, self.main_loop)

    def gamepad_commands(self, cmds: str) -> None:
        for cmd in cmds.split("\n"):
            self.gamepad_command(cmd)

    def gamepad_command(self, cmd: str) -> None:
        log.debug(f"> {cmd}")
        args = cmd.split(" ")
        try:
            if args[0] == "bdown":
                attr = args[1]
                self.gamepad.press_button(
                    button=getattr(vgamepad.XUSB_BUTTON, f"XUSB_GAMEPAD_{attr}")
                )
                self.gamepad.update()
            elif args[0] == "bup":
                attr = args[1]
                self.gamepad.release_button(
                    button=getattr(vgamepad.XUSB_BUTTON, f"XUSB_GAMEPAD_{attr}")
                )
                self.gamepad.update()
            elif args[0] == "lstick":
                x = float(args[1])
                y = float(args[2])
                self.gamepad.left_joystick_float(x, y)
                self.gamepad.update()
            elif args[0] == "rstick":
                x = float(args[1])
                y = float(args[2])
                self.gamepad.right_joystick_float(x, y)
                self.gamepad.update()
            elif args[0] == "ltrig":
                x = float(args[1])
                self.gamepad.left_trigger_float(x)
                self.gamepad.update()
            elif args[0] == "rtrig":
                x = float(args[1])
                self.gamepad.right_trigger_float(x)
                self.gamepad.update()
            elif args[0] == "reset":
                self.gamepad.reset()
                self.gamepad.update()
            elif args[0] == "L":
                log.info(cmd[cmd.find("L ") + 2 :])
            elif args[0] == "ping":
                if self.ws is not None:
                    asyncio.create_task(
                        self.ws.send_str("pong " + cmd[cmd.find("ping ") + 5 :])
                    )
            else:
                raise ValueError("args[0]")
        except Exception:
            log.error(traceback.format_exc())

    def remove(self) -> None:
        del self.gamepad


def static_resp(
    filename: str, minetype: str
) -> Callable[[web.Request], Awaitable[web.Response]]:
    async def callback(request: web.Request) -> web.Response:
        with open(filename, "rb") as f:
            return web.Response(body=f.read(), charset="utf-8", content_type=minetype)

    return callback


gamepads: list[VGamepadNet] = []
gamepad_id_next = 1


async def dynamic_websocket_handler(
    request: web.Request,
) -> Union[web.WebSocketResponse, web.Response]:
    global gamepads, gamepad_id_next
    gamepad = VGamepadNet(gamepad_id_next)
    try:
        gamepad_id_next += 1
        ws = web.WebSocketResponse(heartbeat=WS_HEARTBEAT)
        await ws.prepare(request)
        gamepad.ws = ws
        gamepads.append(gamepad)
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                gamepad.gamepad_command(msg.data)
            elif msg.type == WSMsgType.ERROR:
                log.error("ws connection closed with exception %s" % ws.exception())
    finally:
        gamepad.remove()
        gamepads.remove(gamepad)

    return ws


addr_list: list[str] = []
addr_ready = threading.Event()
gui_closed = threading.Event()


def gui_main() -> None:
    try:
        """主线程运行的GUI主函数"""
        root = tk.Tk()
        root.title("VGamepadNet")
        root.geometry("400x300")
        ttk.Label(root, text="当前访问链接：").pack(pady=5)
        link_text = tk.Text(root, height=5, width=50)
        link_text.pack(padx=10)
        addr_ready.wait()
        for addr in addr_list:
            link_text.insert(tk.END, f"{addr}\n")
        link_text.config(state=tk.DISABLED)  # 只读
        ttk.Label(root, text="当前手柄连接数：").pack(pady=5)
        pad_count_label = ttk.Label(root, text="0")
        pad_count_label.pack()

        def update_pad_count() -> None:
            pad_count_label.config(text=str(len(gamepads)))
            root.after(1000, update_pad_count)  # 每秒更新一次

        update_pad_count()  # 启动更新循环

        def on_closing() -> None:
            gui_closed.set()
            root.destroy()

        root.protocol("WM_DELETE_WINDOW", on_closing)
        root.mainloop()
    except Exception:
        log.error(traceback.format_exc())


async def async_main() -> None:
    """asyncio事件循环运行的主协程"""
    global addr_list, gui_closed, addr_ready
    try:
        app = web.Application()
        path_prefix: str
        try:
            with open("path_prefix.txt", "r") as f:
                path_prefix = f.read().strip()
                if len(path_prefix) != 8 or not all(
                    ch in "234567abcdefghijklmnopqrstuvwxyz" for ch in path_prefix
                ):
                    raise FileNotFoundError("Update format")
        except FileNotFoundError:
            path_prefix = base64.b32encode(os.urandom(5)).decode("utf-8").lower()
            with open("path_prefix.txt", "w") as f:
                f.write(path_prefix)
        app.add_routes(
            [
                web.get(f"/{path_prefix}/", static_resp("main.html", "text/html")),
                web.get(
                    f"/{path_prefix}/script.js",
                    static_resp("script.js", "text/javascript"),
                ),
                web.get(
                    f"/{path_prefix}/nosleep.js",
                    static_resp("nosleep.js", "text/javascript"),
                ),
                web.get(
                    f"/{path_prefix}/style.css",
                    static_resp("style.css", "text/stylesheet"),
                ),
                web.get(f"/{path_prefix}/websocket", dynamic_websocket_handler),
            ]
        )
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", PORT)
        await site.start()
        addr_list = [
            f"http://{ipaddr}:{PORT}/{path_prefix}/"
            for ipaddr in socket.gethostbyname_ex(socket.gethostname())[-1]
        ]
        addr_ready.set()  # 地址列表准备完成，通知GUI线程

        # 保持运行直到GUI关闭
        await asyncio.to_thread(gui_closed.wait)

        await runner.cleanup()
    except Exception:
        log.error(traceback.format_exc())


if __name__ == "__main__":
    asyncio_thread = threading.Thread(
        target=lambda: asyncio.run(async_main()), daemon=True
    )
    asyncio_thread.start()
    gui_main()
    asyncio_thread.join()
