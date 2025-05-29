var commandId = 1;
var commandList = [];
var commandScheduled = false;
var mainWebsocket = null;
var mainWebsocketColor = "#808080";
var vibratePower = 0;
var peakVibratePower = 0;
var macroDown = false;
var macroStr = "";
var macroSteps = [];
var macroIndex = 0;
var macroTime = null;
var buttonPressed = {};
var textToButtonTable = {};
function log(x) {
    command("L ".concat(JSON.stringify(x)));
}
function command(x) {
    commandList.push("".concat(commandId++, " ").concat(x));
    if (!commandScheduled) {
        commandScheduled = true;
        setTimeout(function () {
            if (mainWebsocket !== null) {
                mainWebsocket.send(commandList.join("\n"));
                commandList = [];
            }
            commandScheduled = false;
        }, 16);
    }
}
var turboButtons = {
    "A:": { enabled: false, timer: null },
    "B:": { enabled: false, timer: null },
    "X:": { enabled: false, timer: null },
    "Y:": { enabled: false, timer: null },
};
function createButton(mode, label, name, symbol, top, left, height, width) {
    var tagname = "button";
    var Tracker = function (down, x, y) { };
    var TrackerUp = function () { };
    var TrackerDown = function () { };
    var OnInput = function () { };
    switch (mode) {
        case "button":
            {
                TrackerUp = function () {
                    buttonUp(symbol);
                };
                TrackerDown = function () {
                    buttonDown(symbol);
                };
            }
            break;
        case "stick":
            {
                Tracker = function (down, x, y) {
                    // log(`${x}, ${y}`);
                    if (down) {
                        x = 2 * x - 1;
                        y = -(2 * y - 1);
                        x *= 1.5;
                        y *= 1.5;
                        var d = Math.sqrt(x * x + y * y);
                        if (d > 1) {
                            x /= d;
                            y /= d;
                            d = 1;
                        }
                    }
                    else {
                        x = 0;
                        y = 0;
                    }
                    command("".concat(name, " ").concat(x, " ").concat(y));
                };
            }
            break;
        case "trigger":
            Tracker = function (down, x, y) {
                if (down) {
                    y = 1.5 * y;
                    if (y > 1) {
                        y = 1;
                    }
                }
                else {
                    y = 0;
                }
                command("".concat(name, " ").concat(y));
            };
            break;
        case "fullscreen":
            TrackerDown = function () {
                toggleFullScreen();
            };
            break;
        case "turbo":
            TrackerDown = function () {
                toggleButtonRepeat(name[0] + ":");
            };
            break;
        case "input":
            tagname = "input";
            OnInput = function () {
                var val = button.value.trim();
                macroSteps = val.split(/\s+/).filter(function (s) { return s && s !== " "; });
                macroStr = macroSteps.join(" ");
            };
            break;
        case "macro":
            TrackerDown = function () {
                if (macroTime === null) {
                    if (macroStr !== "") {
                        macroIndex = 0;
                        macroDown = false;
                        macroTime = setInterval(macroLoop, 100);
                    }
                }
                else {
                    clearInterval(macroTime);
                    if (macroDown) {
                        buttonUp(macroSteps[macroIndex]);
                    }
                    macroTime = null;
                }
                updateButtonColor();
            };
            break;
    }
    var button = document.createElement(tagname);
    button.classList.add("button");
    button.classList.add("button-".concat(mode));
    button.textContent = label;
    button.style.top = "".concat(top, "px");
    button.style.left = "".concat(left, "px");
    button.style.height = "".concat(height, "px");
    button.style.width = "".concat(width, "px");
    if (button instanceof HTMLButtonElement) {
        var oldDown_1 = false;
        var TrackerRawPos_1 = function (down, x, y) {
            if (down != oldDown_1) {
                if (down) {
                    button.classList.add("button-down");
                    TrackerDown();
                }
                else {
                    button.classList.remove("button-down");
                    TrackerUp();
                }
                oldDown_1 = down;
            }
            Tracker(down, (x - left) / width, (y - top) / height);
        };
        var mouseMoveTracker_1 = function (ev) {
            TrackerRawPos_1(true, ev.clientX, ev.clientY);
            ev.preventDefault();
            ev.stopPropagation();
        };
        var mouseUpTracker_1 = function (ev) {
            TrackerRawPos_1(false, ev.clientX, ev.clientY);
            window.removeEventListener("mousemove", mouseMoveTracker_1);
            window.removeEventListener("mouseup", mouseUpTracker_1);
            ev.preventDefault();
            ev.stopPropagation();
        };
        var touchTracker = function (ev) {
            if (ev.targetTouches.length == 0) {
                TrackerRawPos_1(false, 0, 0);
            }
            else {
                var x = 0;
                var y = 0;
                var n = 0;
                for (var i = 0; i < ev.targetTouches.length; i++) {
                    var touch = ev.targetTouches[i];
                    x += touch.clientX;
                    y += touch.clientY;
                    n += 1;
                }
                TrackerRawPos_1(true, x / n, y / n);
            }
            ev.preventDefault();
            ev.stopPropagation();
        };
        button.addEventListener("mousedown", function (ev) {
            TrackerRawPos_1(true, ev.clientX, ev.clientY);
            window.addEventListener("mousemove", mouseMoveTracker_1);
            window.addEventListener("mouseup", mouseUpTracker_1);
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
function createGridLine(left, top, height, width) {
    var gridline = document.createElement("span");
    gridline.classList.add("gridline");
    gridline.style.top = "".concat(top, "px");
    gridline.style.left = "".concat(left, "px");
    gridline.style.height = "".concat(height, "px");
    gridline.style.width = "".concat(width, "px");
    document.body.appendChild(gridline);
    return gridline;
}
var oldViberatePower = 0;
var oldViberateCount = 0;
function vibration() {
    var a = [];
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
    }
    else {
        var fixedPower = 1.0 - (1.0 - peakVibratePower) * 0.6;
        var d = 0;
        for (var i = 0; i < 50; i++) {
            d += 10 * fixedPower;
            var p = Math.floor(d);
            d -= p;
            if (p > 10) {
                p = 10;
            }
            a.push(p);
            a.push(10 - p);
        } // 50*10=500ms
        for (var i = 1; i < a.length - 1; i++) {
            if (a[i] == 0) {
                a[i - 1] += a[i + 1];
                a.splice(i, 2);
                i--;
            }
        }
    }
    // log(`peak: ${peakVibratePower}`);
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
var buttonmap = [
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
    "                          IN                      MA                        []  ",
    "                                                                                ",
];
var buttonTable = [
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
    ["A~", "[A]", "A", "turbo", 3],
    ["B~", "[B]", "B", "turbo", 3],
    ["X~", "[X]", "X", "turbo", 3],
    ["Y~", "[Y]", "Y", "turbo", 3],
    ["IN", "", "", "input", 3],
    ["MA", "▶", "", "macro", 3],
];
var buttonNamed = {};
function reload() {
    if (document.activeElement instanceof HTMLInputElement) {
        // Don't reload while typing
        return;
    }
    document.querySelectorAll(".button").forEach(function (element) {
        element.remove();
    });
    document.querySelectorAll(".gridline").forEach(function (element) {
        element.remove();
    });
    var vw = document.body.clientWidth;
    var vh = document.body.clientHeight;
    var mapHeight = buttonmap.length;
    var mapWidth = buttonmap[0].length / 2;
    var buttonHeight = vw / mapWidth;
    var buttonWidth = vh / mapHeight;
    var buttonA = Math.min(buttonHeight, buttonWidth);
    var buttonXoffset = (vw - buttonA * mapWidth) / 2;
    var buttonYoffset = (vh - buttonA * mapHeight) / 2;
    // lines
    for (var i = 0; i <= mapHeight; i++) {
        createGridLine(buttonXoffset, buttonYoffset + i * buttonA, 0, mapWidth * buttonA);
    }
    for (var j = 0; j <= mapWidth; j++) {
        createGridLine(buttonXoffset + j * buttonA, buttonYoffset, mapHeight * buttonA, 0);
    }
    // buttons
    for (var i = 0; i < buttonmap.length; i++) {
        for (var j = 0; j < buttonmap[i].length / 2; j++) {
            var symb = buttonmap[i].slice(j * 2, j * 2 + 2);
            if (symb == "  ") {
                continue;
            }
            var buttonX = buttonXoffset + j * buttonA + buttonA / 2;
            var buttonY = buttonYoffset + i * buttonA + buttonA / 2;
            for (var k = 0; k < buttonTable.length; k++) {
                var _a = buttonTable[k], symbol = _a[0], label = _a[1], name_1 = _a[2], mode = _a[3], size = _a[4];
                if (symbol == symb) {
                    buttonNamed[symbol] = createButton(mode, label, name_1, symbol, buttonY - (size * buttonA) / 2, buttonX - (size * buttonA) / 2, size * buttonA, mode == "input" ? size * 4 * buttonA : size * buttonA);
                    if (mode == "button" || mode == "trigger") {
                        textToButtonTable[symbol.toUpperCase()] = buttonTable[k];
                        textToButtonTable[label.toUpperCase()] = buttonTable[k];
                    }
                }
            }
        }
    }
    textToButtonTable["UP"] = textToButtonTable["DU"];
    textToButtonTable["DOWN"] = textToButtonTable["DD"];
    textToButtonTable["LEFT"] = textToButtonTable["DL"];
    textToButtonTable["RIGHT"] = textToButtonTable["DR"];
    textToButtonTable["^"] = textToButtonTable["DU"];
    textToButtonTable["v"] = textToButtonTable["DD"];
    textToButtonTable["<"] = textToButtonTable["DL"];
    textToButtonTable[">"] = textToButtonTable["DR"];
    updateButtonColor();
}
function wsConnect() {
    var cwd = window.location.host + window.location.pathname;
    var nextWebsocket = new WebSocket("ws://".concat(cwd, "websocket"));
    mainWebsocketColor = "#F0F080";
    updateButtonColor();
    nextWebsocket.addEventListener("open", function (event) {
        mainWebsocket = null;
        mainWebsocket = nextWebsocket;
        mainWebsocketColor = "#80FF80";
        updateButtonColor();
    });
    nextWebsocket.addEventListener("error", function (event) {
        console.error(event);
        mainWebsocket = null;
        mainWebsocketColor = "#FF8080";
        updateButtonColor();
    });
    nextWebsocket.addEventListener("close", function (event) {
        console.error("mainWebsocket closed");
        mainWebsocket = null;
        mainWebsocketColor = "#FF8080";
        updateButtonColor();
        setTimeout(wsConnect, 1000);
    });
    nextWebsocket.addEventListener("message", function (event) {
        var msg = event.data;
        if (typeof msg == "string") {
            var args = msg.split(" ");
            if (args[0] == "vibrate") {
                vibratePower = Number(args[1]);
                if (vibratePower > peakVibratePower) {
                    peakVibratePower = vibratePower;
                }
            }
            else {
                console.warn("Unknown command ".concat(msg));
            }
        }
    });
}
function toggleButtonRepeat(symbol) {
    var buttonState = turboButtons[symbol];
    if (buttonState.timer !== null) {
        clearTimeout(buttonState.timer);
        buttonState.timer = null;
        buttonUp(symbol);
    }
    buttonState.enabled = !buttonState.enabled;
    if (buttonState.enabled) {
        turboButtonDown(symbol);
    }
    updateButtonColor();
}
function buttonDown(text) {
    var button = textToButtonTable[text.toUpperCase()];
    if (button) {
        var symbol = button[0];
        var name_2 = button[2];
        var mode = button[3];
        if (mode == "button") {
            command("bdown ".concat(name_2));
        }
        else if (mode == "trigger") {
            command("".concat(name_2, " 1"));
        }
        else {
            console.warn("Unable to down button ".concat(text));
        }
        buttonPressed[symbol] = true;
        updateButtonColor();
    }
    else {
        console.warn("Unknown button ".concat(text));
    }
}
function buttonUp(text) {
    var button = textToButtonTable[text.toUpperCase()];
    if (button) {
        var symbol = button[0];
        var name_3 = button[2];
        var mode = button[3];
        if (mode == "button") {
            command("bup ".concat(name_3));
        }
        else if (mode == "trigger") {
            command("".concat(name_3, " 0"));
        }
        else {
            console.warn("Unable to up button ".concat(text));
        }
        buttonPressed[symbol] = false;
        updateButtonColor();
    }
    else {
        console.warn("Unknown button ".concat(text));
    }
}
function turboButtonDown(symbol) {
    buttonDown(symbol);
    var buttonState = turboButtons[symbol];
    buttonState.timer = setTimeout(function () { return turboButtonUp(symbol); }, 100);
}
function turboButtonUp(symbol) {
    buttonUp(symbol);
    var buttonState = turboButtons[symbol];
    buttonState.timer = setTimeout(function () { return turboButtonDown(symbol); }, 100);
}
function macroLoop() {
    if (macroIndex >= macroSteps.length) {
        macroIndex = 0;
    }
    var step = macroSteps[macroIndex];
    if (macroDown) {
        if (step !== ".") {
            buttonUp(step);
        }
        macroIndex++;
        macroDown = false;
    }
    else {
        if (step !== ".") {
            buttonDown(step);
        }
        macroDown = true;
    }
}
function updateButtonColor() {
    buttonNamed["GU"].style.backgroundColor = mainWebsocketColor;
    Object.keys(buttonNamed).forEach(function (sym) {
        var button = buttonNamed[sym];
        if (sym[1] == "~") {
            // turbo button
            var tsym = sym[0] + ":";
            if (turboButtons[tsym].enabled) {
                button.classList.add("button-locked");
            }
            else {
                button.classList.remove("button-locked");
            }
        }
        if (buttonPressed[sym]) {
            button.classList.add("button-pressed");
        }
        else {
            button.classList.remove("button-pressed");
        }
    });
    var bMA = buttonNamed["MA"];
    var bIN = buttonNamed["IN"];
    if (bIN instanceof HTMLInputElement) {
        if (macroTime === null) {
            bMA.classList.remove("button-locked");
            bIN.disabled = false;
        }
        else {
            bMA.classList.add("button-locked");
            bIN.disabled = true;
        }
        bIN.value = macroStr;
    }
}
window.addEventListener("load", function () {
    reload();
    vibration();
    wsConnect();
});
window.addEventListener("resize", reload);
window.addEventListener("contextmenu", function (event) {
    event.stopPropagation();
    event.preventDefault();
});
command("reset");
function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    }
    else if (document.exitFullscreen) {
        document.exitFullscreen();
    }
}
