import vgamepad
import base64
import logging
import traceback
import asyncio
import socket
import os
from aiohttp import web, WSMsgType
from typing import Union, Optional

log = logging.getLogger(__name__)
# logging.basicConfig(level=logging.DEBUG, filename="debug.log", filemode="a")


class VGamepadNet:
    def __init__(self, pad_id: str, pad_name: str) -> None:
        self.pad_id = pad_id
        self.pad_name = pad_name
        self.vibrate = 0
        self.vibrate_peak = 0

        self.ws: Optional[web.WebSocketResponse] = None
        self.main_loop: asyncio.AbstractEventLoop = asyncio.get_running_loop()

        self.gamepad = vgamepad.VX360Gamepad()
        self.gamepad.register_notification(self.update_status)

        self.path_prefix: str
        try:
            with open(f"path_prefix_{self.pad_id}.txt", "r") as f:
                self.path_prefix = f.read().strip()
                if len(self.path_prefix) != 8 or not all(
                    ch in "234567abcdefghijklmnopqrstuvwxyz" for ch in self.path_prefix
                ):
                    raise FileNotFoundError("Update format")
        except FileNotFoundError:
            self.path_prefix = base64.b32encode(os.urandom(5)).decode("utf-8").lower()
            with open(f"path_prefix_{self.pad_id}.txt", "w") as f:
                f.write(self.path_prefix)

    def add_routes_to_app(self, app: web.Application) -> None:
        app.add_routes(
            [
                web.get(f"/{self.path_prefix}/", self.static_main_html),
                web.get(f"/{self.path_prefix}/script.js", self.static_script_js),
                web.get(f"/{self.path_prefix}/nosleep.js", self.static_nosleep_js),
                web.get(f"/{self.path_prefix}/style.css", self.static_style_css),
                web.get(f"/{self.path_prefix}/websocket", self.get_websocket),
            ]
        )

    def update_status(
        self, client, target, large_motor, small_motor, led_number, user_data
    ):
        self.vibrate = max(large_motor, small_motor) / 255
        if self.vibrate_peak < self.vibrate:
            self.vibrate_peak = self.vibrate
        log.debug(f"< vibrate {self.vibrate}")
        if self.ws is not None:
            coro = self.ws.send_str(f"vibrate {self.vibrate}")
            asyncio.run_coroutine_threadsafe(coro, self.main_loop)

    async def static_main_html(self, request: web.Request) -> web.Response:
        with open("main.html", "rb") as f:
            content = f.read()
            return web.Response(body=content, charset="utf-8", content_type="text/html")

    async def static_script_js(self, request: web.Request) -> web.Response:
        with open("script.js", "rb") as f:
            content = f.read()
            return web.Response(
                body=content, charset="utf-8", content_type="text/javascript"
            )

    async def static_nosleep_js(self, request: web.Request) -> web.Response:
        with open("nosleep.js", "rb") as f:
            content = f.read()
            return web.Response(
                body=content, charset="utf-8", content_type="text/javascript"
            )

    async def static_style_css(self, request: web.Request) -> web.Response:
        with open("style.css", "rb") as f:
            content = f.read()
            return web.Response(
                body=content, charset="utf-8", content_type="text/stylesheet"
            )

    def gamepad_commands(self, cmds: str) -> None:
        for cmd in cmds.split("\n"):
            self.gamepad_command(cmd)

    async def get_websocket(
        self,
        request: web.Request,
    ) -> Union[web.WebSocketResponse, web.Response]:
        if self.ws is not None:
            return web.Response(status=403, text="Already connected")
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self.ws = ws

        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    self.gamepad_command(msg.data)
                elif msg.type == WSMsgType.ERROR:
                    log.error("ws connection closed with exception %s" % ws.exception())
        finally:
            self.ws = None

        return ws

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
            traceback.print_exc()


async def main() -> None:
    app = web.Application()
    pad1 = VGamepadNet("1", "1")
    pad2 = VGamepadNet("2", "2")
    pad1.add_routes_to_app(app)
    pad2.add_routes_to_app(app)
    print("Player 1:")
    for ipaddr in socket.gethostbyname_ex(socket.gethostname())[-1]:
        print(f"http://{ipaddr}:35714/{pad1.path_prefix}/")
    print("Player 2:")
    for ipaddr in socket.gethostbyname_ex(socket.gethostname())[-1]:
        print(f"http://{ipaddr}:35714/{pad2.path_prefix}/")

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 35714)
    await site.start()

    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main())
