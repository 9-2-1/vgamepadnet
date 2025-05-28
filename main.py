import vgamepad
import traceback
from threading import Thread
from queue import Queue
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from collections import defaultdict
from typing import Dict, Any

command: Queue[str] = Queue()

vibrate: int = 0;
vibrate_peak: int = 0;

class VGamepadNet(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        func = self.path
        if func == "/exit":
            command.put("0 exit")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", "0")
            self.end_headers()
            self.wfile.write(b"")
            server.shutdown()
        elif func == "/":
            with open("main.html", "rb") as f:
                content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
        elif func == "/style.css":
            with open("style.css", "rb") as f:
                content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/stylesheet; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
        elif func == "/script.js":
            with open("script.js", "rb") as f:
                content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
        else:
            # 301 redirect to /
            self.send_response(301)
            self.send_header("Location", "/")
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", "0")
            self.end_headers()

    def do_POST(self) -> None:
        func = self.path
        if func == "/command":
            lstr = self.headers.get("Content-Length", "0")
            l = int(lstr)
            v = self.rfile.read(l)
            cmds = v.decode().split("\n")
            for cmd in cmds:
                print(">", cmd)
                command.put(cmd)
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", "0")
            self.end_headers()
            self.wfile.write(b"")
        elif func == "/vibrate":
            global vibrate_peak
            reply = str(vibrate_peak).encode("utf-8")
            vibrate_peak = vibrate
            self.send_response(200)
            self.send_header("Content-Type", "application/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(reply)))
            self.end_headers()
            self.wfile.write(reply)
        elif func == "/log":
            lstr = self.headers.get("Content-Length", "0")
            l = int(lstr)
            v = self.rfile.read(l)
            print("L", v.decode())
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", "0")
            self.end_headers()
            self.wfile.write(b"")
        else:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", "13")
            self.end_headers()
            self.wfile.write(b"404 Not Found")
    def log_message(self, *_: Any) -> None:
        pass


def update_status(client, target, large_motor, small_motor, led_number, user_data):
    global vibrate
    global vibrate_peak
    vibrate = (large_motor + small_motor) / 2 / 255
    if vibrate_peak < vibrate:
        vibrate_peak = vibrate
    print(f"vibrate: {vibrate}")

def gploop() -> None:
    gp = vgamepad.VX360Gamepad()
    T: Dict[str, int] = defaultdict(int)
    gp.register_notification(update_status)
    
    while not command.is_shutdown:
        args = command.get().split(" ")
        try:
            t = int(args[0])
            if args[1] == "bdown":
                attr = args[2]
                if T[attr] < t:
                    T[attr] = t
                    gp.press_button(
                        button=getattr(vgamepad.XUSB_BUTTON, f"XUSB_GAMEPAD_{attr}")
                    )
                    gp.update()
            elif args[1] == "bup":
                attr = args[2]
                if T[attr] < t:
                    T[attr] = t
                    gp.release_button(
                        button=getattr(vgamepad.XUSB_BUTTON, f"XUSB_GAMEPAD_{attr}")
                    )
                    gp.update()
            elif args[1] == "lstick":
                if T["lstick"] < t:
                    T["lstick"] = t
                    x = float(args[2])
                    y = float(args[3])
                    gp.left_joystick_float(x, y)
                    gp.update()
            elif args[1] == "rstick":
                if T["rstick"] < t:
                    T["rstick"] = t
                    x = float(args[2])
                    y = float(args[3])
                    gp.right_joystick_float(x, y)
                    gp.update()
            elif args[1] == "ltrig":
                if T["ltrig"] < t:
                    T["ltrig"] = t
                    x = float(args[2])
                    gp.left_trigger_float(x)
                    gp.update()
            elif args[1] == "rtrig":
                if T["rtrig"] < t:
                    T["rtrig"] = t
                    x = float(args[2])
                    gp.right_trigger_float(x)
                    gp.update()
            elif args[1] == "reset":
                gp.reset()
                gp.update()
                T.clear()
            elif args[1] == "exit":
                gp.reset()
                gp.update()
                break
        except Exception:
            traceback.print_exc()


if __name__ == "__main__":
    gpthread = Thread(target=gploop)
    gpthread.start()
    try:
        server = ThreadingHTTPServer(("0.0.0.0", 8000), VGamepadNet)
        server.serve_forever()
    finally:
        command.shutdown()
