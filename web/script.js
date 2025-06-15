"use strict";
var buttonDefTable = {
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
var ds4Labels = {
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
var Vibration = /** @class */ (function () {
    function Vibration() {
        this.oldViberatePower = 0;
        this.oldViberateCount = 0;
        this.vibratePower = 0;
        this.peakVibratePower = 0;
        this.interval = null;
    }
    Vibration.prototype.vibration = function () {
        var _a;
        var a = [];
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
        var minunit = 5;
        var tot = 100;
        var totOn = 0;
        var totOff = 0;
        var fixedPower = 1.0 - (1.0 - this.peakVibratePower) * 0.7;
        if (fixedPower >= 1) {
            a.push(tot);
        }
        else if (fixedPower <= 0) {
            // pass
        }
        else {
            while (totOn + totOff < tot) {
                if (fixedPower > 0.5) {
                    totOff += minunit;
                    var on = Math.floor((totOff * fixedPower) / (1 - fixedPower) - totOn + 0.5);
                    a.push(on);
                    a.push(minunit);
                    totOn += on;
                }
                else {
                    totOn += minunit;
                    var off = Math.floor((totOn * (1 - fixedPower)) / fixedPower - totOff + 0.5);
                    a.push(minunit);
                    a.push(off);
                    totOff += off;
                }
            }
        }
        // console.log(`peak: ${this.vibratePower} a: ${a}`);
        (_a = navigator.vibrate) === null || _a === void 0 ? void 0 : _a.call(navigator, a);
        this.oldViberatePower = this.peakVibratePower;
        this.oldViberateCount = 0;
        this.peakVibratePower = this.vibratePower;
    };
    Vibration.prototype.start = function () {
        if (this.interval === null) {
            this.interval = setInterval(this.vibration.bind(this), 10);
        }
    };
    Vibration.prototype.stop = function () {
        if (this.interval !== null) {
            clearInterval(this.interval);
            this.interval = null;
        }
    };
    return Vibration;
}());
var Latency = /** @class */ (function () {
    function Latency(gamepad, waitms) {
        if (waitms === void 0) { waitms = 1000; }
        this.gamepad = gamepad;
        this.waitms = waitms;
        this.latency = null;
        this.callback = null;
        this.running = false;
        this.timeout = null;
    }
    Latency.prototype.start = function () {
        this.running = true;
        this.timeout = setTimeout(this.ping.bind(this), this.waitms);
    };
    Latency.prototype.stop = function () {
        this.running = false;
        if (this.timeout !== null) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    };
    Latency.prototype.ping = function () {
        var _this = this;
        if (this.gamepad.websocket === null) {
            this.latency = null;
            this.gamepad.updateButtons();
        }
        else {
            this.gamepad.websocket.send("ping");
            var start_1 = new Date().getTime();
            new Promise(function (resolve, reject) {
                _this.callback = function () {
                    resolve();
                };
                _this.timeout = setTimeout(reject, _this.waitms);
            })
                .then(function (value) {
                _this.callback = null;
                var stop = new Date().getTime();
                _this.latency = stop - start_1;
                _this.gamepad.updateButtons();
                if (_this.timeout !== null) {
                    clearTimeout(_this.timeout);
                }
                _this.timeout = setTimeout(_this.ping.bind(_this), _this.waitms);
            })
                .catch(function () {
                _this.callback = null;
                _this.latency = null;
                _this.gamepad.updateButtons();
                _this.timeout = setTimeout(_this.ping.bind(_this), _this.waitms);
            });
        }
    };
    Latency.prototype.onPong = function () {
        if (this.callback !== null) {
            this.callback();
        }
    };
    return Latency;
}());
var nosleep = new NoSleep();
function toggleFullScreen() {
    var _a, _b, _c, _d;
    if (!document.fullscreenElement) {
        (_b = (_a = document.documentElement).requestFullscreen) === null || _b === void 0 ? void 0 : _b.call(_a);
        try {
            // @ts-ignore
            (_d = (_c = screen === null || screen === void 0 ? void 0 : screen.orientation) === null || _c === void 0 ? void 0 : _c.lock) === null || _d === void 0 ? void 0 : _d.call(_c, "landscape");
        }
        catch (e) {
            console.warn(e);
        }
        try {
            nosleep.enable();
        }
        catch (e) {
            console.warn(e);
        }
    }
    else if (document.exitFullscreen) {
        document.exitFullscreen();
        try {
            nosleep.disable();
        }
        catch (e) {
            console.warn(e);
        }
    }
}
function defaultMode(def, symbol) {
    switch (def.shape) {
        case "button":
            return { mode: "press", name: symbol };
        case "stick":
            return { mode: "stick", name: symbol };
        case "trigger":
            return { mode: "trigger", name: symbol };
        default:
            throw new Error("Unable to derive mode for ".concat(symbol));
    }
}
function addTouchListeners(button, touchCallback) {
    // mouse
    function onMouseMove(ev) {
        touchCallback(true, ev.clientX, ev.clientY);
        ev.stopPropagation();
        ev.preventDefault();
    }
    function onMouseUp(ev) {
        touchCallback(false, ev.clientX, ev.clientY);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        ev.stopPropagation();
        ev.preventDefault();
    }
    function onMouseDown(ev) {
        touchCallback(true, ev.clientX, ev.clientY);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        ev.stopPropagation();
        ev.preventDefault();
    }
    button.addEventListener("mousedown", onMouseDown);
    // Touch
    function onTouchChange(ev) {
        if (ev.targetTouches.length === 0) {
            button.classList.remove("button-touchdown");
            touchCallback(false, 0, 0);
        }
        else {
            button.classList.add("button-touchdown");
            var x = 0, y = 0, n = ev.targetTouches.length;
            for (var i = 0; i < n; i++) {
                var touch = ev.targetTouches.item(i);
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
var VGamepad = /** @class */ (function () {
    function VGamepad(parent, serverLink) {
        this.serverLink = serverLink;
        this.mode = "xbox";
        this.state = {};
        this.state_out = {};
        this.editMode = false;
        this.buttons = {};
        this.websocket = null;
        this.websocketOpening = false;
        this.element = document.createElement("div");
        this.element.classList.add("gamepad");
        parent.appendChild(this.element);
        this.latency = new Latency(this);
        this.vibration = new Vibration();
        this.connect();
        this.latency.start();
        this.vibration.start();
    }
    VGamepad.prototype.updateButtons = function () {
        var _a, _b;
        for (var _i = 0, _c = Object.values(this.buttons); _i < _c.length; _i++) {
            var btn = _c[_i];
            btn.posToRealPos();
            btn.updateButton();
        }
        var status = (_a = this.buttons.status) === null || _a === void 0 ? void 0 : _a.element;
        if (status !== undefined) {
            status.textContent = "id:".concat((_b = this.state_out.session_id) !== null && _b !== void 0 ? _b : 0, "\n").concat(this.latency.latency, "ms\nvib:").concat(Math.floor(this.vibration.peakVibratePower * 100));
        }
    };
    VGamepad.prototype.setEditMode = function (editMode) {
        this.editMode = editMode;
        if (editMode) {
            this.element.classList.add("gamepad-edit");
        }
        else {
            this.element.classList.remove("gamepad-edit");
        }
        this.updateButtons();
    };
    VGamepad.prototype.savePosTable = function () {
        var totalPos = {};
        for (var _i = 0, _a = Object.entries(this.buttons); _i < _a.length; _i++) {
            var _b = _a[_i], symbol = _b[0], btn = _b[1];
            totalPos[symbol] = btn.pos;
        }
        localStorage.setItem("buttonPosTable", JSON.stringify(totalPos));
    };
    VGamepad.prototype.setState = function (name, value) {
        if (this.state[name] != value) {
            if (this.websocket !== null && !this.websocketOpening) {
                this.websocket.send("set ".concat(name, " ").concat(value));
            }
            this.state[name] = value;
        }
    };
    VGamepad.prototype.connect = function () {
        var _this = this;
        this.websocket = new WebSocket(this.serverLink);
        this.websocketOpening = true;
        this.websocket.addEventListener("open", function () {
            _this.websocketOpening = false;
            _this.wsOpen();
        });
        this.websocket.addEventListener("message", function (ev) {
            _this.wsMessage(ev.data);
        });
        this.websocket.addEventListener("error", function (ev) {
            console.error(ev);
        });
        this.websocket.addEventListener("close", function () {
            if (_this.websocket === null) {
                console.error("Websocket not ready");
                return;
            }
            _this.websocket = null;
            _this.websocketOpening = false;
            _this.wsClose();
            // retry
            setTimeout(function () {
                _this.connect();
            }, 1000);
        });
    };
    VGamepad.prototype.wsOpen = function () {
        if (this.websocket === null || this.websocketOpening) {
            console.error("Websocket not ready");
            return;
        }
        this.websocket.send("mode ".concat(this.mode));
        var init_str = "set";
        for (var _i = 0, _a = Object.entries(this.state); _i < _a.length; _i++) {
            var _b = _a[_i], name_1 = _b[0], value = _b[1];
            init_str += " ".concat(name_1, " ").concat(value);
        }
        this.websocket.send(init_str);
    };
    VGamepad.prototype.wsMessage = function (msg) {
        var _a, _b;
        var args = msg.split(" ");
        if (args[0] === "set") {
            for (var i = 1; i + 1 < args.length; i += 2) {
                this.state_out[args[i]] = parseFloat(args[i + 1]);
                if (args[i] === "large_motor" || args[i] === "small_motor") {
                    this.vibration.vibratePower = Math.max((_a = this.state_out.large_motor) !== null && _a !== void 0 ? _a : 0, (_b = this.state_out.small_motor) !== null && _b !== void 0 ? _b : 0);
                }
                if (args[i] === "led_number") {
                    this.updateButtons();
                }
            }
        }
        else if (args[0] === "pong") {
            this.latency.onPong();
        }
    };
    VGamepad.prototype.wsClose = function () { };
    return VGamepad;
}());
var VGamepadButton = /** @class */ (function () {
    function VGamepadButton(gamepad, symbol, def, pos) {
        var _a;
        this.gamepad = gamepad;
        this.symbol = symbol;
        this.def = def;
        this.pos = pos;
        this.realPos = { x: 0, y: 0, width: 0, height: 0, offsetX: 0, offsetY: 0 }; // 屏幕上的实际位置和大小
        this.editMode = {
            offsetX: 0,
            offsetY: 0,
            previousTime: 0,
            previousX: 0,
            previousY: 0,
            moved: false,
        };
        this.stickDrag = { offsetX: 0, offsetY: 0 };
        this.prevDown = false;
        this.elementShade = null;
        this.mode = (_a = def.mode) !== null && _a !== void 0 ? _a : defaultMode(def, symbol);
        this.element = document.createElement("button");
        this.element.textContent = this.def.label;
        this.element.classList.add("button", "button-".concat(this.symbol), "button-".concat(this.def.shape));
        addTouchListeners(this.element, this.touchCallback.bind(this));
        if (this.def.shape == "stick" || this.def.shape == "trigger") {
            this.elementShade = document.createElement("div");
            this.elementShade.classList.add("buttonshade", "buttonshade-".concat(this.symbol), "buttonshade-".concat(this.def.shape));
            this.gamepad.element.appendChild(this.elementShade);
        }
        this.gamepad.element.appendChild(this.element);
        this.posToRealPos();
        this.updateButton();
    }
    VGamepadButton.prototype.touchCallbackEditmode = function (down, clientX, clientY) {
        if (this.prevDown) {
            if (down) {
                var dragX = clientX - this.editMode.previousX;
                var dragY = clientY - this.editMode.previousY;
                if (Math.abs(dragX) > 5 || Math.abs(dragY) > 5) {
                    this.editMode.moved = true;
                }
                this.realPos.x = clientX - this.editMode.offsetX;
                this.realPos.y = clientY - this.editMode.offsetY;
            }
            else {
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
                var currentTime = new Date().getTime();
                if (currentTime - this.editMode.previousTime > 500) {
                    this.editMode.moved = true;
                }
                if (!this.editMode.moved) {
                    if (this.mode.mode == "edit") {
                        this.gamepad.setEditMode(false);
                        this.gamepad.savePosTable();
                    }
                    else {
                        this.pos.show = !this.pos.show;
                    }
                }
            }
            this.updateButton();
        }
        else {
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
    };
    VGamepadButton.prototype.touchCallback = function (down, clientX, clientY) {
        var _a;
        if (this.gamepad.editMode) {
            this.touchCallbackEditmode(down, clientX, clientY);
            this.prevDown = down;
            return;
        }
        if (down) {
            this.element.classList.add("button-touchdown");
        }
        else {
            this.element.classList.remove("button-touchdown");
        }
        switch (this.mode.mode) {
            case "press":
                this.gamepad.setState(this.mode.name, down ? 1 : 0);
                break;
            case "trigger":
                {
                    var sy = 0;
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
                    var sx = 0, sy = 0;
                    if (down) {
                        if (!this.prevDown) {
                            // this.realPos.x for fix position
                            this.stickDrag.offsetX = clientX;
                            this.stickDrag.offsetY = clientY;
                        }
                        sx = ((clientX - this.stickDrag.offsetX) / this.realPos.width) * 2;
                        sy =
                            (-(clientY - this.stickDrag.offsetY) / this.realPos.height) * 2;
                        var d = Math.sqrt(sx * sx + sy * sy);
                        if (d > 1) {
                            sx /= d;
                            sy /= d;
                        }
                    }
                    this.gamepad.setState("".concat(this.mode.name, "x"), down ? sx : 0);
                    this.gamepad.setState("".concat(this.mode.name, "y"), down ? sy : 0);
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
                // if (this.gamepad.recordState == 'select') {
                // if (down && !this.prevDown) {
                //   recordTarget=this.def.mode.id
                //   record
                // }
                // } else if (...recordState == 'none') {
                //   sendMacro(this.mode.id);
                break;
            case "record":
                // if (down &&!this.prevDown) {
                // } else if (...recordState == 'none') {
                // select
                // if (this.gamepad.recordState == 'select') {
                // }
                break;
            case "turbo":
                // if (down &&!this.prevDown) {
                //   sendMacro(this.mode.id);
                //   gamepad.turboMode
                // }else{
                // turbomode...
                //}
                break;
            case "speed":
                // if (down &&!this.prevDown) {
                //   sendMacro(this.mode.id);
                //   gamepad.macroSpeed
                // }
                break;
            case "status":
                // No need to interact
                break;
            case "settings":
                if (down && !this.prevDown) {
                    prompt("copy settings", (_a = localStorage.getItem("buttonPosTable")) !== null && _a !== void 0 ? _a : "{}");
                    if (confirm("Reset settings?")) {
                        localStorage.clear();
                        window.location.reload();
                    }
                }
                break;
        }
        this.prevDown = down;
    };
    VGamepadButton.prototype.posToRealPos = function () {
        var height = this.gamepad.element.clientHeight;
        var width = this.gamepad.element.clientWidth;
        // assume height > width
        var scale = (Math.min(height, width) * this.pos.scale) / 100;
        var x = (this.pos.x * (width - scale)) / 100;
        var y = (this.pos.y * (height - scale)) / 100;
        this.realPos.x = x;
        this.realPos.y = y;
        this.realPos.width = scale;
        this.realPos.height = scale;
    };
    VGamepadButton.prototype.realPosToPos = function () {
        var height = this.gamepad.element.clientHeight;
        var width = this.gamepad.element.clientWidth;
        // assume height > width
        var scale = (Math.min(height, width) * this.pos.scale) / 100;
        var x = (this.realPos.x * 100) / (width - scale);
        var y = (this.realPos.y * 100) / (height - scale);
        this.pos.x = x;
        this.pos.y = y;
    };
    VGamepadButton.prototype.updateButton = function () {
        this.element.style.left = "".concat(this.realPos.x + this.realPos.offsetX, "px");
        this.element.style.top = "".concat(this.realPos.y + this.realPos.offsetY, "px");
        this.element.style.width = "".concat(this.realPos.width, "px");
        this.element.style.height = "".concat(this.realPos.height, "px");
        if (this.mode.mode == "status") {
            this.element.style.fontSize = "".concat(this.realPos.height * 0.2, "px");
        }
        else {
            this.element.style.fontSize = "".concat(this.realPos.height * 0.5, "px");
        }
        if (!this.pos.show) {
            this.element.classList.add("button-hide");
        }
        else {
            this.element.classList.remove("button-hide");
        }
        if (this.elementShade !== null) {
            this.elementShade.style.left = "".concat(this.realPos.x, "px");
            this.elementShade.style.top = "".concat(this.realPos.y, "px");
            this.elementShade.style.width = "".concat(this.realPos.width, "px");
            this.elementShade.style.height = "".concat(this.realPos.height, "px");
            if (!this.pos.show) {
                this.elementShade.classList.add("button-hide");
            }
            else {
                this.elementShade.classList.remove("button-hide");
            }
        }
    };
    return VGamepadButton;
}());
var defaultPosTable = {
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
    var _a, _b, _c, _d, _e, _f, _g;
    var wsprotocol = document.location.protocol === "https:" ? "wss" : "ws";
    var PATH = document.location.host + document.location.pathname;
    var vgamepad = new VGamepad(document.body, "".concat(wsprotocol, "://").concat(PATH, "websocket"));
    // @ts-ignore
    window.vgamepad = vgamepad;
    var posTableString = localStorage.getItem("buttonPosTable");
    var posTable = {};
    var defaultPos = { x: 50, y: 50, scale: 20, show: true };
    var posTableJson = null;
    if (posTableString) {
        try {
            posTableJson = JSON.parse(posTableString);
        }
        catch (e) {
            console.error(e);
        }
    }
    for (var _i = 0, _h = Object.keys(buttonDefTable); _i < _h.length; _i++) {
        var symbol = _h[_i];
        var posTableR = posTableJson === null || posTableJson === void 0 ? void 0 : posTableJson[symbol];
        var defaultP = (_a = defaultPosTable[symbol]) !== null && _a !== void 0 ? _a : defaultPos;
        posTable[symbol] = {
            x: (_b = posTableR === null || posTableR === void 0 ? void 0 : posTableR.x) !== null && _b !== void 0 ? _b : defaultP.x,
            y: (_c = posTableR === null || posTableR === void 0 ? void 0 : posTableR.y) !== null && _c !== void 0 ? _c : defaultP.y,
            scale: (_d = posTableR === null || posTableR === void 0 ? void 0 : posTableR.scale) !== null && _d !== void 0 ? _d : defaultP.scale,
            show: (_e = posTableR === null || posTableR === void 0 ? void 0 : posTableR.show) !== null && _e !== void 0 ? _e : defaultP.show,
        };
    }
    for (var _j = 0, _k = Object.entries(buttonDefTable); _j < _k.length; _j++) {
        var _l = _k[_j], symbol = _l[0], def = _l[1];
        var def2 = def;
        if (vgamepad.mode == "ds4") {
            def2 = Object.assign({}, def, {
                label: (_f = ds4Labels[symbol]) !== null && _f !== void 0 ? _f : def.label,
            });
        }
        var button = new VGamepadButton(vgamepad, symbol, def2, (_g = posTable[symbol]) !== null && _g !== void 0 ? _g : defaultPos);
        vgamepad.buttons[symbol] = button;
    }
    window.addEventListener("resize", function () {
        vgamepad.updateButtons();
    });
}
window.addEventListener("load", initGamepad);
