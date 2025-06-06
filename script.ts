let mainWebsocket: WebSocket | null = null;
let vibratePower = 0;
let peakVibratePower = 0;

let macroDown = false;
let macroStr = "";
let macroSteps: Array<string> = [];
let macroIndex = 0;
let macroTime: number | null = null;

let latencyTestCallback: ((value: unknown) => void) | null = null;
const latencyTestTimeout = 1000;
const latencyTestWait = 1000;
let latencyTestResults: Array<number> = [];
const latencyTestResultMax = 1;

type ButtonTableRaw = [string, string, string, ButtonMode, number];
type ButtonAttr = {
  label: string;
  name: string;
  mode: ButtonMode;
  size: number;
};
type ButtonTable = Record<string, ButtonAttr>;
let buttonPressed: Record<string, boolean> = {};
let dpadPressed: number = 8;
let dpadStr = "↑↗→↘↓↙←↖☩".split("");
let dpadAltStr = "W WD D SD S SA A WA".split(" ");
let textToSymbol: Record<string, string> = {};

function log(x: any): void {
  command(`L ${JSON.stringify(x)}`);
}

function command(x: string): void {
  if (mainWebsocket !== null) {
    mainWebsocket.send(x);
  }
}

type ButtonMode =
  | "button"
  | "dpad"
  | "stick"
  | "trigger"
  | "fullscreen"
  | "turbo"
  | "macrobar"
  | "macroplay"
  | "latency";
const turboButtons: {
  [symbol: string]: { enabled: boolean; timer: number | null };
} = {
  "1:": { enabled: false, timer: null },
  "2:": { enabled: false, timer: null },
  "3:": { enabled: false, timer: null },
  "4:": { enabled: false, timer: null },
};

function createButton(
  mode: ButtonMode,
  label: string,
  name: string,
  symbol: string,
  top: number,
  left: number,
  height: number,
  width: number,
) {
  let tagname: "input" | "button" = "button";
  let Tracker = (down: boolean, x: number, y: number) => {};
  let TrackerUp = () => {};
  let TrackerDown = () => {};
  let OnInput = () => {};
  switch (mode) {
    case "button":
      {
        TrackerUp = () => {
          buttonUp(symbol);
        };
        TrackerDown = () => {
          buttonDown(symbol);
        };
      }
      break;
    case "stick":
      {
        Tracker = (down: boolean, x: number, y: number) => {
          // log(`${x}, ${y}`);
          if (down) {
            x = 2 * x - 1;
            y = 2 * y - 1;
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
      {
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
      }
      break;
    case "dpad":
      {
        Tracker = (down: boolean, x: number, y: number) => {
          if (down) {
            x = 2 * x - 1;
            y = 2 * y - 1;
          } else {
            x = 0;
            y = 0;
          }
          const d = Math.sqrt(x * x + y * y);
          let direction = 8;
          if (d > 0.4) {
            const angle = Math.atan2(y, x);
            direction = Math.floor((angle / (2 * Math.PI)) * 8 + 2 + 0.5) % 8;
            if (direction < 0) {
              direction += 8;
            }
          }
          if (direction == 8) {
            button.classList.add("button-dpad-center");
          } else {
            button.classList.remove("button-dpad-center");
          }
          dpadChange(direction);
        };
      }
      break;
    case "fullscreen":
      {
        TrackerDown = () => {
          toggleFullScreen();
        };
      }
      break;
    case "turbo":
      {
        TrackerDown = () => {
          toggleButtonRepeat(symbol[0] + ":");
        };
      }
      break;
    case "macrobar":
      {
        tagname = "input";
        OnInput = () => {
          const val = button.value.trim();
          macroSteps = val.split(/\s+/).filter((s) => s && s !== " ");
          macroStr = val;
        };
      }
      break;
    case "macroplay":
      {
        TrackerDown = () => {
          if (macroTime === null) {
            if (macroStr !== "") {
              macroIndex = 0;
              macroDown = false;
              macroTime = setInterval(macroLoop, 100);
            }
          } else {
            clearInterval(macroTime);
            if (macroDown) {
              macroLoop();
            }
            macroTime = null;
          }
          updateButtons();
        };
      }
      break;
    case "latency":
      {
      }
      break;
  }

  const button = document.createElement(tagname);
  button.classList.add("button");
  button.classList.add(`button-${mode}`);
  button.textContent = label;
  button.style.top = `${top}px`;
  button.style.left = `${left}px`;
  button.style.height = `${height}px`;
  button.style.width = `${width}px`;
  button.style.fontSize = `${height * 0.5}px`;
  if (mode == "latency") {
    button.style.fontSize = `${height * 0.3}px`;
  }
  if (button instanceof HTMLButtonElement) {
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
  }
  if (button instanceof HTMLInputElement) {
    button.addEventListener("input", OnInput, true);
  }

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
  const minunit = 5;
  const tot = 100;
  let totOn = 0;
  let totOff = 0;
  const fixedPower = 1.0 - (1.0 - peakVibratePower) * 0.7;
  if (fixedPower >= 1) {
    a.push(tot);
  } else if (fixedPower <= 0) {
    // pass
  } else {
    while (totOn + totOff < tot) {
      if (fixedPower > 0.5) {
        totOff += minunit;
        const on = Math.floor(
          (totOff * fixedPower) / (1 - fixedPower) - totOn + 0.5,
        );
        a.push(on);
        a.push(minunit);
        totOn += on;
      } else {
        totOn += minunit;
        const off = Math.floor(
          (totOn * (1 - fixedPower)) / fixedPower - totOff + 0.5,
        );
        a.push(minunit);
        a.push(off);
        totOff += off;
      }
    }
  }
  // log(`peak: ${peakVibratePower} a: ${a}`);
  navigator?.vibrate(a);
  oldViberatePower = peakVibratePower;
  oldViberateCount = 0;
}

setInterval(vibration, 10);
const buttonmap = [
  "                                                                                ",
  "  LT                                  PS                                    RT  ",
  "              LS                                            4:                  ",
  "                                                                                ",
  "  LB              L.                                    3:      1:          RB  ",
  "                              SH      MS      OP                                ",
  "                                                            2:                  ",
  "                                                                                ",
  "                                                      RS                        ",
  "                                                                    4~          ",
  "                          D+                      R.                            ",
  "                                                                3~      1~      ",
  "                                                                                ",
  "                                                                    2~          ",
  "                                                                                ",
  "                                                                                ",
  "                          IN                      MA                        []  ",
  "                                                                                ",
];
function parseButtonTable(table: Array<ButtonTableRaw>): ButtonTable {
  const ret: ButtonTable = {};
  for (const line of table) {
    const [symbol, label, name, mode, size] = line;
    ret[symbol] = { label, name, mode, size };
  }
  return ret;
}
const buttonTable: ButtonTable = parseButtonTable([
  // [Symbol, Label, Name, Type, Size]
  ["1:", "○", "normal CIRCLE", "button", 3],
  ["2:", "✕", "normal CROSS", "button", 3],
  ["3:", "□", "normal SQUARE", "button", 3],
  ["4:", "△", "normal TRIANGLE", "button", 3],
  ["LS", "LS", "normal THUMB_LEFT", "button", 3],
  ["RS", "RS", "normal THUMB_RIGHT", "button", 3],
  ["LB", "LB", "normal SHOULDER_LEFT", "button", 3],
  ["RB", "RB", "normal SHOULDER_RIGHT", "button", 3],
  ["OP", "☰", "normal OPTIONS", "button", 3],
  ["SH", "…", "normal SHARE", "button", 3],
  ["PS", "PS", "special PS", "button", 3],
  ["TP", "■", "special TOUCHPAD", "button", 3],
  ["D+", "☩", "", "dpad", 5],
  ["L.", "L", "lstick", "stick", 5],
  ["R.", "R", "rstick", "stick", 5],
  ["LT", "LT", "ltrig", "trigger", 3],
  ["RT", "RT", "rtrig", "trigger", 3],
  ["[]", "⛶", "", "fullscreen", 3],
  ["1~", "○", "normal CIRCLE", "turbo", 3],
  ["2~", "✕", "normal CROSS", "turbo", 3],
  ["3~", "□", "normal SQUARE", "turbo", 3],
  ["4~", "△", "normal TRIANGLE", "turbo", 3],
  ["IN", "", "", "macrobar", 3],
  ["MA", "▶", "", "macroplay", 3],
  ["MS", "⏲", "", "latency", 3],
]);

let buttonNamed: Record<string, HTMLElement> = {};

function reload() {
  if (document.activeElement instanceof HTMLInputElement) {
    // Don't reload while typing
    return;
  }
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
      const symbol = buttonmap[i].slice(j * 2, j * 2 + 2);
      if (symbol == "  ") {
        continue;
      }
      const buttonX = buttonXoffset + j * buttonA + buttonA / 2;
      const buttonY = buttonYoffset + i * buttonA + buttonA / 2;
      const attr = buttonTable[symbol];
      if (attr) {
        buttonNamed[symbol] = createButton(
          attr.mode,
          attr.label,
          attr.name,
          symbol,
          buttonY - (attr.size * buttonA) / 2,
          buttonX - (attr.size * buttonA) / 2,
          attr.size * buttonA,
          attr.mode == "macrobar"
            ? attr.size * 4 * buttonA
            : attr.size * buttonA,
        );
        if (attr.mode == "button" || attr.mode == "trigger") {
          textToSymbol[attr.label] = symbol;
        }
      }
    }
  }
  textToSymbol["UP"] = "DU";
  textToSymbol["DOWN"] = "DD";
  textToSymbol["LEFT"] = "DL";
  textToSymbol["RIGHT"] = "DR";
  textToSymbol["^"] = "DU";
  textToSymbol["v"] = "DD";
  textToSymbol["<"] = "DL";
  textToSymbol[">"] = "DR";
  updateButtons();
}

function wsConnect() {
  const cwd = window.location.host + window.location.pathname;
  const nextWebsocket = new WebSocket(`ws://${cwd}websocket`);
  nextWebsocket.addEventListener("open", (event) => {
    mainWebsocket = nextWebsocket;
    updateButtons();
  });
  nextWebsocket.addEventListener("error", (event) => {
    console.error(event);
    mainWebsocket = null;
    updateButtons();
  });
  nextWebsocket.addEventListener("close", (event) => {
    console.error("mainWebsocket closed");
    mainWebsocket = null;
    updateButtons();
    setTimeout(wsConnect, 5000);
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
      } else if (args[0] == "pong") {
        if (latencyTestCallback !== null) {
          latencyTestCallback(null);
        }
      } else {
        console.warn(`Unknown command ${msg}`);
      }
    }
  });
}
function toggleButtonRepeat(symbol: string) {
  const buttonState = turboButtons[symbol];
  if (buttonState.timer !== null) {
    clearTimeout(buttonState.timer);
    buttonState.timer = null;
    buttonUp(symbol);
  }
  buttonState.enabled = !buttonState.enabled;
  if (buttonState.enabled) {
    turboButtonDown(symbol);
  }
  updateButtons();
}
function textToDirection(text: string) {
  const dpadDirection = dpadStr.indexOf(text);
  if (dpadDirection !== -1) {
    return dpadDirection;
  }
  return dpadAltStr.indexOf(text.toUpperCase());
}
function buttonDown(symbol: string) {
  // dpad
  const dpadDirection = textToDirection(symbol);
  if (dpadDirection !== -1) {
    dpadChange(dpadDirection);
    return;
  }
  const attr = buttonTable[symbol];
  if (attr) {
    if (attr.mode == "button") {
      command(`bdown ${attr.name}`);
    } else if (attr.mode == "trigger") {
      command(`${attr.name} 1`);
    } else {
      console.warn(`Unable to down button ${symbol}`);
    }
    buttonPressed[symbol] = true;
    updateButtons();
  } else {
    console.warn(`Unknown button ${symbol}`);
  }
}
function buttonUp(symbol: string) {
  const dpadDirection = textToDirection(symbol);
  if (dpadDirection !== -1) {
    dpadChange(8);
    return;
  }
  const attr = buttonTable[symbol];
  if (attr) {
    if (attr.mode == "button") {
      command(`bup ${attr.name}`);
    } else if (attr.mode == "trigger") {
      command(`${attr.name} 0`);
    } else {
      console.warn(`Unable to down button ${symbol}`);
    }
    buttonPressed[symbol] = false;
    updateButtons();
  } else {
    console.warn(`Unknown button ${symbol}`);
  }
}
function dpadChange(direction: number) {
  if (dpadPressed !== direction) {
    command(`dpad ${direction}`);
    dpadPressed = direction;
    updateButtons();
  }
}
function turboButtonDown(symbol: string) {
  buttonDown(symbol);
  const buttonState = turboButtons[symbol];
  buttonState.timer = setTimeout(() => turboButtonUp(symbol), 100);
}

function turboButtonUp(symbol: string) {
  buttonUp(symbol);
  const buttonState = turboButtons[symbol];
  buttonState.timer = setTimeout(() => turboButtonDown(symbol), 100);
}

function macroLoop() {
  if (macroIndex >= macroSteps.length) {
    macroIndex = 0;
  }
  let step = macroSteps[macroIndex];
  step = step.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(textToSymbol, step)) {
    step = textToSymbol[step];
  }
  if (macroDown) {
    if (step !== ".") {
      buttonUp(step);
    }
    macroIndex++;
    macroDown = false;
  } else {
    if (step !== ".") {
      buttonDown(step);
    }
    macroDown = true;
  }
}

function checkLatency() {
  if (mainWebsocket === null) {
    latencyTestResults = [];
    updateButtons();
    setTimeout(checkLatency, latencyTestWait);
    return;
  }
  mainWebsocket.send("ping");
  const latencyTestStart = new Date().getTime();
  new Promise((resolve, reject) => {
    latencyTestCallback = resolve;
    setTimeout(reject, latencyTestTimeout);
  })
    .then(() => {
      latencyTestCallback = null;
      const latencyTestStop = new Date().getTime();
      latencyTestResults.push(latencyTestStop - latencyTestStart);
      if (latencyTestResults.length > latencyTestResultMax) {
        latencyTestResults.shift();
      }
      updateButtons();
      setTimeout(checkLatency, latencyTestWait);
    })
    .catch(() => {
      latencyTestCallback = null;
      latencyTestResults = [];
      updateButtons();
      setTimeout(checkLatency, latencyTestWait);
    });
}

function updateButtons() {
  const bMS = buttonNamed["MS"];
  if (bMS instanceof HTMLButtonElement) {
    bMS.classList.remove("button-excellent");
    bMS.classList.remove("button-good");
    bMS.classList.remove("button-normal");
    bMS.classList.remove("button-bad");
    bMS.classList.remove("button-uncertain");
    bMS.classList.remove("button-disconnected");
    if (mainWebsocket === null) {
      bMS.textContent = "!";
      bMS.classList.add("button-disconnected");
    } else {
      if (latencyTestResults.length == 0) {
        bMS.textContent = "?";
        bMS.classList.add("button-uncertain");
      } else {
        let sum = 0;
        for (let v of latencyTestResults) {
          sum += v;
        }
        sum = Math.floor(sum / latencyTestResults.length);
        bMS.textContent = `${sum}ms`;
        if (sum < 50) {
          bMS.classList.add("button-excellent");
        } else if (sum < 100) {
          bMS.classList.add("button-good");
        } else if (sum < 200) {
          bMS.classList.add("button-normal");
        } else {
          bMS.classList.add("button-bad");
        }
      }
    }
  }
  Object.keys(buttonNamed).forEach((sym) => {
    const button = buttonNamed[sym];
    if (sym[1] == "~") {
      // turbo button
      const tsym = sym[0] + ":";
      if (turboButtons[tsym].enabled) {
        button.classList.add("button-locked");
      } else {
        button.classList.remove("button-locked");
      }
    }
    if (buttonPressed[sym]) {
      button.classList.add("button-pressed");
    } else {
      button.classList.remove("button-pressed");
    }
  });
  const dpad = buttonNamed["D+"];
  if (dpad instanceof HTMLButtonElement) {
    dpad.textContent = dpadStr[dpadPressed];
    if (dpadPressed == 8) {
      dpad.classList.remove("button-pressed");
      dpad.classList.add("button-dpad-center");
    } else {
      dpad.classList.add("button-pressed");
      dpad.classList.remove("button-dpad-center");
    }
  }
  const bMA = buttonNamed["MA"];
  const bIN = buttonNamed["IN"];
  if (bIN instanceof HTMLInputElement) {
    if (macroTime === null) {
      bMA.classList.remove("button-locked");
      bIN.disabled = false;
    } else {
      bMA.classList.add("button-locked");
      bIN.disabled = true;
    }
    bIN.value = macroStr;
  }
}
window.addEventListener("load", () => {
  reload();
  vibration();
  wsConnect();
  checkLatency();
});
window.addEventListener("resize", reload);
window.addEventListener("contextmenu", (event) => {
  event.stopPropagation();
  event.preventDefault();
});
command("reset");

const nosleep = new NoSleep();

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement?.requestFullscreen();
    try {
      screen?.orientation?.lock("landscape");
    } catch (e) {
      console.warn(e);
    }
    nosleep.enable();
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
    nosleep.disable();
  }
}
