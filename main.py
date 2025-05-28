import vgamepad
import traceback
from aiohttp import web
from collections import defaultdict
from typing import Dict, Any

vibrate: int = 0
vibrate_peak: int = 0


def update_status(client, target, large_motor, small_motor, led_number, user_data):
    global vibrate
    global vibrate_peak
    vibrate = (large_motor + small_motor) / 2 / 255
    if vibrate_peak < vibrate:
        vibrate_peak = vibrate
    print(f"vibrate: {vibrate}")


gamepad = vgamepad.VX360Gamepad()
T: Dict[str, int] = defaultdict(int)
gamepad.register_notification(update_status)

routes = web.RouteTableDef()


@routes.get("/")
async def static_main_html(request: web.Request) -> web.Response:
    with open("main.html", "rb") as f:
        content = f.read()
        return web.Response(body=content, charset="utf-8", content_type="text/html")


@routes.get("/script.js")
async def static_script_js(request: web.Request) -> web.Response:
    with open("script.js", "rb") as f:
        content = f.read()
        return web.Response(
            body=content, charset="utf-8", content_type="text/javascript"
        )


@routes.get("/style.css")
async def static_style_css(request: web.Request) -> web.Response:
    with open("style.css", "rb") as f:
        content = f.read()
        return web.Response(
            body=content, charset="utf-8", content_type="text/stylesheet"
        )


@routes.post("/command")
async def post_command(request: web.Request) -> web.Response:
    cmds = await request.text()
    for cmd in cmds.split("\n"):
        print(">", cmd)
        gamepad_command(cmd)
    return web.Response()


@routes.post("/vibrate")
async def post_vibrate(request: web.Request) -> web.Response:
    global vibrate_peak
    reply = str(vibrate_peak)
    vibrate_peak = vibrate
    return web.Response(text=reply)


@routes.post("/log")
async def post_log(request: web.Request) -> web.Response:
    logstr = await request.text()
    print("L", logstr)
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
                gamepad.update()
        elif args[1] == "bup":
            attr = args[2]
            if T[attr] < t:
                T[attr] = t
                gamepad.release_button(
                    button=getattr(vgamepad.XUSB_BUTTON, f"XUSB_GAMEPAD_{attr}")
                )
                gamepad.update()
        elif args[1] == "lstick":
            if T["lstick"] < t:
                T["lstick"] = t
                x = float(args[2])
                y = float(args[3])
                gamepad.left_joystick_float(x, y)
                gamepad.update()
        elif args[1] == "rstick":
            if T["rstick"] < t:
                T["rstick"] = t
                x = float(args[2])
                y = float(args[3])
                gamepad.right_joystick_float(x, y)
                gamepad.update()
        elif args[1] == "ltrig":
            if T["ltrig"] < t:
                T["ltrig"] = t
                x = float(args[2])
                gamepad.left_trigger_float(x)
                gamepad.update()
        elif args[1] == "rtrig":
            if T["rtrig"] < t:
                T["rtrig"] = t
                x = float(args[2])
                gamepad.right_trigger_float(x)
                gamepad.update()
        elif args[1] == "reset":
            gamepad.reset()
            gamepad.update()
            T.clear()
    except Exception:
        traceback.print_exc()


app = web.Application()
app.add_routes(routes)
web.run_app(app, port=8000)
