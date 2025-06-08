import logging
import tkinter
import tkinter.messagebox
import socket
import queue
from dataclasses import dataclass
from typing import Callable, Dict, Tuple, Set, Union
from copy import deepcopy

from .session import Session

log = logging.getLogger(__name__)


@dataclass
class GUISessionState:
    button_states: Dict[str, bool]
    trigger_states: Dict[str, float]
    stick_states: Dict[str, Tuple[float, float]]
    large_motor: float
    small_motor: float
    led_number: int

    @classmethod
    def from_session(cls, session: Session) -> "GUISessionState":
        return cls(
            deepcopy(session.button_states),
            deepcopy(session.trigger_states),
            deepcopy(session.stick_states),
            session.large_motor,
            session.small_motor,
            session.led_number,
        )


@dataclass
class GUISessionAddEvent:
    session_id: int


@dataclass
class GUISessionChangeEvent:
    session_id: int
    state: GUISessionState


@dataclass
class GUISessionDelEvent:
    session_id: int


@dataclass
class GUIErrorEvent:
    pass


GUIEvent = Union[
    GUISessionAddEvent, GUISessionChangeEvent, GUISessionDelEvent, GUIErrorEvent
]

CYCLE_MS = 10


class GUI:
    def __init__(self) -> None:
        self.root = tkinter.Tk()
        self.root.title("VGamepadNet")
        self.root.resizable(False, False)
        self.title = tkinter.Label(self.root, text="VGamepadNet", font=("微软雅黑", 16))
        self.title.pack()
        self.links_title = tkinter.Label(self.root, text="链接", font=("微软雅黑", 12))
        self.links_title.pack()
        self.links_refresh_button = tkinter.Button(
            self.root, text="刷新", command=self.links_refresh
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
        self.on_close: Set[Callable[[], None]] = set()  # 关闭GUI时调用
        self.root.protocol("WM_DELETE_WINDOW", self.close)  # 关闭GUI时调用
        self.closed = False

        self.links_refresh()
        self.cycle_queue()

    def mainloop(self) -> None:
        self.root.mainloop()

    def report_error(self) -> None:
        tkinter.messagebox.showerror("错误", "发生错误，请查看debug.log获取详细信息")
        self.close()

    def links_refresh(self) -> None:
        for widget in self.links.winfo_children():
            widget.destroy()
        for link in socket.gethostbyname_ex(socket.gethostname())[2]:
            link_label = tkinter.Text(
                self.links, font=("微软雅黑", 12), height=1, width=30
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
                if isinstance(event, GUISessionAddEvent):
                    self.session_add(event.session_id)
                elif isinstance(event, GUISessionChangeEvent):
                    self.session_change(event.session_id, event.state)
                elif isinstance(event, GUISessionDelEvent):
                    self.session_del(event.session_id)
        except queue.Empty:
            self.root.after(CYCLE_MS, self.cycle_queue)
        except queue.ShutDown:
            self.close()

    def session_add(self, session_id: int) -> None:
        if self.closed:
            return
        session_id_label = tkinter.Label(
            self.sessions, text=f"ID: {session_id}", font=("微软雅黑", 12)
        )
        session_id_label.pack()
        self.session_named[session_id] = session_id_label

    def session_change(self, session_id: int, state: GUISessionState) -> None:
        if self.closed:
            return
        label = self.session_named[session_id]
        assert isinstance(label, tkinter.Label)
        label.configure(
            text=f"ID: {session_id}\n按钮: {state.button_states}\n扳机: {state.trigger_states}\n摇杆: {state.stick_states}\n大电机: {state.large_motor}\n小电机: {state.small_motor}\nLED: {state.led_number}"
        )

    def session_del(self, session_id: int) -> None:
        if self.closed:
            return
        self.session_named[session_id].pack_forget()
        self.session_named[session_id].destroy()
