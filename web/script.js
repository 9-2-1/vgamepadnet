var mainWebsocket = null;
var vibratePower = 0;
var peakVibratePower = 0;
var macroDown = false;
var macroStr = "";
var macroSteps = [];
var macroIndex = 0;
var macroTime = null;
var latencyTestCallback = null;
var latencyTestTimeout = 1000;
var latencyTestWait = 1000;
var latencyTestResults = [];
var latencyTestResultMax = 1;
var buttonPressed = {};
var textToSymbol = {};
function log(x) {
    command("L ".concat(JSON.stringify(x)));
}
function command(x) {
    if (mainWebsocket !== null) {
        mainWebsocket.send(x);
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
                    command("stick ".concat(name, " ").concat(x, " ").concat(y));
                };
            }
            break;
        case "trigger":
            {
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
                    command("trigger ".concat(name, " ").concat(y));
                };
            }
            break;
        case "fullscreen":
            {
                TrackerDown = function () {
                    toggleFullScreen();
                };
            }
            break;
        case "turbo":
            {
                TrackerDown = function () {
                    toggleButtonRepeat(symbol[0] + ":");
                };
            }
            break;
        case "macrobar":
            {
                tagname = "input";
                OnInput = function () {
                    var val = button.value.trim();
                    macroSteps = val.split(/\s+/).filter(function (s) { return s && s !== " "; });
                    macroStr = val;
                };
            }
            break;
        case "macroplay":
            {
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
    var button = document.createElement(tagname);
    button.classList.add("button");
    button.classList.add("button-".concat(mode));
    button.textContent = label;
    button.style.top = "".concat(top, "px");
    button.style.left = "".concat(left, "px");
    button.style.height = "".concat(height, "px");
    button.style.width = "".concat(width, "px");
    button.style.fontSize = "".concat(height * 0.5, "px");
    if (mode == "latency") {
        button.style.fontSize = "".concat(height * 0.3, "px");
    }
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
    var minunit = 5;
    var tot = 100;
    var totOn = 0;
    var totOff = 0;
    var fixedPower = 1.0 - (1.0 - peakVibratePower) * 0.7;
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
    // log(`peak: ${peakVibratePower} a: ${a}`);
    navigator === null || navigator === void 0 ? void 0 : navigator.vibrate(a);
    oldViberatePower = peakVibratePower;
    oldViberateCount = 0;
}
setInterval(vibration, 10);
var buttonmap = [
    "                                                                                ",
    "  LT                                  GU                                    RT  ",
    "              LS                                            Y:                  ",
    "                                                                                ",
    "  LB              L.                                    X:      B:          RB  ",
    "                              BA      MS      ST                                ",
    "                                                            A:                  ",
    "                                                                                ",
    "                          DU                          RS                        ",
    "                                                                    Y~          ",
    "                      DL      DR                  R.                            ",
    "                                                                X~      B~      ",
    "                          DD                                                    ",
    "                                                                    A~          ",
    "                                                                                ",
    "                                                                                ",
    "                          IN                      MA                        []  ",
    "                                                                                ",
];
function parseButtonTable(table) {
    var ret = {};
    for (var _i = 0, table_1 = table; _i < table_1.length; _i++) {
        var line = table_1[_i];
        var symbol = line[0], label = line[1], name_1 = line[2], mode = line[3], size = line[4];
        ret[symbol] = { label: label, name: name_1, mode: mode, size: size };
    }
    return ret;
}
var buttonTable = parseButtonTable([
    // [Symbol, Label, Name, Type, Size]
    ["A:", "A", "A", "button", 3],
    ["B:", "B", "B", "button", 3],
    ["X:", "X", "X", "button", 3],
    ["Y:", "Y", "Y", "button", 3],
    ["LS", "LS", "LS", "button", 3],
    ["RS", "RS", "RS", "button", 3],
    ["LB", "LB", "LB", "button", 3],
    ["RB", "RB", "RB", "button", 3],
    ["DU", "↑", "Up", "button", 3],
    ["DD", "↓", "Down", "button", 3],
    ["DL", "←", "Left", "button", 3],
    ["DR", "→", "Right", "button", 3],
    ["ST", "☰", "Start", "button", 3],
    ["BA", "❐", "Back", "button", 3],
    ["GU", "⭙", "Guide", "button", 3],
    ["L.", "L", "LS", "stick", 5],
    ["R.", "R", "RS", "stick", 5],
    ["LT", "LT", "LT", "trigger", 3],
    ["RT", "RT", "RT", "trigger", 3],
    ["[]", "⛶", "", "fullscreen", 3],
    ["A~", "A", "A", "turbo", 3],
    ["B~", "B", "B", "turbo", 3],
    ["X~", "X", "X", "turbo", 3],
    ["Y~", "Y", "Y", "turbo", 3],
    ["IN", "", "", "macrobar", 3],
    ["MA", "▶", "", "macroplay", 3],
    ["MS", "⏲", "", "latency", 3],
]);
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
            var symbol = buttonmap[i].slice(j * 2, j * 2 + 2);
            if (symbol == "  ") {
                continue;
            }
            var buttonX = buttonXoffset + j * buttonA + buttonA / 2;
            var buttonY = buttonYoffset + i * buttonA + buttonA / 2;
            var attr = buttonTable[symbol];
            if (attr) {
                buttonNamed[symbol] = createButton(attr.mode, attr.label, attr.name, symbol, buttonY - (attr.size * buttonA) / 2, buttonX - (attr.size * buttonA) / 2, attr.size * buttonA, attr.mode == "macrobar"
                    ? attr.size * 4 * buttonA
                    : attr.size * buttonA);
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
    var cwd = window.location.host + window.location.pathname;
    var nextWebsocket = new WebSocket("ws://".concat(cwd, "websocket"));
    nextWebsocket.addEventListener("open", function (event) {
        mainWebsocket = nextWebsocket;
        updateButtons();
    });
    nextWebsocket.addEventListener("error", function (event) {
        console.error(event);
        mainWebsocket = null;
        updateButtons();
    });
    nextWebsocket.addEventListener("close", function (event) {
        console.error("mainWebsocket closed");
        mainWebsocket = null;
        updateButtons();
        setTimeout(wsConnect, 5000);
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
            else if (args[0] == "pong") {
                if (latencyTestCallback !== null) {
                    latencyTestCallback(null);
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
    updateButtons();
}
function buttonDown(symbol) {
    var attr = buttonTable[symbol];
    if (attr) {
        if (attr.mode == "button") {
            command("button ".concat(attr.name, " 1"));
        }
        else if (attr.mode == "trigger") {
            command("trigger ".concat(attr.name, " 1"));
        }
        else {
            console.warn("Unable to down button ".concat(symbol));
        }
        buttonPressed[symbol] = true;
        updateButtons();
    }
    else {
        console.warn("Unknown button ".concat(symbol));
    }
}
function buttonUp(symbol) {
    var attr = buttonTable[symbol];
    if (attr) {
        if (attr.mode == "button") {
            command("button ".concat(attr.name, " 0"));
        }
        else if (attr.mode == "trigger") {
            command("trigger ".concat(attr.name, " 0"));
        }
        else {
            console.warn("Unable to down button ".concat(symbol));
        }
        buttonPressed[symbol] = false;
        updateButtons();
    }
    else {
        console.warn("Unknown button ".concat(symbol));
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
    }
    else {
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
    var latencyTestStart = new Date().getTime();
    new Promise(function (resolve, reject) {
        latencyTestCallback = resolve;
        setTimeout(reject, latencyTestTimeout);
    })
        .then(function () {
        latencyTestCallback = null;
        var latencyTestStop = new Date().getTime();
        latencyTestResults.push(latencyTestStop - latencyTestStart);
        if (latencyTestResults.length > latencyTestResultMax) {
            latencyTestResults.shift();
        }
        updateButtons();
        setTimeout(checkLatency, latencyTestWait);
    })
        .catch(function () {
        latencyTestCallback = null;
        latencyTestResults = [];
        updateButtons();
        setTimeout(checkLatency, latencyTestWait);
    });
}
function updateButtons() {
    var bMS = buttonNamed["MS"];
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
        }
        else {
            if (latencyTestResults.length == 0) {
                bMS.textContent = "?";
                bMS.classList.add("button-uncertain");
            }
            else {
                var sum = 0;
                for (var _i = 0, latencyTestResults_1 = latencyTestResults; _i < latencyTestResults_1.length; _i++) {
                    var v = latencyTestResults_1[_i];
                    sum += v;
                }
                sum = Math.floor(sum / latencyTestResults.length);
                bMS.textContent = "".concat(sum, "ms");
                if (sum < 50) {
                    bMS.classList.add("button-excellent");
                }
                else if (sum < 100) {
                    bMS.classList.add("button-good");
                }
                else if (sum < 200) {
                    bMS.classList.add("button-normal");
                }
                else {
                    bMS.classList.add("button-bad");
                }
            }
        }
    }
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
    checkLatency();
});
window.addEventListener("resize", reload);
window.addEventListener("contextmenu", function (event) {
    event.stopPropagation();
    event.preventDefault();
});
var nosleep = new NoSleep();
function toggleFullScreen() {
    var _a, _b;
    if (!document.fullscreenElement) {
        (_a = document.documentElement) === null || _a === void 0 ? void 0 : _a.requestFullscreen();
        try {
            (_b = screen === null || screen === void 0 ? void 0 : screen.orientation) === null || _b === void 0 ? void 0 : _b.lock("landscape");
        }
        catch (e) {
            console.warn(e);
        }
        nosleep.enable();
    }
    else if (document.exitFullscreen) {
        document.exitFullscreen();
        nosleep.disable();
    }
}
