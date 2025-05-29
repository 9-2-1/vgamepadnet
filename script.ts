let commandId = 1;
let commandList: Array<string> = [];
let commandScheduled = false;

let mainWebsocket: WebSocket | null = null;
let mainWebsocketColor = "#808080";
let vibratePower = 0;
let peakVibratePower = 0;

function log(x: any): void {
  command(`L ${JSON.stringify(x)}`);
}

function command(x: string): void {
  commandList.push(`${commandId++} ${x}`);
  if (!commandScheduled) {
    commandScheduled = true;
    setTimeout(() => {
      if (mainWebsocket !== null) {
        mainWebsocket.send(commandList.join("\n"));
        commandList = [];
      }
      commandScheduled = false;
    }, 16);
  }
}

type ButtonMode = "button" | "stick" | "trigger" | "fullscreen" | "special";
const specialKeys: {
  [key: string]: { enabled: boolean; timer: number | null };
} = {
  A: { enabled: false, timer: null },
  B: { enabled: false, timer: null },
  X: { enabled: false, timer: null },
  Y: { enabled: false, timer: null },
};

function createButton(
  mode: ButtonMode,
  label: string,
  name: string,
  top: number,
  left: number,
  height: number,
  width: number,
) {
  const button = document.createElement("button");
  button.classList.add("button");
  button.classList.add(`button-${mode}`);
  button.textContent = label;
  button.style.top = `${top}px`;
  button.style.left = `${left}px`;
  button.style.height = `${height}px`;
  button.style.width = `${width}px`;

  let Tracker = (down: boolean, x: number, y: number) => {};
  let TrackerUp = () => {};
  let TrackerDown = () => {};
  switch (mode) {
    case "button":
      {
        TrackerUp = () => {
          command(`bup ${name}`);
        };
        TrackerDown = () => {
          command(`bdown ${name}`);
        };
      }
      break;
    case "stick":
      {
        Tracker = (down: boolean, x: number, y: number) => {
          log(`${x}, ${y}`);
          if (down) {
            x = 2 * x - 1;
            y = -(2 * y - 1);
            x *= 1.5;
            y *= 1.5;
            let d = Math.sqrt(x * x + y * y);
            if (d > 1) {
              x /= d;
              y /= d;
              d = 1;
            }
          } else {
            x = 0;
            y = 0;
          }
          command(`${name} ${x} ${y}`);
        };
      }
      break;
    case "trigger":
      Tracker = (down: boolean, x: number, y: number) => {
        if (down) {
          y = 1.5 * y;
          if (y > 1) {
            y = 1;
          }
        } else {
          y = 0;
        }
        command(`${name} ${y}`);
      };
      break;
    case "fullscreen":
      TrackerDown = () => {
        toggleFullScreen();
      };
      break;
    case "special":
      TrackerDown = () => {
        toggleKeyRepeat(name);
      };
      break;
  }

  let oldDown = false;
  const TrackerRawPos = (down: boolean, x: number, y: number) => {
    if (down != oldDown) {
      if (down) {
        button.classList.add("button-down");
        TrackerDown();
      } else {
        button.classList.remove("button-down");
        TrackerUp();
      }
      oldDown = down;
    }
    Tracker(down, (x - left) / width, (y - top) / height);
  };

  const mouseMoveTracker = (ev: MouseEvent) => {
    TrackerRawPos(true, ev.clientX, ev.clientY);
    ev.preventDefault();
    ev.stopPropagation();
  };
  const mouseUpTracker = (ev: MouseEvent) => {
    TrackerRawPos(false, ev.clientX, ev.clientY);
    window.removeEventListener("mousemove", mouseMoveTracker);
    window.removeEventListener("mouseup", mouseUpTracker);
    ev.preventDefault();
    ev.stopPropagation();
  };
  const touchTracker = (ev: TouchEvent) => {
    if (ev.targetTouches.length == 0) {
      TrackerRawPos(false, 0, 0);
    } else {
      let x = 0;
      let y = 0;
      let n = 0;
      for (let i = 0; i < ev.targetTouches.length; i++) {
        const touch = ev.targetTouches[i];
        x += touch.clientX;
        y += touch.clientY;
        n += 1;
      }
      TrackerRawPos(true, x / n, y / n);
    }
    ev.preventDefault();
    ev.stopPropagation();
  };
  button.addEventListener("mousedown", (ev) => {
    TrackerRawPos(true, ev.clientX, ev.clientY);
    window.addEventListener("mousemove", mouseMoveTracker);
    window.addEventListener("mouseup", mouseUpTracker);
    ev.preventDefault();
    ev.stopPropagation();
  });
  button.addEventListener("touchstart", touchTracker);
  button.addEventListener("touchmove", touchTracker);
  button.addEventListener("touchend", touchTracker);

  document.body.appendChild(button);
  return button;
}
function createGridLine(
  left: number,
  top: number,
  height: number,
  width: number,
) {
  const gridline = document.createElement("span");
  gridline.classList.add("gridline");
  gridline.style.top = `${top}px`;
  gridline.style.left = `${left}px`;
  gridline.style.height = `${height}px`;
  gridline.style.width = `${width}px`;
  document.body.appendChild(gridline);
  return gridline;
}
let oldViberatePower = 0;
let oldViberateCount = 0;
function vibration() {
  const a: Array<number> = [];
  if (peakVibratePower == oldViberatePower) {
    if (peakVibratePower == 0) {
      peakVibratePower = vibratePower;
      return;
    }
    if (oldViberateCount < 10) {
      // 10*30=300ms
      oldViberateCount += 1;
      peakVibratePower = vibratePower;
      return;
    }
  }
  if (peakVibratePower == 0) {
    a.push(0);
  } else {
    let d = 0;
    for (let i = 0; i < 50; i++) {
      d += 10 * peakVibratePower;
      let p = Math.floor(d);
      d -= p;
      if (p > 10) {
        p = 10;
      }
      a.push(p);
      a.push(10 - p);
    } // 50*10=500ms
    for (let i = 1; i < a.length - 1; i++) {
      if (a[i] == 0) {
        a[i - 1] += a[i + 1];
        a.splice(i, 2);
        i--;
      }
    }
  }
  log(`peak: ${peakVibratePower}`);
  navigator.vibrate(a);
  oldViberatePower = peakVibratePower;
  oldViberateCount = 0;
}

setInterval(vibration, 10);
// const buttonmap = [
//   "LT        GU  Y:B:RT",
//   "LBLSL.        X:A:RB",
//   "      BA    STRS  A~",
//   "    DUDR      R.    ",
//   "    DLDD          []",
// ];
const buttonmap = [
  "                                                                                ",
  "  LT                                  GU                                    RT  ",
  "            LS                                              Y:                  ",
  "                                                                                ",
  "  LB            L.                                      X:      B:          RB  ",
  "                              BA              ST                                ",
  "                                                            A:                  ",
  "                                                                                ",
  "                    DU                                RS                        ",
  "                                                                    Y~          ",
  "                DL      DR                        R.                            ",
  "                                                                X~      B~      ",
  "                    DD                                                          ",
  "                                                                    A~          ",
  "                                                                                ",
  "                                                                                ",
  "                                                                            []  ",
  "                                                                                ",
];
const buttonname: Array<[string, string, string, ButtonMode, number]> = [
  // [Symbol, Label, Name, Type, Size]
  ["A:", "A", "A", "button", 3],
  ["B:", "B", "B", "button", 3],
  ["X:", "X", "X", "button", 3],
  ["Y:", "Y", "Y", "button", 3],
  ["LS", "LS", "LEFT_THUMB", "button", 3],
  ["RS", "RS", "RIGHT_THUMB", "button", 3],
  ["LB", "LB", "LEFT_SHOULDER", "button", 3],
  ["RB", "RB", "RIGHT_SHOULDER", "button", 3],
  ["DU", "↑", "DPAD_UP", "button", 3],
  ["DD", "↓", "DPAD_DOWN", "button", 3],
  ["DL", "←", "DPAD_LEFT", "button", 3],
  ["DR", "→", "DPAD_RIGHT", "button", 3],
  ["ST", "☰", "START", "button", 3],
  ["BA", "❐", "BACK", "button", 3],
  ["GU", "⭙", "GUIDE", "button", 3],
  ["L.", "(L)", "lstick", "stick", 5],
  ["R.", "(R)", "rstick", "stick", 5],
  ["LT", "LT", "ltrig", "trigger", 3],
  ["RT", "RT", "rtrig", "trigger", 3],
  ["[]", "⛶", "", "fullscreen", 3],
  ["A~", "[A]", "A", "special", 3],
  ["B~", "[B]", "B", "special", 3],
  ["X~", "[X]", "X", "special", 3],
  ["Y~", "[Y]", "Y", "special", 3],
];
let buttonNamed = {};

function reload() {
  document.querySelectorAll(".button").forEach((element) => {
    element.remove();
  });
  document.querySelectorAll(".gridline").forEach((element) => {
    element.remove();
  });
  const vw = document.body.clientWidth;
  const vh = document.body.clientHeight;
  const mapHeight = buttonmap.length;
  const mapWidth = buttonmap[0].length / 2;
  const buttonHeight = vw / mapWidth;
  const buttonWidth = vh / mapHeight;
  const buttonA = Math.min(buttonHeight, buttonWidth);
  const buttonXoffset = (vw - buttonA * mapWidth) / 2;
  const buttonYoffset = (vh - buttonA * mapHeight) / 2;
  // lines
  for (let i = 0; i <= mapHeight; i++) {
    createGridLine(
      buttonXoffset,
      buttonYoffset + i * buttonA,
      0,
      mapWidth * buttonA,
    );
  }
  for (let j = 0; j <= mapWidth; j++) {
    createGridLine(
      buttonXoffset + j * buttonA,
      buttonYoffset,
      mapHeight * buttonA,
      0,
    );
  }
  // buttons
  for (let i = 0; i < buttonmap.length; i++) {
    for (let j = 0; j < buttonmap[i].length / 2; j++) {
      const symb = buttonmap[i].slice(j * 2, j * 2 + 2);
      if (symb == "  ") {
        continue;
      }
      const buttonX = buttonXoffset + j * buttonA + buttonA / 2;
      const buttonY = buttonYoffset + i * buttonA + buttonA / 2;
      for (let k = 0; k < buttonname.length; k++) {
        const [sym, label, name, mode, size] = buttonname[k];
        if (sym == symb) {
          buttonNamed[sym] = createButton(
            mode,
            label,
            name,
            buttonY - (size * buttonA) / 2,
            buttonX - (size * buttonA) / 2,
            size * buttonA,
            size * buttonA,
          );
        }
      }
    }
  }
  updateButtonColor();
}

function wsConnect() {
  const hostPort = window.location.host;
  const nextWebsocket = new WebSocket(`ws://${hostPort}/websocket`);
  mainWebsocketColor = "#F0F080";
  updateButtonColor();
  nextWebsocket.addEventListener("open", (event) => {
    mainWebsocket = null;
    mainWebsocket = nextWebsocket;
    mainWebsocketColor = "#80FF80";
    updateButtonColor();
  });
  nextWebsocket.addEventListener("error", (event) => {
    console.error(event);
    mainWebsocket = null;
    mainWebsocketColor = "#FF8080";
    updateButtonColor();
  });
  nextWebsocket.addEventListener("close", (event) => {
    console.error("mainWebsocket closed");
    mainWebsocket = null;
    mainWebsocketColor = "#FF8080";
    updateButtonColor();
    setTimeout(wsConnect, 1000);
  });
  nextWebsocket.addEventListener("message", (event) => {
    const msg = event.data;
    if (typeof msg == "string") {
      const args = msg.split(" ");
      if (args[0] == "vibrate") {
        vibratePower = Number(args[1]);
        if (vibratePower > peakVibratePower) {
          peakVibratePower = vibratePower;
        }
      } else {
        console.warn(`Unknown command ${msg}`);
      }
    }
  });
}
function toggleKeyRepeat(key: string) {
  const keyState = specialKeys[key];
  if (keyState.timer !== null) {
    clearTimeout(keyState.timer);
    keyState.timer = null;
  }
  keyState.enabled = !keyState.enabled;
  if (keyState.enabled) {
    keyDown(key);
  }
  updateButtonColor();
}

function keyDown(key: string) {
  command(`bdown ${key}`);
  const keyState = specialKeys[key];
  keyState.timer = setTimeout(() => keyUp(key), 50);
}

function keyUp(key: string) {
  command(`bup ${key}`);
  const keyState = specialKeys[key];
  keyState.timer = setTimeout(() => keyDown(key), 50);
}

function updateButtonColor() {
  buttonNamed["GU"].style.backgroundColor = mainWebsocketColor;
  ["A~", "B~", "X~", "Y~"].forEach((sym) => {
    const key = sym.slice(0, -1);
    const button = buttonNamed[sym];
    if (button) {
      if (specialKeys[key].enabled) {
        button.classList.add("button-locked");
      } else {
        button.classList.remove("button-locked");
      }
    }
  });
}
window.addEventListener("load", () => {
  reload();
  vibration();
  wsConnect();
});
window.addEventListener("resize", reload);
window.addEventListener("contextmenu", (event) => {
  event.stopPropagation();
  event.preventDefault();
});
command("reset");

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
}
