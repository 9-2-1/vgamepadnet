let commandId = 1;
let commandList = [];
let commandScheduled = false;

function log(x) {
  fetch("/log", {
    method: "POST",
    body: String(x),
  });
}

function command(x) {
  commandList.push(`${commandId++} ${x}`);
  if (!commandScheduled) {
    commandScheduled = true;
    setTimeout(() => {
      fetch("/command", { method: "POST", body: commandList.join("\n") });
      commandList = [];
      commandScheduled = false;
    }, 16);
  }
}
function createFullScreenButton(text, mode, top, left, height, width) {
  const button = document.createElement("button");
  button.classList.add("joybutton");
  button.textContent = text;
  button.style.top = `${top}%`;
  button.style.left = `${left}%`;
  button.style.height = `${height}%`;
  button.style.width = `${width}%`;
  button.addEventListener("mousedown", (event) => {
    toggleFullScreen();
    button.classList.add("down");
    event.stopPropagation();
    event.preventDefault();
  });
  button.addEventListener("touchstart", (event) => {
    toggleFullScreen();
    button.classList.add("down");
    event.stopPropagation();
    event.preventDefault();
  });
  document.body.appendChild(button);
}
function createButton(text, mode, top, left, height, width) {
  const button = document.createElement("button");
  button.classList.add("joybutton");
  button.textContent = text;
  button.style.top = `${top}%`;
  button.style.left = `${left}%`;
  button.style.height = `${height}%`;
  button.style.width = `${width}%`;
  button.addEventListener("mousedown", (event) => {
    command(`bdown ${mode}`);
    button.classList.add("down");
    event.stopPropagation();
    event.preventDefault();
  });
  button.addEventListener("touchstart", (event) => {
    command(`bdown ${mode}`);
    button.classList.add("down");
    event.stopPropagation();
    event.preventDefault();
  });
  button.addEventListener("mouseup", (event) => {
    command(`bup ${mode}`);
    button.classList.remove("down");
    event.stopPropagation();
    event.preventDefault();
  });
  button.addEventListener("touchend", (event) => {
    command(`bup ${mode}`);
    button.classList.remove("down");
    event.stopPropagation();
    event.preventDefault();
  });
  document.body.appendChild(button);
}
function createTrigger(text, mode, top, left, height, width) {
  const button = document.createElement("button");
  button.classList.add("joybutton");
  button.textContent = text;
  button.style.top = `${top}%`;
  button.style.left = `${left}%`;
  button.style.height = `${height}%`;
  button.style.width = `${width}%`;
  button.addEventListener("mousedown", (event) => {
    command(`${mode} 1`);
    button.classList.add("down");
    event.stopPropagation();
    event.preventDefault();
  });
  button.addEventListener("touchstart", (event) => {
    command(`${mode} 1`);
    button.classList.add("down");
    event.stopPropagation();
    event.preventDefault();
  });
  button.addEventListener("mouseup", (event) => {
    command(`${mode} 0`);
    button.classList.remove("down");
    event.stopPropagation();
    event.preventDefault();
  });
  button.addEventListener("touchend", (event) => {
    command(`${mode} 0`);
    button.classList.remove("down");
    event.stopPropagation();
    event.preventDefault();
  });
  document.body.appendChild(button);
}

function createStick(text, mode, top, left, height, width) {
  const button = document.createElement("button");
  button.classList.add("joystick");
  button.textContent = text;
  button.style.top = `${top}%`;
  button.style.left = `${left}%`;
  button.style.height = `${height}%`;
  button.style.width = `${width}%`;
  let touchhandler = (event) => {
    let touches = event.targetTouches;
    let x = 0;
    let y = 0;
    let br = event.target.getBoundingClientRect();
    if (touches.length != 0) {
      button.classList.add("down");
      x = touches[0].clientX;
      y = touches[0].clientY;
      x = 2 * ((x - br.left) / br.width) - 1;
      y = 2 * ((y - br.top) / br.height) - 1;
      y = -y;
      // ampifier
      x *= 2;
      y *= 2;
      let d = Math.sqrt(x * x + y * y);
      if (d > 1) {
        x /= d;
        y /= d;
        d = 1;
      }
    } else {
      button.classList.remove("down");
    }
    command(`${mode} ${x} ${y}`);
  };
  let scheduled_event = null;
  let touchhandler_sche = (event) => {
    if (scheduled_event === null) {
      setTimeout(() => {
        touchhandler(scheduled_event);
        scheduled_event = null;
      }, 16);
    }
    scheduled_event = event;
    event.stopPropagation();
    event.preventDefault();
  };
  button.addEventListener("touchstart", touchhandler_sche);
  button.addEventListener("touchmove", touchhandler_sche);
  button.addEventListener("touchend", touchhandler_sche);
  document.body.appendChild(button);
}

function vibration() {
  fetch("/vibrate", { method: "POST" })
    .then((x) => x.text())
    .then((x) => {
      let power = Number(x);
      let a = [];
      if (power == 0) {
        a.push(0);
      } else {
        let d = 0;
        for (let i = 0; i < 50; i++) {
          d += 10 * power;
          let p = Math.floor(d);
          d -= p;
          a.push(p);
          a.push(10 - p);
        }
      }
      for (let i = 1; i < a.length - 1; i++) {
        if (a[i] == 0) {
          a[i - 1] += a[i + 1];
          a.splice(i, 2);
        }
      }
      navigator.vibrate(a);
      setTimeout(vibration, 0);
    });
}

const buttonmap = [
  "LT        GU  Y:B:RT",
  "LBLSL.        X:A:RB",
  "      BA    STRS    ",
  "    DUDR      R.    ",
  "    DLDD          []",
];
const buttonname = [
  // [Symbol, Label, Name]
  ["A:", "A", "A"],
  ["B:", "B", "B"],
  ["X:", "X", "X"],
  ["Y:", "Y", "Y"],
  ["LS", "LS", "LEFT_THUMB"],
  ["RS", "RS", "RIGHT_THUMB"],
  ["LB", "LB", "LEFT_SHOULDER"],
  ["RB", "RB", "RIGHT_SHOULDER"],
  ["DU", "↑", "DPAD_UP"],
  ["DD", "↓", "DPAD_DOWN"],
  ["DL", "←", "DPAD_LEFT"],
  ["DR", "→", "DPAD_RIGHT"],
  ["ST", "☰", "START"],
  ["BA", "❐", "BACK"],
  ["GU", "⭙", "GUIDE"],
];
const stickname = [
  // [Symbol, Label, Name]
  ["L.", "(L)", "lstick"],
  ["R.", "(R)", "rstick"],
];
const triggername = [
  // [Symbol, Label, Name]
  ["LT", "LT", "ltrig"],
  ["RT", "RT", "rtrig"],
];

function reload() {
  document.querySelectorAll(".joybutton").forEach((element) => {
    element.remove();
  });
  document.querySelectorAll(".joystick").forEach((element) => {
    element.remove();
  });
  let vw = document.body.clientWidth;
  let vh = document.body.clientHeight;
  let mapheight = buttonmap.length;
  let mapwidth = buttonmap[0].length / 2;
  let buttonheight = vw / mapwidth;
  let buttonwidth = vh / mapheight;
  let button_a = Math.min(buttonheight, buttonwidth);
  console.log(vw, vh, mapheight, mapwidth, button_a);
  let button_x_begin = (vw - button_a * mapwidth) / 2;
  let button_y_begin = (vh - button_a * mapheight) / 2;
  for (let i = 0; i < buttonmap.length; i++) {
    for (let j = 0; j < buttonmap[i].length / 2; j++) {
      let button = buttonmap[i].slice(j * 2, j * 2 + 2);
      if (button == "  ") {
        continue;
      }
      let button_x = button_x_begin + j * button_a;
      let button_y = button_y_begin + i * button_a;
      if (button == "[]") {
        createFullScreenButton(
          "[]",
          "",
          (button_y / vh) * 100,
          (button_x / vw) * 100,
          (button_a / vh) * 100,
          (button_a / vw) * 100,
        );
      }
      for (let k = 0; k < buttonname.length; k++) {
        if (buttonname[k][0] == button) {
          createButton(
            buttonname[k][1],
            buttonname[k][2],
            (button_y / vh) * 100,
            (button_x / vw) * 100,
            (button_a / vh) * 100,
            (button_a / vw) * 100,
          );
        }
      }
      for (let k = 0; k < stickname.length; k++) {
        if (stickname[k][0] == button) {
          createStick(
            stickname[k][1],
            stickname[k][2],
            ((button_y - button_a * 0.25) / vh) * 100,
            ((button_x - button_a * 0.25) / vw) * 100,
            ((button_a * 1.5) / vh) * 100,
            ((button_a * 1.5) / vw) * 100,
          );
        }
      }
      for (let k = 0; k < triggername.length; k++) {
        if (triggername[k][0] == button) {
          createTrigger(
            triggername[k][1],
            triggername[k][2],
            (button_y / vh) * 100,
            (button_x / vw) * 100,
            (button_a / vh) * 100,
            (button_a / vw) * 100,
          );
        }
      }
    }
  }
}

window.addEventListener("load", () => {
  reload();
  vibration();
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
