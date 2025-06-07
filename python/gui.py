import logging
import tkinter
import tkinter.ttk
import tkinter.messagebox
import socket
from dataclasses import dataclass
from typing import Awaitable, Union, Optional, Callable, List, Dict, Tuple, Set
from copy import deepcopy

from session import Session

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


class GUI:
    def __init__(self) -> None:
        self.root = tkinter.Tk()
        self.root.title("VGamepadNet")
        self.root.resizable(False, False)
        self.title = tkinter.Label(self.root, text="VGamepadNet", font=("微软雅黑", 16))
        self.title.pack()
        self.links_title = tkinter.Label(self.root, text="链接", font=("微软雅黑", 12))
        self.links_title.pack()
        self.links_refresh = tkinter.Button(
            self.root, text="刷新", command=self.links_refresh_on_click
        )
        self.links_refresh.pack()
        self.links = tkinter.Frame(self.root)
        self.links.pack()
        self.sessions_title = tkinter.Label(
            self.root, text="已连接的手柄", font=("微软雅黑", 12)
        )
        self.sessions_title.pack()
        self.sessions = tkinter.Frame(self.root)
        self.sessions.pack()

        self.session_named: Dict[int, tkinter.Widget] = {}

        self.on_close: Set[Callable[[], None]] = set()  # 关闭GUI时调用
        self.root.protocol("WM_DELETE_WINDOW", self.on_close_button)  # 关闭GUI时调用

    def mainloop(self) -> None:
        self.root.mainloop()

    def report_error(self) -> None:
        tkinter.messagebox.showerror("错误", "发生错误，请查看debug.log获取详细信息")
        self.close()

    def links_refresh_on_click(self) -> None:
        for widget in self.links.winfo_children():
            widget.destroy()
        for link in socket.gethostbyname_ex(socket.gethostname())[2]:
            link_label = tkinter.Text(
                self.links, font=("微软雅黑", 12), height=1, width=30
            )
            link_label.insert("end", link)
            link_label.configure(state="disabled")
            link_label.pack(fill="x")

    def on_close_button(self) -> None:
        self.close()

    def close(self) -> None:
        for cb in self.on_close:
            cb()
        self.root.destroy()

    def session_add(self, session_id: int) -> None:
        session = tkinter.Frame(self.sessions)
        session.pack(fill="x")
        session_id_label = tkinter.Label(
            session, text=f"ID: {session_id}", font=("微软雅黑", 12)
        )
        session_id_label.pack()
        self.session_named[session_id] = session_id_label

    def session_add_after_idle(self, session_id: int) -> None:
        self.root.after_idle(lambda: self.session_add(session_id))

    def session_change(self, session_id: int, state: GUISessionState) -> None:
        label = self.session_named[session_id]
        assert isinstance(label, tkinter.Label)
        label.configure(
            text=f"ID: {session_id}\n按钮: {state.button_states}\n扳机: {state.trigger_states}\n摇杆: {state.stick_states}\n大电机: {state.large_motor}\n小电机: {state.small_motor}\nLED: {state.led_number}"
        )

    def session_change_after_idle(
        self, session_id: int, state: GUISessionState
    ) -> None:
        self.root.after_idle(lambda: self.session_change(session_id, state))

    def session_del(self, session_id: int) -> None:
        self.session_named[session_id].destroy()
        del self.session_named[session_id]

    def session_del_after_idle(self, session_id: int) -> None:
        self.root.after_idle(lambda: self.session_del(session_id))
