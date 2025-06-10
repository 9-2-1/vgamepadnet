import logging
import tkinter
import tkinter.messagebox
import queue
from dataclasses import dataclass
from typing import Callable, Dict, Set, Union, DefaultDict, List
from copy import deepcopy
import textwrap

from .session import Session

log = logging.getLogger(__name__)

button_symbol_xbox = {
    "up": "↑",
    "down": "↓",
    "left": "←",
    "right": "→",
    "start": "☰",
    "back": "❐",
    "guide": "⭙",
}


button_symbol_ds4 = {
    "up": "↑",
    "down": "↓",
    "left": "←",
    "right": "→",
    "start": "☰",
    "back": "❐",
    "guide": "PS",
}


@dataclass
class SessionState:
    xbox_mode: bool

    state: DefaultDict[str, Union[int, float]]
    state_out: DefaultDict[str, Union[int, float]]

    @classmethod
    def from_session(cls, session: Session) -> "SessionState":
        return cls(
            xbox_mode=session.xbox_mode,
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
            cb()

    def mainloop(self) -> None:
        self.root.mainloop()

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
            cb()
        self.root.destroy()
        self.closed = True

    def cycle_queue(self) -> None:
        try:
            while True:
                event = self.queue.get_nowait()
                if isinstance(event, SessionAddEvent):
                    self.session_add(event.session_id)
                elif isinstance(event, SessionChangeEvent):
                    self.session_change(event.session_id, event.state)
                elif isinstance(event, SessionDelEvent):
                    self.session_del(event.session_id)
                elif isinstance(event, LinkUpdateEvent):
                    self.link_update(event.links)
        except queue.Empty:
            self.root.after(CYCLE_MS, self.cycle_queue)
        except queue.ShutDown:
            self.close()

    def session_add(self, session_id: int) -> None:
        if self.closed:
            return
        session_id_label = tkinter.Label(
            self.sessions, text=f"{session_id}", font=("Fira Mono", 12), justify="left"
        )
        session_id_label.pack()
        self.session_named[session_id] = session_id_label

    def session_change(self, session_id: int, state: SessionState) -> None:
        if self.closed:
            return
        label = self.session_named[session_id]
        assert isinstance(label, tkinter.Label)
        sign = button_symbol_xbox["guide"] if state.xbox_mode else button_symbol_ds4["guide"]
        #
        'LT LB LS left down up right back guide option x y a b RS RB RT gyro'
        label.configure(
            text="\n".join(
                textwrap.wrap(
                    f"{session_id} {sign} {state.state} {state.state_out}", 70
                )
            )
        )

    def session_del(self, session_id: int) -> None:
        if self.closed:
            return
        self.session_named[session_id].pack_forget()
        self.session_named[session_id].destroy()
