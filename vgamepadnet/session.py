import logging
import traceback
import asyncio
from typing import Awaitable, Callable, Dict, Set, Optional, Union, Literal, DefaultDict
from collections import defaultdict

from aiohttp import web, WSMsgType, WSCloseCode
import vgamepad  # type: ignore

log = logging.getLogger(__name__)


XBOX_MODE = False


button_map_xbox: Dict[str, vgamepad.XUSB_BUTTON] = {
    "up": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_UP,
    "down": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_DOWN,
    "left": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_LEFT,
    "right": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_RIGHT,
    "start": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_START,
    "back": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_BACK,
    "LS": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_THUMB,
    "RS": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_THUMB,
    "LB": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER,
    "RB": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER,
    "guide": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_GUIDE,
    "A": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_A,
    "B": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_B,
    "X": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_X,
    "Y": vgamepad.XUSB_BUTTON.XUSB_GAMEPAD_Y,
}


button_map_ds4: Dict[
    str, Union[vgamepad.DS4_BUTTONS, vgamepad.DS4_SPECIAL_BUTTONS, Literal["DPAD"]]
] = {
    "up": "DPAD",
    "down": "DPAD",
    "left": "DPAD",
    "right": "DPAD",
    "start": vgamepad.DS4_BUTTONS.DS4_BUTTON_OPTIONS,
    "back": vgamepad.DS4_BUTTONS.DS4_BUTTON_SHARE,
    "LS": vgamepad.DS4_BUTTONS.DS4_BUTTON_THUMB_LEFT,
    "RS": vgamepad.DS4_BUTTONS.DS4_BUTTON_THUMB_RIGHT,
    "LB": vgamepad.DS4_BUTTONS.DS4_BUTTON_SHOULDER_LEFT,
    "RB": vgamepad.DS4_BUTTONS.DS4_BUTTON_SHOULDER_RIGHT,
    "guide": vgamepad.DS4_SPECIAL_BUTTONS.DS4_SPECIAL_BUTTON_PS,
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
            self.xbox_mode = True
        else:
            self.gamepad = vgamepad.VDS4Gamepad()
            self.xbox_mode = False

        self.state: DefaultDict[str, Union[int, float]] = defaultdict(int)
        self.state_out: DefaultDict[str, Union[int, float]] = defaultdict(int)

        self.on_change: Set[Callable[[Session], Awaitable[None]]] = (
            set()
        )  # 手柄数据变化时调用

    async def run(self) -> None:
        if self.gamepad is None:
            return
        self.gamepad.register_notification(self.handle_gamepad_status)
        async for msg in self.ws:
            if msg.type == WSMsgType.TEXT:
                try:
                    await self.handle_message(msg.data)
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
        await self.cleanup()

    def reply_threadsafe(self, msg: str) -> None:
        if not self.disconnected:
            coro = self.ws.send_str(msg)
            asyncio.run_coroutine_threadsafe(coro, self.main_loop)

    def handle_gamepad_status(  # type: ignore
        self, client, target, large_motor, small_motor, led_number, user_data
    ):
        large_motor_v = large_motor / 255
        small_motor_v = small_motor / 255
        for cb in self.on_change:
            asyncio.run_coroutine_threadsafe(cb(self), self.main_loop)
        if not self.disconnected:
            self.state_out["large_motor"] = large_motor_v
            self.state_out["small_motor"] = small_motor_v
            self.state_out["led_number"] = led_number
            self.reply_threadsafe(
                f"set large_motor {large_motor_v}"
                f" small_motor {small_motor_v}"
                f" led_number {led_number}"
            )

    async def handle_message(self, cmd: str) -> None:
        if self.gamepad is None:
            return
        log.debug(f"> {cmd}")
        args = cmd.split(" ")
        try:
            if args[0] == "set":
                i = 1
                while i + 1 < len(args):
                    name = args[i]
                    value = float(args[i + 1])
                    self.set_state(name, value)
                    i += 2
            elif args[0] == "reset":
                self.state.clear()
                self.gamepad.reset()
                self.gamepad.update()
            elif args[0] == "mode":
                if args[1] == "xbox":
                    self.gamepad = vgamepad.VX360Gamepad()
                    self.xbox_mode = True
                    self.state.clear()
                elif args[1] == "ds4":
                    self.gamepad = vgamepad.VDS4Gamepad()
                    self.xbox_mode = False
                    self.state.clear()
                else:
                    raise ValueError(f"Wrong mode {args[1]!r}")
            elif args[0] == "log":
                log.info(cmd[len(args[0]) + 1 :])
            elif args[0] == "ping":
                self.reply_threadsafe("pong")
            else:
                raise ValueError(f"Unknown command {args[0]!r}")
            for cb in self.on_change:
                await cb(self)
        except Exception:
            log.error(traceback.format_exc())

    def set_state(self, name: str, value: float) -> None:
        self.state[name] = value
        if isinstance(self.gamepad, vgamepad.VX360Gamepad):
            button = button_map_xbox.get(name)
            if button is not None:
                if value == 0:
                    self.gamepad.release_button(button)
                else:
                    self.gamepad.press_button(button)
            elif name == "LT":
                self.gamepad.left_trigger_float(value)
            elif name == "RT":
                self.gamepad.right_trigger_float(value)
            elif name in {"LSx", "LSy"}:
                self.gamepad.left_joystick_float(self.state["LSx"], self.state["LSy"])
            elif name in {"RSx", "RSy"}:
                self.gamepad.right_joystick_float(self.state["RSx"], self.state["RSy"])
            else:
                log.warning(f"Unknown state {name!r}: {value!r}")
                del self.state[name]
            self.gamepad.update()
        elif isinstance(self.gamepad, vgamepad.VDS4Gamepad):
            button = button_map_ds4.get(name)
            if button == "DPAD":
                dpad_x = 0
                if self.state["left"] != 0:
                    dpad_x -= 1
                if self.state["right"] != 0:
                    dpad_x += 1
                dpad_y = 0
                if self.state["up"] != 0:
                    dpad_y -= 1
                if self.state["down"] != 0:
                    dpad_y += 1
                direction = (dpad_x, dpad_y)
                self.gamepad.directional_pad(direction_map_ds4[direction])
            elif isinstance(button, vgamepad.DS4_SPECIAL_BUTTONS):
                if value == 0:
                    self.gamepad.release_special_button(button)
                else:
                    self.gamepad.press_special_button(button)
            elif isinstance(button, vgamepad.DS4_BUTTONS):
                if value == 0:
                    self.gamepad.release_button(button)
                else:
                    self.gamepad.press_button(button)
            elif name == "LT":
                self.gamepad.left_trigger_float(value)
            elif name == "RT":
                self.gamepad.right_trigger_float(value)
            elif name in {"LSx", "LSy"}:
                self.gamepad.left_joystick_float(self.state["LSx"], -self.state["LSy"])
            elif name in {"RSx", "RSy"}:
                self.gamepad.right_joystick_float(self.state["RSx"], -self.state["RSy"])
            else:
                log.warning(f"Unknown state {name!r}: {value!r}")
                del self.state[name]
            self.gamepad.update()

    async def close(self) -> None:
        """
        主动关闭连接
        """
        if self.ws is not None and not self.ws.closed:
            await self.ws.close(code=WSCloseCode.GOING_AWAY, message=b"Server closed")

    async def cleanup(self) -> None:
        """
        移除虚拟手柄
        """
        if self.gamepad is None:
            return
        self.gamepad.unregister_notification()
        self.gamepad.reset()
        self.gamepad.update()
        self.gamepad = None
