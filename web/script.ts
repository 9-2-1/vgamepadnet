type ButtonShape =
  | "button" // 按钮
  | "stick" // 虚拟摇杆
  | "trigger" // 扳机键
  | "label"; // 显示状态的标签
type ButtonMode =
  | { mode: "press"; name: string } // 按下发送“1”，松开发送“0”
  | { mode: "trigger"; name: string } // 根据拖动的位置或者长度发送数值
  | { mode: "stick"; name: string } // 发送X,Y两个数值(-1.0~1.0)，点击时发送“点击”事件
  | { mode: "fullscreen" } // 全屏
  | { mode: "macro"; id: number } // 宏按键
  | { mode: "edit" } // 编辑布局
  | { mode: "record" } // 录制宏
  | { mode: "turbo" } // 连发键
  | { mode: "speed"; value?: number } // 速度变化
  | { mode: "status" } // 状态显示
  | { mode: "settings" }; // 其他设定
type ButtonDef = {
  label: string;
  shape: ButtonShape;
  mode?: ButtonMode; // 按键模式，默认根据label和shape生成
};
type ButtonPos = {
  x: number;
  y: number;
  scale: number;
  show: boolean;
};
type ButtonDefTable = Record<string, ButtonDef>;
type ButtonPosTable = Record<string, ButtonPos>;
type GamepadState = Record<string, number>;

const buttonDefTable: ButtonDefTable = {
  // gamepad buttons
  LB: { label: "LB", shape: "button" },
  RB: { label: "RB", shape: "button" },
  LT: { label: "LT", shape: "trigger" },
  RT: { label: "RT", shape: "trigger" },
  LS: { label: "LS", shape: "stick" },
  up: { label: "↑", shape: "button" },
  down: { label: "↓", shape: "button" },
  left: { label: "←", shape: "button" },
  right: { label: "→", shape: "button" },
  RS: { label: "RS", shape: "stick" },
  A: { label: "A", shape: "button" },
  B: { label: "B", shape: "button" },
  X: { label: "X", shape: "button" },
  Y: { label: "Y", shape: "button" },
  back: { label: "❐", shape: "button" },
  start: { label: "☰", shape: "button" },
  guide: { label: "⭙", shape: "button" },
  // easy buttons
  LTb: { label: "LT", shape: "button", mode: { mode: "press", name: "LT" } },
  RTb: { label: "RT", shape: "button", mode: { mode: "press", name: "RT" } },
  LSb: { label: "LS", shape: "button", mode: { mode: "press", name: "LS" } },
  RSb: { label: "RS", shape: "button", mode: { mode: "press", name: "RS" } },
  // macro
  M1: { label: "M1", shape: "button", mode: { mode: "macro", id: 1 } },
  M2: { label: "M2", shape: "button", mode: { mode: "macro", id: 2 } },
  M3: { label: "M3", shape: "button", mode: { mode: "macro", id: 3 } },
  M4: { label: "M4", shape: "button", mode: { mode: "macro", id: 4 } },
  // functional
  fullscreen: { label: "⛶", shape: "button", mode: { mode: "fullscreen" } },
  record: { label: "●", shape: "button", mode: { mode: "record" } },
  turbo: { label: "↻", shape: "button", mode: { mode: "turbo" } },
  "speed-": { label: "≪", shape: "button", mode: { mode: "speed", value: -1 } },
  "speed+": { label: "≫", shape: "button", mode: { mode: "speed", value: 1 } },
  status: {
    label: "JavaScript 错误",
    shape: "label",
    mode: { mode: "status" },
  },
  settings: { label: "⚙", shape: "button", mode: { mode: "settings" } },
  edit: { label: "✎", shape: "button", mode: { mode: "edit" } },
};

const ds4Labels: Record<string, string> = {
  LB: "L1",
  RB: "R1",
  LT: "L2",
  RT: "R2",
  LS: "L3",
  RS: "R3",
  A: "✕",
  B: "○",
  X: "□",
  Y: "△",
  back: "…",
  start: "☰",
  guide: "PS",
};

class Vibration {
  oldViberatePower = 0;
  oldViberateCount = 0;
  vibratePower = 0;
  peakVibratePower = 0;
  interval: number | null = null;
  vibration() {
    const a: Array<number> = [];
    if (this.peakVibratePower === this.oldViberatePower) {
      if (this.peakVibratePower === 0) {
        this.peakVibratePower = this.vibratePower;
        return;
      }
      if (this.oldViberateCount < 10) {
        // 10*30=300ms
        this.oldViberateCount += 1;
        this.peakVibratePower = this.vibratePower;
        return;
      }
    }
    const minunit = 5;
    const tot = 100;
    let totOn = 0;
    let totOff = 0;
    const fixedPower = 1.0 - (1.0 - this.peakVibratePower) * 0.7;
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
    // console.log(`peak: ${this.vibratePower} a: ${a}`);
    navigator.vibrate?.(a);
    this.oldViberatePower = this.peakVibratePower;
    this.oldViberateCount = 0;
    this.peakVibratePower = this.vibratePower;
  }
  start() {
    if (this.interval === null) {
      this.interval = setInterval(this.vibration.bind(this), 10);
    }
  }
  stop() {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

class Latency {
  latency: number | null = null;
  callback: (() => void) | null = null;
  running = false;
  timeout: number | null = null;
  constructor(
    public gamepad: VGamepad,
    public waitms: number = 1000,
  ) {}
  start() {
    this.running = true;
    this.timeout = setTimeout(this.ping.bind(this), this.waitms);
  }
  stop() {
    this.running = false;
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
  ping() {
    if (this.gamepad.websocket === null) {
      this.latency = null;
      this.gamepad.updateButtons();
      this.timeout = setTimeout(this.ping.bind(this), this.waitms);
    } else {
      this.gamepad.websocket.send("ping");
      const start = new Date().getTime();
      new Promise<void>((resolve, reject) => {
        this.callback = () => {
          resolve();
        };
        this.timeout = setTimeout(reject, this.waitms);
      })
        .then((value) => {
          this.callback = null;
          const stop = new Date().getTime();
          this.latency = stop - start;
          this.gamepad.updateButtons();
          if (this.timeout !== null) {
            clearTimeout(this.timeout);
          }
          this.timeout = setTimeout(this.ping.bind(this), this.waitms);
        })
        .catch(() => {
          this.callback = null;
          this.latency = null;
          this.gamepad.updateButtons();
          if (this.timeout !== null) {
            clearTimeout(this.timeout);
          }
          this.timeout = setTimeout(this.ping.bind(this), this.waitms);
        });
    }
  }
  onPong() {
    if (this.callback !== null) {
      this.callback();
    }
  }
}

const nosleep = new NoSleep();
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
    try {
      // @ts-ignore
      screen?.orientation?.lock?.("landscape");
    } catch (e) {
      console.warn(e);
    }
    try {
      nosleep.enable();
    } catch (e) {
      console.warn(e);
    }
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
    try {
      nosleep.disable();
    } catch (e) {
      console.warn(e);
    }
  }
}
function defaultMode(def: ButtonDef, symbol: string): ButtonMode {
  switch (def.shape) {
    case "button":
      return { mode: "press", name: symbol };
    case "stick":
      return { mode: "stick", name: symbol };
    case "trigger":
      return { mode: "trigger", name: symbol };
    default:
      throw new Error(`Unable to derive mode for ${symbol}`);
  }
}
function addTouchListeners(
  button: HTMLButtonElement,
  touchCallback: (down: boolean, clientX: number, clientY: number) => void,
) {
  // mouse
  function onMouseMove(ev: MouseEvent) {
    touchCallback(true, ev.clientX, ev.clientY);
    ev.stopPropagation();
    ev.preventDefault();
  }
  function onMouseUp(ev: MouseEvent) {
    touchCallback(false, ev.clientX, ev.clientY);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    ev.stopPropagation();
    ev.preventDefault();
  }
  function onMouseDown(ev: MouseEvent) {
    touchCallback(true, ev.clientX, ev.clientY);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    ev.stopPropagation();
    ev.preventDefault();
  }
  button.addEventListener("mousedown", onMouseDown);
  // Touch
  function onTouchChange(ev: TouchEvent) {
    if (ev.targetTouches.length === 0) {
      button.classList.remove("button-touchdown");
      touchCallback(false, 0, 0);
    } else {
      button.classList.add("button-touchdown");
      let x = 0,
        y = 0,
        n = ev.targetTouches.length;
      for (let i = 0; i < n; i++) {
        const touch = ev.targetTouches.item(i);
        if (touch !== null) {
          x += touch.clientX;
          y += touch.clientY;
        }
      }
      touchCallback(true, x / n, y / n);
    }
    ev.stopPropagation();
    ev.preventDefault();
  }
  button.addEventListener("touchstart", onTouchChange);
  button.addEventListener("touchmove", onTouchChange);
  button.addEventListener("touchend", onTouchChange);
  button.addEventListener("touchcancel", onTouchChange);
  // revert
  function removeTouchListeners() {
    button.removeEventListener("mousedown", onMouseDown);
    button.removeEventListener("mouseup", onMouseUp);
    button.removeEventListener("mousemove", onMouseMove);
    button.removeEventListener("touchstart", onTouchChange);
    button.removeEventListener("touchmove", onTouchChange);
    button.removeEventListener("touchend", onTouchChange);
    button.removeEventListener("touchcancel", onTouchChange);
  }
  return removeTouchListeners;
}

type GamepadMode = "xbox" | "ds4";
class VGamepad {
  mode: GamepadMode = "xbox";
  state: GamepadState = {};
  state_out: GamepadState = {};
  editMode = false;
  element: HTMLDivElement;
  buttons: Record<string, VGamepadButton> = {};
  websocket: WebSocket | null = null;
  websocketOpening = false;
  latency: Latency;
  vibration: Vibration;
  message = "";
  constructor(
    parent: HTMLElement,
    public serverLink: string,
  ) {
    this.element = document.createElement("div");
    this.element.classList.add("gamepad");
    parent.appendChild(this.element);
    this.latency = new Latency(this);
    this.vibration = new Vibration();
    this.connect();
    this.latency.start();
    this.vibration.start();
  }
  updateButtons() {
    for (const btn of Object.values(this.buttons)) {
      btn.posToRealPos();
      btn.updateButton();
    }
    const status = this.buttons.status?.element;
    if (status !== undefined) {
      status.textContent =
        `` +
        `${this.state_out.session_id ?? 0}: ${this.mode}\n` +
        `${this.latency.latency === null ? "未连接" : this.latency.latency + "ms"}\n` +
        `${this.message}`;
    }
  }
  setEditMode(editMode: boolean) {
    this.editMode = editMode;
    if (editMode) {
      this.element.classList.add("gamepad-edit");
    } else {
      this.element.classList.remove("gamepad-edit");
    }
    this.updateButtons();
  }
  savePosTable() {
    let totalPos: ButtonPosTable = {};
    for (const [symbol, btn] of Object.entries(this.buttons)) {
      totalPos[symbol] = btn.pos;
    }
    localStorage.setItem("buttonPosTable", JSON.stringify(totalPos));
  }
  setState(name: string, value: number) {
    if (this.state[name] != value) {
      if (this.websocket !== null && !this.websocketOpening) {
        this.websocket.send(`set ${name} ${value}`);
      }
      this.state[name] = value;
    }
  }
  setMode(mode: GamepadMode) {
    this.mode = mode;
    this.wsInit();
  }
  setMessage(msg: string) {
    this.message = msg;
    this.updateButtons();
  }
  connect() {
    this.websocket = new WebSocket(this.serverLink);
    this.websocketOpening = true;
    this.websocket.addEventListener("open", () => {
      this.websocketOpening = false;
      this.wsInit();
    });
    this.websocket.addEventListener("message", (ev) => {
      this.wsMessage(ev.data);
    });
    this.websocket.addEventListener("error", (ev) => {
      console.error(ev);
    });
    this.websocket.addEventListener("close", () => {
      if (this.websocket === null) {
        console.error("Websocket not ready");
        return;
      }
      this.websocket = null;
      this.websocketOpening = false;
      // retry
      setTimeout(() => {
        this.connect();
      }, 1000);
    });
  }
  wsInit() {
    if (this.websocket === null || this.websocketOpening) {
      console.error("Websocket not ready");
      return;
    }
    this.websocket.send(`mode ${this.mode}`);
    let init_str = "set";
    for (const [name, value] of Object.entries(this.state)) {
      init_str += ` ${name} ${value}`;
    }
    this.websocket.send(init_str);
  }
  wsMessage(msg: string) {
    const args = msg.split(" ");
    if (args[0] === "set") {
      for (let i = 1; i + 1 < args.length; i += 2) {
        this.state_out[args[i]] = parseFloat(args[i + 1]);
        if (args[i] === "large_motor" || args[i] === "small_motor") {
          this.vibration.vibratePower = Math.max(
            this.state_out.large_motor ?? 0,
            this.state_out.small_motor ?? 0,
          );
        }
        if (args[i] === "led_number") {
          this.updateButtons();
        }
      }
    } else if (args[0] === "pong") {
      this.latency.onPong();
    }
  }
}
class VGamepadButton {
  realPos = { x: 0, y: 0, width: 0, height: 0, offsetX: 0, offsetY: 0 }; // 屏幕上的实际位置和大小
  mode: ButtonMode;
  editMode = {
    offsetX: 0,
    offsetY: 0,
    previousTime: 0,
    previousX: 0,
    previousY: 0,
    moved: false,
  };
  stickDrag = { offsetX: 0, offsetY: 0 };
  prevDown = false;
  element: HTMLButtonElement;
  elementShade: HTMLDivElement | null = null;
  constructor(
    public gamepad: VGamepad,
    public symbol: string,
    public def: ButtonDef,
    public pos: ButtonPos, // 相对位置(左边界碰到窗口左边界为0，右边界碰到窗口右边界为100)
  ) {
    this.mode = def.mode ?? defaultMode(def, symbol);
    this.element = document.createElement("button");
    this.element.textContent = this.def.label;
    this.element.classList.add(
      "button",
      `button-${this.symbol}`,
      `button-${this.def.shape}`,
    );
    addTouchListeners(this.element, this.touchCallback.bind(this));
    if (this.def.shape == "stick" || this.def.shape == "trigger") {
      this.elementShade = document.createElement("div");
      this.elementShade.classList.add(
        "buttonshade",
        `buttonshade-${this.symbol}`,
        `buttonshade-${this.def.shape}`,
      );
      this.gamepad.element.appendChild(this.elementShade);
    }
    this.gamepad.element.appendChild(this.element);
    this.posToRealPos();
    this.updateButton();
  }
  touchCallbackEditmode(down: boolean, clientX: number, clientY: number) {
    if (this.prevDown) {
      if (down) {
        const dragX = clientX - this.editMode.previousX;
        const dragY = clientY - this.editMode.previousY;
        if (Math.abs(dragX) > 5 || Math.abs(dragY) > 5) {
          this.editMode.moved = true;
        }
        this.realPos.x = clientX - this.editMode.offsetX;
        this.realPos.y = clientY - this.editMode.offsetY;
      } else {
        this.realPosToPos();
        if (this.pos.x < 0) {
          this.pos.x = 0;
        }
        if (this.pos.x > 100) {
          this.pos.x = 100;
        }
        if (this.pos.y < 0) {
          this.pos.y = 0;
        }
        if (this.pos.y > 100) {
          this.pos.y = 100;
        }
        this.posToRealPos();
        const currentTime = new Date().getTime();
        if (currentTime - this.editMode.previousTime > 500) {
          this.editMode.moved = true;
        }
        if (!this.editMode.moved) {
          if (this.mode.mode == "edit") {
            this.gamepad.setEditMode(false);
            this.gamepad.savePosTable();
          } else {
            this.pos.show = !this.pos.show;
          }
        }
      }
      this.updateButton();
    } else {
      if (down) {
        this.editMode = {
          offsetX: clientX - this.realPos.x,
          offsetY: clientY - this.realPos.y,
          previousTime: new Date().getTime(),
          previousX: clientX,
          previousY: clientY,
          moved: false,
        };
      }
      this.updateButton();
    }
  }
  touchCallback(down: boolean, clientX: number, clientY: number) {
    if (this.gamepad.editMode) {
      this.touchCallbackEditmode(down, clientX, clientY);
      this.prevDown = down;
      return;
    }
    if (down) {
      this.element.classList.add("button-touchdown");
    } else {
      this.element.classList.remove("button-touchdown");
    }
    switch (this.mode.mode) {
      case "press":
        this.gamepad.setState(this.mode.name, down ? 1 : 0);
        break;
      case "trigger":
        {
          let sy = 0;
          if (down) {
            if (!this.prevDown) {
              // this.realPos.x for fix position
              this.stickDrag.offsetX = clientX;
              this.stickDrag.offsetY = clientY;
            }
            sy = ((clientY - this.stickDrag.offsetY) / this.realPos.height) * 2;
            if (sy > 1) {
              sy = 1;
            }
            if (sy < 0) {
              sy = 0;
            }
          }
          this.gamepad.setState(this.mode.name, sy);
          this.realPos.offsetY = sy * 0.5 * this.realPos.height;
          this.updateButton();
        }
        break;
      case "stick":
        {
          let sx = 0,
            sy = 0;
          if (down) {
            if (!this.prevDown) {
              // this.realPos.x for fix position
              this.stickDrag.offsetX = clientX;
              this.stickDrag.offsetY = clientY;
            }
            sx = ((clientX - this.stickDrag.offsetX) / this.realPos.width) * 2;
            sy =
              (-(clientY - this.stickDrag.offsetY) / this.realPos.height) * 2;
            const d = Math.sqrt(sx * sx + sy * sy);
            if (d > 1) {
              sx /= d;
              sy /= d;
            }
          }
          this.gamepad.setState(`${this.mode.name}x`, down ? sx : 0);
          this.gamepad.setState(`${this.mode.name}y`, down ? sy : 0);
          this.realPos.offsetX = sx * 0.5 * this.realPos.width;
          this.realPos.offsetY = sy * -0.5 * this.realPos.height;
          this.updateButton();
        }
        break;
      case "fullscreen":
        if (down && !this.prevDown) {
          toggleFullScreen();
        }
        break;
      case "edit":
        if (down && !this.prevDown) {
          this.gamepad.setEditMode(true);
          this.editMode = {
            offsetX: clientX - this.realPos.x,
            offsetY: clientY - this.realPos.y,
            previousTime: new Date().getTime(),
            previousX: clientX,
            previousY: clientY,
            moved: true, // 防止点击后立即触发放开导致退出编辑模式
          };
        }
        break;
      case "macro":
        this.gamepad.setMessage("宏仍在开发中");
        break;
      case "record":
        this.gamepad.setMessage("宏仍在开发中");
        break;
      case "turbo":
        this.gamepad.setMessage("连发仍在开发中");
        break;
      case "speed":
        break;
      case "status":
        if (down && !this.prevDown) {
          if (this.gamepad.mode == "ds4") {
            this.gamepad.setMode("xbox");
          } else {
            this.gamepad.setMode("ds4");
          }
        }
        break;
      case "settings":
        if (down && !this.prevDown) {
          prompt(
            "copy settings",
            localStorage.getItem("buttonPosTable") ?? "{}",
          );
          if (confirm("Reset settings?")) {
            localStorage.clear();
            window.location.reload();
          }
        }
        break;
    }
    this.prevDown = down;
  }
  posToRealPos() {
    const height = this.gamepad.element.clientHeight;
    const width = this.gamepad.element.clientWidth;
    // assume height > width
    const scale = (Math.min(height, width) * this.pos.scale) / 100;
    const x = (this.pos.x * (width - scale)) / 100;
    const y = (this.pos.y * (height - scale)) / 100;
    this.realPos.x = x;
    this.realPos.y = y;
    this.realPos.width = scale;
    this.realPos.height = scale;
  }
  realPosToPos() {
    const height = this.gamepad.element.clientHeight;
    const width = this.gamepad.element.clientWidth;
    // assume height > width
    const scale = (Math.min(height, width) * this.pos.scale) / 100;
    const x = (this.realPos.x * 100) / (width - scale);
    const y = (this.realPos.y * 100) / (height - scale);
    this.pos.x = x;
    this.pos.y = y;
  }
  updateButton() {
    if (this.gamepad.mode == "ds4") {
      this.element.textContent = ds4Labels[this.symbol] ?? this.def.label;
    } else {
      this.element.textContent = this.def.label;
    }
    this.element.style.left = `${this.realPos.x + this.realPos.offsetX}px`;
    this.element.style.top = `${this.realPos.y + this.realPos.offsetY}px`;
    this.element.style.width = `${this.realPos.width}px`;
    this.element.style.height = `${this.realPos.height}px`;
    if (this.mode.mode == "status") {
      this.element.style.fontSize = `${this.realPos.height * 0.2}px`;
    } else {
      this.element.style.fontSize = `${this.realPos.height * 0.5}px`;
    }
    if (!this.pos.show) {
      this.element.classList.add("button-hide");
    } else {
      this.element.classList.remove("button-hide");
    }
    if (this.elementShade !== null) {
      this.elementShade.style.left = `${this.realPos.x}px`;
      this.elementShade.style.top = `${this.realPos.y}px`;
      this.elementShade.style.width = `${this.realPos.width}px`;
      this.elementShade.style.height = `${this.realPos.height}px`;
      if (!this.pos.show) {
        this.elementShade.classList.add("button-hide");
      } else {
        this.elementShade.classList.remove("button-hide");
      }
    }
  }
}

const defaultPosTable: ButtonPosTable = {
  LB: { x: 10.448151034313028, y: 26.967594358656143, scale: 20, show: true },
  RB: { x: 89.75288216002276, y: 20.48611111111111, scale: 20, show: true },
  LT: { x: 1.9659750517987205, y: 74.76852072609796, scale: 20, show: false },
  RT: { x: 10.05092821629621, y: 98.49537346098158, scale: 20, show: false },
  LS: { x: 25.046210008783582, y: 19.742057310841094, scale: 20, show: true },
  up: { x: 26.160016374861247, y: 55.45634744028566, scale: 20, show: true },
  down: { x: 26.04363831208012, y: 88.6573968110261, scale: 20, show: true },
  left: { x: 19.646652660405252, y: 71.89153085940724, scale: 20, show: true },
  right: { x: 32.638172557906465, y: 72.33795236658165, scale: 20, show: true },
  RS: { x: 62.30258743381299, y: 62.516539689725036, scale: 20, show: true },
  A: { x: 72.96207905613684, y: 39.533730158730194, scale: 20, show: true },
  B: { x: 79.04724703990307, y: 24.239411808195566, scale: 20, show: true },
  X: { x: 67.44732718216946, y: 24.999992935745812, scale: 20, show: true },
  Y: { x: 73.01095713556357, y: 9.259263674418131, scale: 20, show: true },
  back: { x: 60.16938081538901, y: 2.5132292792910564, scale: 20, show: true },
  start: { x: 37.01578569925944, y: 2.2652120817275287, scale: 20, show: true },
  guide: { x: 48.66870774800849, y: 13.88888888888889, scale: 20, show: true },
  LTb: { x: 14.329976765687192, y: 2.4801490168092113, scale: 20, show: true },
  RTb: { x: 85.03412443424894, y: 0, scale: 20, show: true },
  LSb: { x: 32.3376019343543, y: 32.77116225510048, scale: 20, show: true },
  RSb: { x: 74.44554161671081, y: 72.13955026455025, scale: 20, show: true },
  M1: { x: 88.69142508865353, y: 98.26388888888889, scale: 20, show: false },
  M2: { x: 78.3247338679961, y: 98.2638782925076, scale: 20, show: false },
  M3: { x: 97.32023313018686, y: 44.19642857142857, scale: 20, show: false },
  M4: { x: 98.19819530416518, y: 70.43650970257146, scale: 20, show: false },
  fullscreen: { x: 100, y: 100, scale: 20, show: true },
  record: {
    x: 43.31258282981342,
    y: 75.97552203627492,
    scale: 20,
    show: false,
  },
  turbo: {
    x: 52.822641867929505,
    y: 75.95899294293118,
    scale: 20,
    show: false,
  },
  "speed-": {
    x: 42.9872910289067,
    y: 98.61108991834853,
    scale: 20,
    show: false,
  },
  "speed+": {
    x: 52.6317061812778,
    y: 99.18982187906902,
    scale: 20,
    show: false,
  },
  status: {
    x: 48.611964318465326,
    y: 44.427910052910065,
    scale: 20,
    show: true,
  },
  settings: { x: 100, y: 0, scale: 20, show: true },
  edit: { x: 65.33902033972704, y: 100, scale: 20, show: true },
};

function initGamepad() {
  const wsprotocol = document.location.protocol === "https:" ? "wss" : "ws";
  const PATH = document.location.host + document.location.pathname;
  const vgamepad: VGamepad = new VGamepad(
    document.body,
    `${wsprotocol}://${PATH}websocket`,
  );
  // @ts-ignore
  window.vgamepad = vgamepad;
  const posTableString = localStorage.getItem("buttonPosTable");
  let posTable: ButtonPosTable = {};
  const defaultPos: ButtonPos = { x: 50, y: 50, scale: 20, show: true };
  let posTableJson: any = null;
  if (posTableString) {
    try {
      posTableJson = JSON.parse(posTableString);
    } catch (e) {
      console.error(e);
    }
  }
  for (const symbol of Object.keys(buttonDefTable)) {
    let posTableR = posTableJson?.[symbol];
    let defaultP = defaultPosTable[symbol] ?? defaultPos;
    posTable[symbol] = {
      x: posTableR?.x ?? defaultP.x,
      y: posTableR?.y ?? defaultP.y,
      scale: posTableR?.scale ?? defaultP.scale,
      show: posTableR?.show ?? defaultP.show,
    };
  }
  for (const [symbol, def] of Object.entries(buttonDefTable)) {
    const button = new VGamepadButton(
      vgamepad,
      symbol,
      def,
      posTable[symbol] ?? defaultPos,
    );
    vgamepad.buttons[symbol] = button;
  }
  window.addEventListener("resize", () => {
    vgamepad.updateButtons();
  });
}
window.addEventListener("load", initGamepad);
