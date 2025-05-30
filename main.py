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
T: Dict[str, int] = defaultdict(int)
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
        log.debug(f"> {cmd}")
        gamepad_command(cmd)
    gamepad.update()


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
                gamepad_commands(msg.data)
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
    args = cmd.split(" ")
    try:
        t = int(args[0])
        if args[1] == "bdown":
            attr = args[2]
            if T[attr] < t:
                T[attr] = t
                gamepad.press_button(
                    button=getattr(vgamepad.XUSB_BUTTON, f"XUSB_GAMEPAD_{attr}")
                )
        elif args[1] == "bup":
            attr = args[2]
            if T[attr] < t:
                T[attr] = t
                gamepad.release_button(
                    button=getattr(vgamepad.XUSB_BUTTON, f"XUSB_GAMEPAD_{attr}")
                )
        elif args[1] == "lstick":
            if T["lstick"] < t:
                T["lstick"] = t
                x = float(args[2])
                y = float(args[3])
                gamepad.left_joystick_float(x, y)
        elif args[1] == "rstick":
            if T["rstick"] < t:
                T["rstick"] = t
                x = float(args[2])
                y = float(args[3])
                gamepad.right_joystick_float(x, y)
        elif args[1] == "ltrig":
            if T["ltrig"] < t:
                T["ltrig"] = t
                x = float(args[2])
                gamepad.left_trigger_float(x)
        elif args[1] == "rtrig":
            if T["rtrig"] < t:
                T["rtrig"] = t
                x = float(args[2])
                gamepad.right_trigger_float(x)
        elif args[1] == "reset":
            gamepad.reset()
            T.clear()
        elif args[1] == "L":
            log.info(cmd[cmd.find("L ") + 2 :])
    except Exception:
        traceback.print_exc()


app = web.Application()
app.add_routes(routes)
for ipaddr in socket.gethostbyname_ex(socket.gethostname())[-1]:
    print(f"http://{ipaddr}:35714/{path_prefix}/")

web.run_app(app, port=35714)
