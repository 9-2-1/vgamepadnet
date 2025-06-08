import logging
import traceback
import asyncio
from typing import Awaitable, Callable, Dict, Tuple, Set, Optional, Union, Literal

from aiohttp import web, WSMsgType, WSCloseCode
import vgamepad  # type: ignore

log = logging.getLogger(__name__)


XBOX_MODE = True


button_map_xbox: Dict[str, vgamepad.XUSB_BUTTON] = {
    "Up": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_UP,
    "Down": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_DOWN,
    "Left": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_LEFT,
    "Right": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_RIGHT,
    "Start": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_START,
    "Back": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_BACK,
    "LS": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_THUMB,
    "RS": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_THUMB,
    "LB": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER,
    "RB": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER,
    "Guide": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_GUIDE,
    "A": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_A,
    "B": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_B,
    "X": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_X,
    "Y": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_Y,
}


button_map_ds4: Dict[
    str, Union[vgamepad.DS4_BUTTONS, vgamepad.DS4_SPECIAL_BUTTONS, Literal["DPAD"]]
] = {
    "Up": "DPAD",
    "Down": "DPAD",
    "Left": "DPAD",
    "Right": "DPAD",
    "Start": vgamepad.DS4_BUTTONS.DS4_BUTTON_OPTIONS,
    "Back": vgamepad.DS4_BUTTONS.DS4_BUTTON_SHARE,
    "LS": vgamepad.DS4_BUTTONS.DS4_BUTTON_THUMB_LEFT,
    "RS": vgamepad.DS4_BUTTONS.DS4_BUTTON_THUMB_RIGHT,
    "LB": vgamepad.DS4_BUTTONS.DS4_BUTTON_SHOULDER_LEFT,
    "RB": vgamepad.DS4_BUTTONS.DS4_BUTTON_SHOULDER_RIGHT,
    "Guide": vgamepad.DS4_SPECIAL_BUTTONS.DS4_SPECIAL_BUTTON_PS,
    "A": vgamepad.DS4_BUTTONS.DS4_BUTTON_CROSS,
    "B": vgamepad.DS4_BUTTONS.DS4_BUTTON_CIRCLE,
    "X": vgamepad.DS4_BUTTONS.DS4_BUTTON_SQUARE,
    "Y": vgamepad.DS4_BUTTONS.DS4_BUTTON_TRIANGLE,
}


direction_map_ds4 = {
    (0, -1): vgamepad.DS4_DPAD_DIRECTIONS.DS4_BUTTON_DPAD_NORTH,
    (1, -1): vgamepad.DS4_DPAD_DIRECTIONS.DS4_BUTTON_DPAD_NORTHEAST,
    (1, 0): vgamepad.DS4_DPAD_DIRECTIONS.DS4_BUTTON_DPAD_EAST,
    (1, 1): vgamepad.DS4_DPAD_DIRECTIONS.DS4_BUTTON_DPAD_SOUTHEAST,
    (0, 1): vgamepad.DS4_DPAD_DIRECTIONS.DS4_BUTTON_DPAD_SOUTH,
    (-1, 1): vgamepad.DS4_DPAD_DIRECTIONS.DS4_BUTTON_DPAD_SOUTHWEST,
    (-1, 0): vgamepad.DS4_DPAD_DIRECTIONS.DS4_BUTTON_DPAD_WEST,
    (-1, -1): vgamepad.DS4_DPAD_DIRECTIONS.DS4_BUTTON_DPAD_NORTHWEST,
    (0, 0): vgamepad.DS4_DPAD_DIRECTIONS.DS4_BUTTON_DPAD_NONE,
}


class Session:
    """
    一个连接的会话，这里直接控制一个新的虚拟手柄
    """

    def __init__(self, session_id: int, ws: web.WebSocketResponse) -> None:
        self.session_id = session_id
        self.ws = ws
        self.disconnected = False
        self.main_loop = asyncio.get_running_loop()
        self.gamepad: Optional[Union[vgamepad.VX360Gamepad, vgamepad.VDS4Gamepad]] = (
            None
        )
        if XBOX_MODE:
            self.gamepad = vgamepad.VX360Gamepad()
        else:
            self.gamepad = vgamepad.VDS4Gamepad()

        self.button_states: Dict[str, bool] = {}
        self.trigger_states: Dict[str, float] = {}
        self.stick_states: Dict[str, Tuple[float, float]] = {}

        self.large_motor = 0.0
        self.small_motor = 0.0
        self.vibrate = 0.0
        self.led_number = 0

        self.on_change: Set[Callable[[Session], Awaitable[None]]] = (
            set()
        )  # 手柄数据变化时调用

    async def run(self) -> None:
        if self.gamepad is None:
            return
        self.gamepad.register_notification(self.on_gamepad_status)
        async for msg in self.ws:
            if msg.type == WSMsgType.TEXT:
                try:
                    await self.on_message(msg.data)
                except Exception:
                    log.error(traceback.format_exc())
            elif msg.type == WSMsgType.ERROR:
                log.error(f"ws connection closed with exception {self.ws.exception()}")
                self.disconnected = True
                break
            elif msg.type == WSMsgType.CLOSE:
                log.info(f"ws connection closed with code {msg.data}")
                self.disconnected = True
                break
        await self.on_close()

    def reply_threadsafe(self, msg: str) -> None:
        if not self.disconnected:
            coro = self.ws.send_str(msg)
            asyncio.run_coroutine_threadsafe(coro, self.main_loop)

    def on_gamepad_status(  # type: ignore
        self, client, target, large_motor, small_motor, led_number, user_data
    ):
        self.large_motor = large_motor / 255
        self.small_motor = small_motor / 255
        self.vibrate = max(large_motor, small_motor) / 255
        self.led_number = led_number
        log.debug(f"< vibrate {self.vibrate}")
        if not self.disconnected:
            self.reply_threadsafe(f"vibrate {self.vibrate}")
        for cb in self.on_change:
            asyncio.run_coroutine_threadsafe(cb(self), self.main_loop)

    async def on_message(self, cmd: str) -> None:
        if self.gamepad is None:
            return
        log.debug(f"> {cmd}")
        args = cmd.split(" ")
        try:
            if args[0] == "button":
                name = args[1]
                value = int(args[2])
                if isinstance(self.gamepad, vgamepad.VX360Gamepad):
                    if name not in button_map_xbox:
                        raise ValueError(f"button: unknown name {args[1]!r}")
                    self.button_states[name] = value == 1
                    button = button_map_xbox[name]
                    if value == 0:
                        self.gamepad.release_button(button)
                    else:
                        self.gamepad.press_button(button)
                else:
                    if name not in button_map_ds4:
                        raise ValueError(f"button: unknown name {args[1]!r}")
                    self.button_states[name] = value == 1
                    button = button_map_ds4[name]
                    if button == "DPAD":
                        dpad_x = 0
                        if self.button_states.get("Left", False):
                            dpad_x -= 1
                        if self.button_states.get("Right", False):
                            dpad_x += 1
                        dpad_y = 0
                        if self.button_states.get("Up", False):
                            dpad_y -= 1
                        if self.button_states.get("Down", False):
                            dpad_y += 1
                        direction = (dpad_x, dpad_y)
                        self.gamepad.directional_pad(direction_map_ds4[direction])
                    elif isinstance(button, vgamepad.DS4_SPECIAL_BUTTONS):
                        if value == 0:
                            self.gamepad.release_special_button(button)
                        else:
                            self.gamepad.press_special_button(button)
                    else:
                        if value == 0:
                            self.gamepad.release_button(button)
                        else:
                            self.gamepad.press_button(button)
            elif args[0] == "stick":
                name = args[1]
                x = float(args[2])
                y = float(args[3])
                if x > 1.0:
                    x = 1.0
                elif x < -1.0:
                    x = -1.0
                if y > 1.0:
                    y = 1.0
                elif y < -1.0:
                    y = -1.0
                if isinstance(self.gamepad, vgamepad.VDS4Gamepad):
                    y *= -1
                if name == "LS":
                    self.stick_states[name] = (x, y)
                    self.gamepad.left_joystick_float(x, y)
                elif name == "RS":
                    self.stick_states[name] = (x, y)
                    self.gamepad.right_joystick_float(x, y)
                else:
                    raise ValueError(f"stick: unknown name {args[1]!r}")
            elif args[0] == "trigger":
                name = args[1]
                x = float(args[2])
                if x > 1.0:
                    x = 1.0
                elif x < 0.0:
                    x = 0.0
                if name == "LT":
                    self.trigger_states[name] = x
                    self.gamepad.left_trigger_float(x)
                elif name == "RT":
                    self.trigger_states[name] = x
                    self.gamepad.right_trigger_float(x)
                else:
                    raise ValueError(f"trigger: unknown name {args[1]!r}")
            elif args[0] == "reset":
                self.button_states.clear()
                self.trigger_states.clear()
                self.stick_states.clear()
                self.gamepad.reset()
            elif args[0] == "L":
                log.info(cmd[len(args[0]) + 1 :])
                return
            elif args[0] == "ping":
                self.reply_threadsafe("pong")
                return
            else:
                raise ValueError(f"Unknown command {args[0]!r}")
            self.gamepad.update()
            for cb in self.on_change:
                await cb(self)
        except Exception:
            log.error(traceback.format_exc())

    async def close(self) -> None:
        """
        主动关闭连接
        """
        if self.ws is not None and not self.ws.closed:
            await self.ws.close(code=WSCloseCode.GOING_AWAY, message=b"Server closed")

    async def on_close(self) -> None:
        """
        移除虚拟手柄
        """
        if self.gamepad is None:
            return
        self.gamepad.unregister_notification()
        self.gamepad.reset()
        self.gamepad.update()
        self.gamepad = None
