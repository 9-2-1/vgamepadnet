import vgamepad
import base64
import logging
import traceback
import asyncio
import socket
import os
from aiohttp import web, WSMsgType
from collections import defaultdict
from typing import Dict, Union, Optional

log = logging.getLogger(__name__)
# logging.basicConfig(level=logging.DEBUG, filename="debug.log", filemode="a")

vibrate: int = 0
vibrate_peak: int = 0

globalws: Optional[web.WebSocketResponse] = None

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


def update_status(client, target, large_motor, small_motor, led_number, user_data):
    global vibrate
    global vibrate_peak
    global globalws
    vibrate = max(large_motor, small_motor) / 255
    if vibrate_peak < vibrate:
        vibrate_peak = vibrate
    log.debug(f"< vibrate {vibrate}")
    if globalws is not None:
        asyncio.run(globalws.send_str(f"vibrate {vibrate}"))


gamepad = vgamepad.VX360Gamepad()
gamepad.register_notification(update_status)

routes = web.RouteTableDef()


@routes.get(f"/{path_prefix}/")
async def static_main_html(request: web.Request) -> web.Response:
    with open("main.html", "rb") as f:
        content = f.read()
        return web.Response(body=content, charset="utf-8", content_type="text/html")


@routes.get(f"/{path_prefix}/script.js")
async def static_script_js(request: web.Request) -> web.Response:
    with open("script.js", "rb") as f:
        content = f.read()
        return web.Response(
            body=content, charset="utf-8", content_type="text/javascript"
        )


@routes.get(f"/{path_prefix}/nosleep.js")
async def static_nosleep_js(request: web.Request) -> web.Response:
    with open("nosleep.js", "rb") as f:
        content = f.read()
        return web.Response(
            body=content, charset="utf-8", content_type="text/javascript"
        )


@routes.get(f"/{path_prefix}/style.css")
async def static_style_css(request: web.Request) -> web.Response:
    with open("style.css", "rb") as f:
        content = f.read()
        return web.Response(
            body=content, charset="utf-8", content_type="text/stylesheet"
        )


@routes.post(f"/{path_prefix}/command")
async def post_command(request: web.Request) -> web.Response:
    cmds = await request.text()
    gamepad_commands(cmds)
    return web.Response()


def gamepad_commands(cmds: str) -> None:
    for cmd in cmds.split("\n"):
        gamepad_command(cmd)


@routes.post(f"/{path_prefix}/vibrate")
async def post_vibrate(request: web.Request) -> web.Response:
    global vibrate_peak
    reply = str(vibrate_peak)
    vibrate_peak = vibrate
    return web.Response(text=reply)


@routes.get(f"/{path_prefix}/websocket")
async def get_websocket(
    request: web.Request,
) -> Union[web.WebSocketResponse, web.Response]:
    global globalws
    if globalws is not None:
        return web.Response(status=403, text="Already connected")
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    globalws = ws

    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                gamepad_command(msg.data)
            elif msg.type == WSMsgType.ERROR:
                log.error("ws connection closed with exception %s" % ws.exception())
    finally:
        globalws = None

    return ws


@routes.post(f"/{path_prefix}/log")
async def post_log(request: web.Request) -> web.Response:
    logstr = await request.text()
    log.info(logstr)
    return web.Response()


def gamepad_command(cmd: str) -> None:
    global gamepad
    log.debug(f"> {cmd}")
    args = cmd.split(" ")
    try:
        if args[0] == "bdown":
            attr = args[1]
            gamepad.press_button(
                button=getattr(vgamepad.XUSB_BUTTON, f"XUSB_GAMEPAD_{attr}")
            )
            gamepad.update()
        elif args[0] == "bup":
            attr = args[1]
            gamepad.release_button(
                button=getattr(vgamepad.XUSB_BUTTON, f"XUSB_GAMEPAD_{attr}")
            )
            gamepad.update()
        elif args[0] == "lstick":
            x = float(args[1])
            y = float(args[2])
            gamepad.left_joystick_float(x, y)
            gamepad.update()
        elif args[0] == "rstick":
            x = float(args[1])
            y = float(args[2])
            gamepad.right_joystick_float(x, y)
            gamepad.update()
        elif args[0] == "ltrig":
            x = float(args[1])
            gamepad.left_trigger_float(x)
            gamepad.update()
        elif args[0] == "rtrig":
            x = float(args[1])
            gamepad.right_trigger_float(x)
            gamepad.update()
        elif args[0] == "reset":
            gamepad.reset()
            gamepad.update()
        elif args[0] == "L":
            log.info(cmd[cmd.find("L ") + 2 :])
        elif args[0] == "ping":
            if globalws is not None:
                asyncio.create_task(
                    globalws.send_str("pong " + cmd[cmd.find("ping ") + 5 :])
                )
        else:
            raise ValueError("args[0]")
    except Exception:
        traceback.print_exc()


app = web.Application()
app.add_routes(routes)
for ipaddr in socket.gethostbyname_ex(socket.gethostname())[-1]:
    print(f"http://{ipaddr}:35714/{path_prefix}/")

web.run_app(app, port=35714)
