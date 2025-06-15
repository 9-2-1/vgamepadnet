import logging
import tkinter
import tkinter.messagebox
import queue
import math
import traceback
from dataclasses import dataclass
from typing import Callable, Dict, Set, Union, DefaultDict, List, Type, Optional
from types import TracebackType
from copy import deepcopy

from .session import Session, GamepadMode

log = logging.getLogger(__name__)

button_symbol_xbox = {
    "up": "↑",
    "down": "↓",
    "left": "←",
    "right": "→",
    "start": "☰",
    "back": "❐",
    "guide": "⭙",
    "gyro": "G",
    "large_motor": "SS",
    "small_motor": "S",
    "led_number": "L",
}


button_symbol_ds4 = {
    "up": "↑",
    "down": "↓",
    "left": "←",
    "right": "→",
    "start": "OP",
    "back": "SH",
    "guide": "PS",
    "gyro": "G",
    "large_motor": "SS",
    "small_motor": "S",
    "led_number": "L",
}


@dataclass
class SessionState:
    gamepad_mode: GamepadMode

    state: DefaultDict[str, Union[int, float]]
    state_out: DefaultDict[str, Union[int, float]]

    @classmethod
    def from_session(cls, session: Session) -> "SessionState":
        return cls(
            gamepad_mode=session.gamepad_mode,
            state=deepcopy(session.state),
            state_out=deepcopy(session.state_out),
        )


@dataclass
class SessionAddEvent:
    session_id: int


@dataclass
class SessionChangeEvent:
    session_id: int
    state: SessionState


@dataclass
class SessionDelEvent:
    session_id: int


@dataclass
class LinkUpdateEvent:
    links: List[str]


@dataclass
class ErrorEvent:
    pass


GUIEvent = Union[
    SessionAddEvent,
    SessionChangeEvent,
    SessionDelEvent,
    ErrorEvent,
    LinkUpdateEvent,
]

CYCLE_MS = 10


class GUI:
    def __init__(self) -> None:
        self.root = tkinter.Tk()
        self.root.title("VGamepadNet")
        self.root.resizable(False, False)
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.root.report_callback_exception = self.guierror
        self.title = tkinter.Label(self.root, text="VGamepadNet", font=("微软雅黑", 16))
        self.title.pack()
        self.links_title = tkinter.Label(self.root, text="链接", font=("微软雅黑", 12))
        self.links_title.pack()
        self.links_refresh_button = tkinter.Button(
            self.root, text="刷新", command=self.on_link_refresh_button_click_
        )
        self.links_refresh_button.pack()
        self.links = tkinter.Frame(self.root)
        self.links.pack()
        self.sessions_title = tkinter.Label(
            self.root, text="已连接的手柄", font=("微软雅黑", 12)
        )
        self.sessions_title.pack()
        self.sessions = tkinter.Frame(self.root)
        self.sessions.pack()

        self.queue: queue.Queue[GUIEvent] = queue.Queue()
        self.session_named: Dict[int, tkinter.Widget] = {}
        self.on_link_refresh_button_click: Set[Callable[[], None]] = set()
        self.on_close: Set[Callable[[], None]] = set()
        self.closed = False

        self.cycle_queue()

    def on_link_refresh_button_click_(self) -> None:
        for cb in self.on_link_refresh_button_click:
            try:
                cb()
            except Exception:
                log.error(traceback.format_exc())

    def mainloop(self) -> None:
        self.root.mainloop()

    def guierror(
        self,
        exc: Optional[Type[BaseException]],
        value: Optional[BaseException],
        tb: Optional[TracebackType],
    ) -> None:
        log.error(traceback.format_exception(exc, value, tb))
        tkinter.messagebox.showerror("错误", "发生错误，请查看debug.log获取详细信息")

    def report_error(self) -> None:
        tkinter.messagebox.showerror("错误", "发生错误，请查看debug.log获取详细信息")
        self.close()

    def link_update(self, links: List[str]) -> None:
        for widget in self.links.winfo_children():
            widget.destroy()
        for link in links:
            link_label = tkinter.Text(
                self.links, font=("微软雅黑", 12), height=1, width=40
            )
            link_label.insert("end", link)
            link_label.configure(state="disabled")
            link_label.pack(fill="x")

    def close(self) -> None:
        if self.closed:
            return
        for cb in self.on_close:
            try:
                cb()
            except Exception:
                log.error(traceback.format_exc())
        self.root.destroy()
        self.closed = True

    def cycle_queue(self) -> None:
        toAdd: Set[int] = set()
        toChange: Dict[int, SessionState] = {}
        toDel: Set[int] = set()
        while True:
            try:
                event = self.queue.get_nowait()
                if isinstance(event, SessionAddEvent):
                    # 不需要todel.remove，删除后重新添加
                    toAdd.add(event.session_id)
                elif isinstance(event, SessionChangeEvent):
                    toChange[event.session_id] = event.state
                elif isinstance(event, SessionDelEvent):
                    toAdd.discard(event.session_id)
                    if event.session_id in toChange:
                        toChange.pop(event.session_id)
                    toDel.add(event.session_id)
                elif isinstance(event, LinkUpdateEvent):
                    self.link_update(event.links)
                elif isinstance(event, ErrorEvent):
                    tkinter.messagebox.showerror(
                        "错误", "发生错误，请查看debug.log获取详细信息"
                    )
                    self.close()
                    break
            except queue.Empty:
                break
        for session_id in toDel:
            self.session_del(session_id)
        for session_id in toAdd:
            self.session_add(session_id)
        for session_id, state in toChange.items():
            self.session_change(session_id, state)
        self.root.after(CYCLE_MS, self.cycle_queue)

    def session_add(self, session_id: int) -> None:
        if self.closed:
            return
        session_id_frame = tkinter.Frame(self.sessions)
        session_id_frame.pack()
        session_id_tag = tkinter.Label(
            session_id_frame,
            text=f"{session_id}",
            font=("Fira Mono", 12),
            justify="left",
            width=3,
        )
        session_id_tag.pack(side="left")

        self.signnames = (
            "LT LB LS left down up right back guide start X Y A B RS RB RT".split(" ")
        )
        self.signnames_out = "large_motor small_motor led_number".split(" ")
        sign = tkinter.Canvas(
            session_id_frame,
            width=30 * (len(self.signnames) + len(self.signnames_out)),
            height=30,
            name="sign",
        )
        sign.pack(side="left")
        self.session_named[session_id] = session_id_frame

    def session_change(self, session_id: int, state: SessionState) -> None:
        if self.closed:
            return
        label = self.session_named[session_id]
        assert isinstance(label, tkinter.Frame)
        sign = label.children["sign"]
        assert isinstance(sign, tkinter.Canvas)
        sign.delete("all")
        if state.gamepad_mode == GamepadMode.NONE:
            return
        px = 0
        for name in self.signnames:
            if state.gamepad_mode == GamepadMode.XBOX:
                tlabel = button_symbol_xbox.get(name, name)
            elif state.gamepad_mode == GamepadMode.DS4:
                tlabel = button_symbol_ds4.get(name, name)
            else:
                tlabel = name
            value = state.state[name]
            down = value != 0
            bgfill = "lightgreen" if down else "white"
            txfill = "black" if down else "grey"
            if name in {"LS", "RS"}:
                # directional
                x = state.state[name + "x"]
                y = state.state[name + "y"]
                sign.create_oval(
                    px + 2, 2, px + 30, 30, fill=bgfill, outline=txfill, width=2
                )
                sign.create_oval(
                    px + (x * 8) + 10,
                    (y * -8) + 10,
                    px + (x * 8) + 22,
                    (y * -8) + 22,
                    fill=bgfill,
                    outline=txfill,
                    width=2,
                )
                sign.create_text(
                    px + 16,
                    16,
                    text=name,
                    font=("Fira Mono", 12),
                    fill=txfill,
                    justify="center",
                )
            elif name in {"LT", "RT"}:
                # trigger
                sign.create_oval(
                    px + 2, 2, px + 30, 30, fill="white", outline="grey", width=2
                )
                sv = 2 * value - 1
                if sv < -1:
                    sv = -1
                if sv > 1:
                    sv = 1
                angle = math.asin(sv)
                angle = angle * 180 / math.pi + 90
                if angle >= 180:
                    angle = 179.9
                sign.create_arc(
                    px + 2,
                    2,
                    px + 30,
                    30,
                    start=270 - angle,
                    extent=2 * angle,
                    style="chord",
                    fill=bgfill,
                    outline=txfill,
                    width=2,
                )
                sign.create_text(
                    px + 16,
                    16,
                    text=tlabel,
                    font=("Fira Mono", 12),
                    fill=txfill,
                    justify="center",
                )
            else:
                sign.create_oval(
                    px + 2, 2, px + 30, 30, fill=bgfill, outline=txfill, width=2
                )
                sign.create_text(
                    px + 16,
                    16,
                    text=tlabel,
                    font=("Fira Mono", 12),
                    fill=txfill,
                    justify="center",
                )
            px += 30
        for name in self.signnames_out:
            if state.gamepad_mode == GamepadMode.XBOX:
                tlabel = button_symbol_xbox.get(name, name)
            elif state.gamepad_mode == GamepadMode.DS4:
                tlabel = button_symbol_ds4.get(name, name)
            else:
                tlabel = name
            value = state.state_out[name]
            down = value != 0
            bgfill = "lightgreen" if down else "white"
            txfill = "black" if down else "grey"
            sign.create_oval(
                px + 2, 2, px + 30, 30, fill="white", outline="grey", width=2
            )
            if name == "led_number":
                sv = 2 * (value / 255) - 1
            else:
                sv = 2 * value - 1
            if sv < -1:
                sv = -1
            if sv > 1:
                sv = 1
            angle = math.asin(sv)
            angle = angle * 180 / math.pi + 90
            if angle >= 180:
                angle = 179.9
            sign.create_arc(
                px + 2,
                2,
                px + 30,
                30,
                start=270 - angle,
                extent=2 * angle,
                style="chord",
                fill=bgfill,
                outline=txfill,
                width=2,
            )
            sign.create_text(
                px + 16,
                16,
                text=tlabel,
                font=("Fira Mono", 12),
                fill=txfill,
                justify="center",
            )
            px += 30

    def session_del(self, session_id: int) -> None:
        if self.closed:
            return
        self.session_named[session_id].pack_forget()
        self.session_named[session_id].destroy()
