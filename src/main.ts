import "./styles.css";
import { R2Controller } from "./r2/protocol";
import { createBestTransport } from "./transports/select";
import { nativeHaptic } from "./transports/nativeBridge";
import {
  ACTION_LABELS,
  BUTTON_LABELS,
  DEFAULT_GAMEPAD_BINDINGS,
  R2GamepadInput,
  actionsForButton,
  loadGamepadBindings,
  saveGamepadBindings,
  type GamepadAction,
  type GamepadBindings,
  type GamepadSnapshot
} from "./gamepad/controller";

const transport = createBestTransport();
const r2 = new R2Controller(transport);
const gamepad = new R2GamepadInput();

let connected = false;
let battery: number | null = null;
let pointerDriving = false;
let driveTimer = 0;
let pendingPointerDrive: { speed: number; heading: number } | null = null;
let lastPointerDriveAt = 0;
let gamepadBindings: GamepadBindings = loadGamepadBindings();
let currentDome = 0;
let lightsOn = true;
let gamepadConnected = false;
let lastGamepadDriveKey = "";
let lastGamepadDriveAt = 0;
let lastGamepadTick = performance.now();
let latestGamepad: GamepadSnapshot = {
  leftX: 0,
  leftY: 0,
  rightX: 0,
  rightY: 0,
  leftTrigger: 0,
  rightTrigger: 0,
  buttons: {
    a: false,
    b: false,
    x: false,
    y: false,
    lb: false,
    rb: false,
    view: false,
    menu: false,
    leftStick: false,
    rightStick: false,
    dpadUp: false,
    dpadDown: false,
    dpadLeft: false,
    dpadRight: false
  }
};

const GAMEPAD_SOUNDS = ["positive", "chatty", "excited", "alarm", "scream"] as const;
let gamepadSoundIndex = 0;

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div>
        <div id="droidEyebrow" class="eyebrow">DROID CONTROL</div>
        <h1 id="droidTitle">R2-D2</h1>
      </div>
      <button id="connectButton" class="connect-button">
        <span class="status-dot"></span>
        <span id="connectLabel">Connect</span>
      </button>
    </header>

    <section class="status-strip">
      <div class="status-cell">
        <span>Transport</span>
        <strong id="transportLabel">${transport.label}</strong>
      </div>
      <div class="status-cell">
        <span>Battery</span>
        <strong id="batteryLabel">--</strong>
      </div>
      <div class="status-cell">
        <span>State</span>
        <strong id="stateLabel">Offline</strong>
      </div>
    </section>

    <section class="controller-banner">
      <div class="controller-status">
        <span id="gamepadDot" class="gamepad-dot"></span>
        <div>
          <span class="controller-kicker">XBOX CONTROLLER</span>
          <strong id="gamepadName">Not connected</strong>
        </div>
      </div>
      <div class="controller-axis-chips">
        <span><b>LS</b> Drive</span>
        <span id="rightStickHint"><b>RS</b> Dome</span>
        <span><b>LT</b> Precision</span>
        <span><b>RT</b> Boost</span>
      </div>
    </section>

    <section class="control-grid">
      <article class="panel drive-panel">
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">MOVEMENT</span>
            <h2>Drive</h2>
          </div>
          <button id="resetYaw" class="small-button">Reset front</button>
        </div>

        <div class="joystick-wrap">
          <div id="joystick" class="joystick" aria-label="Drive joystick">
            <div class="joystick-ring ring-one"></div>
            <div class="joystick-ring ring-two"></div>
            <div class="axis axis-x"></div>
            <div class="axis axis-y"></div>
            <div id="joystickKnob" class="joystick-knob"></div>
          </div>
        </div>

        <div class="drive-meta">
          <div><span>Speed</span><strong id="speedValue">0</strong></div>
          <div><span>Heading</span><strong id="headingValue">0°</strong></div>
        </div>
      </article>

      <article class="panel dome-panel" data-r2-only>
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">HEAD</span>
            <h2>Dome</h2>
          </div>
          <button id="centerDome" class="small-button">Center</button>
        </div>

        <div class="dome-readout">
          <span id="domeValue">0°</span>
        </div>
        <input id="domeSlider" class="range" type="range" min="-160" max="180" value="0" step="1" />

        <div class="preset-row">
          <button data-dome="-90">Left</button>
          <button data-dome="0">Center</button>
          <button data-dome="90">Right</button>
        </div>

        <div class="section-label">STANCE</div>
        <div class="stance-grid">
          <button data-stance="tripod">Tripod</button>
          <button data-stance="bipod">Bipod</button>
          <button data-stance="waddle">Waddle</button>
          <button data-stance="stop">Stop</button>
        </div>
      </article>

      <article class="panel" data-r2-only>
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">PERSONALITY</span>
            <h2>Animations</h2>
          </div>
          <button id="stopAnimation" class="small-button">Stop</button>
        </div>
        <div class="button-grid">
          <button data-animation="yes">Yes</button>
          <button data-animation="no">No</button>
          <button data-animation="excited">Excited</button>
          <button data-animation="happy">Happy</button>
          <button data-animation="curious">Curious</button>
          <button data-animation="scan">Scan</button>
          <button data-animation="laugh">Laugh</button>
          <button data-animation="scared">Scared</button>
        </div>
      </article>

      <article class="panel" data-r2-only>
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">AUDIO</span>
            <h2>Sounds</h2>
          </div>
          <button id="stopAudio" class="small-button">Stop</button>
        </div>
        <div class="button-grid">
          <button data-sound="positive">Positive</button>
          <button data-sound="chatty">Chatty</button>
          <button data-sound="excited">Excited</button>
          <button data-sound="alarm">Alarm</button>
          <button data-sound="scream">Scream</button>
        </div>
        <div class="volume-row">
          <span>Volume</span>
          <input id="volumeSlider" class="range" type="range" min="0" max="255" value="190" />
        </div>
      </article>

      <article class="panel lights-panel" data-r2-only>
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">LIGHTING</span>
            <h2>Lights</h2>
          </div>
        </div>
        <div class="light-grid">
          <label>
            <span>Front</span>
            <input id="frontColor" type="color" value="#1647ff" />
          </label>
          <label>
            <span>Back</span>
            <input id="backColor" type="color" value="#ff2f2f" />
          </label>
          <label class="slider-card">
            <span>Logic</span>
            <input id="logicSlider" class="range" type="range" min="0" max="255" value="180" />
          </label>
          <label class="slider-card">
            <span>Holo</span>
            <input id="holoSlider" class="range" type="range" min="0" max="255" value="180" />
          </label>
        </div>
      </article>

      <article id="bb8Panel" class="panel bb8-panel droid-hidden">
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">BB-8 SYSTEMS</span>
            <h2>Body & Calibration</h2>
          </div>
        </div>

        <div class="light-grid">
          <label>
            <span>Body RGB</span>
            <input id="bb8BodyColor" type="color" value="#ff9f2f" />
          </label>
          <label class="slider-card">
            <span>Rear aiming LED</span>
            <input id="bb8RearLed" class="range" type="range" min="0" max="255" value="0" />
          </label>
        </div>

        <div class="bb8-calibration-actions">
          <button id="bb8StartCalibration">Aim / Calibrate</button>
          <button id="bb8FinishCalibration">Set Front</button>
        </div>

        <p class="hint">Aim / Calibrate disables stabilization and turns on the rear aiming LED. Point BB-8 away from you, then press Set Front.</p>
      </article>

      <article class="panel controller-panel">
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">GAMEPAD</span>
            <h2>Xbox Mapping</h2>
          </div>
          <button id="resetMappings" class="small-button">Defaults</button>
        </div>

        <p class="hint controller-hint">
          Pair the controller in Bluetooth settings. Button changes save automatically.
          Menu is the emergency stop by default.
        </p>

        <details class="mapping-details">
          <summary>Button mappings</summary>
          <div id="mappingGrid" class="mapping-grid"></div>
        </details>
      </article>

      <article class="panel power-panel">
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">SYSTEM</span>
            <h2>Power</h2>
          </div>
        </div>
        <div class="power-actions">
          <button id="wakeButton">Wake</button>
          <button id="sleepButton" class="danger-soft">Sleep</button>
        </div>
        <p class="hint">Drive stops immediately when touch control releases, the Xbox stick returns to neutral, or the controller disconnects.</p>
      </article>
    </section>
  </main>
`;

const connectButton = document.querySelector<HTMLButtonElement>("#connectButton")!;
const connectLabel = document.querySelector<HTMLSpanElement>("#connectLabel")!;
const stateLabel = document.querySelector<HTMLElement>("#stateLabel")!;
const batteryLabel = document.querySelector<HTMLElement>("#batteryLabel")!;
const joystick = document.querySelector<HTMLDivElement>("#joystick")!;
const knob = document.querySelector<HTMLDivElement>("#joystickKnob")!;
const speedValue = document.querySelector<HTMLElement>("#speedValue")!;
const headingValue = document.querySelector<HTMLElement>("#headingValue")!;
const domeSlider = document.querySelector<HTMLInputElement>("#domeSlider")!;
const domeValue = document.querySelector<HTMLElement>("#domeValue")!;
const gamepadDot = document.querySelector<HTMLElement>("#gamepadDot")!;
const gamepadName = document.querySelector<HTMLElement>("#gamepadName")!;
const mappingGrid = document.querySelector<HTMLDivElement>("#mappingGrid")!;
const droidTitle = document.querySelector<HTMLElement>("#droidTitle")!;
const droidEyebrow = document.querySelector<HTMLElement>("#droidEyebrow")!;
const rightStickHint = document.querySelector<HTMLElement>("#rightStickHint")!;
const resetYawButton = document.querySelector<HTMLButtonElement>("#resetYaw")!;
const bb8Panel = document.querySelector<HTMLElement>("#bb8Panel")!;
const bb8BodyColor = document.querySelector<HTMLInputElement>("#bb8BodyColor")!;
const bb8RearLed = document.querySelector<HTMLInputElement>("#bb8RearLed")!;

function applyDroidMode(kind: "r2d2" | "bb8") {
  const isBB8 = kind === "bb8";

  droidTitle.textContent = isBB8 ? "BB-8" : "R2-D2";
  droidEyebrow.textContent = isBB8 ? "SPHERO DROID CONTROL" : "R2 UNIT CONTROL";
  resetYawButton.textContent = isBB8 ? "Set front" : "Reset front";
  rightStickHint.innerHTML = isBB8 ? "<b>RS</b> —" : "<b>RS</b> Dome";

  document.querySelectorAll<HTMLElement>("[data-r2-only]").forEach((element) => {
    element.classList.toggle("droid-hidden", isBB8);
  });

  bb8Panel.classList.toggle("droid-hidden", !isBB8);
}

function setState(label: string, isConnected = connected) {
  stateLabel.textContent = label;
  connectButton.classList.toggle("connected", isConnected);
  connectLabel.textContent = isConnected ? "Disconnect" : "Connect";
}

function requireConnected() {
  if (connected) return true;
  setState("Connect first");
  void nativeHaptic("medium");
  return false;
}

async function refreshBattery() {
  if (!connected) return;
  try {
    battery = await r2.readBattery();
    batteryLabel.textContent = battery == null ? "--" : `${battery}%`;
  } catch {
    batteryLabel.textContent = "--";
  }
}

transport.onDisconnect?.(() => {
  connected = false;
  stopPointerDriving(false);
  lastGamepadDriveKey = "";
  setState("Disconnected", false);
});

connectButton.addEventListener("click", async () => {
  if (connected) {
    await r2.disconnect().catch(() => undefined);
    connected = false;
    setState("Offline", false);
    batteryLabel.textContent = "--";
    return;
  }

  try {
    setState("Connecting", false);
    connectButton.disabled = true;
    const kind = await r2.connect();
    connected = true;
    applyDroidMode(kind);
    setState(kind === "bb8" ? "BB-8 Connected" : "R2-D2 Connected", true);
    await nativeHaptic("medium");
    await refreshBattery();
  } catch (error) {
    connected = false;
    setState(error instanceof Error ? error.message : "Connection failed", false);
  } finally {
    connectButton.disabled = false;
  }
});

function joystickPoint(event: PointerEvent) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  const max = rect.width * 0.36;
  const distance = Math.min(Math.hypot(dx, dy), max);
  const angle = Math.atan2(dy, dx);
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    ratio: distance / max,
    heading: (Math.round((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360
  };
}

async function sendDrive(speed: number, heading: number) {
  if (!connected) return;
  try {
    await r2.drive(speed, heading);
  } catch {
    connected = false;
    setState("Drive connection lost", false);
  }
}

function flushPointerDrive() {
  driveTimer = 0;
  if (!pendingPointerDrive) return;

  const command = pendingPointerDrive;
  pendingPointerDrive = null;
  lastPointerDriveAt = performance.now();
  void sendDrive(command.speed, command.heading);
}

function queuePointerDrive(speed: number, heading: number) {
  pendingPointerDrive = { speed, heading };

  const interval = r2.isBB8 ? 70 : 35;
  const elapsed = performance.now() - lastPointerDriveAt;

  if (elapsed >= interval) {
    flushPointerDrive();
    return;
  }

  if (!driveTimer) {
    driveTimer = window.setTimeout(flushPointerDrive, Math.max(1, interval - elapsed));
  }
}

function updatePointerJoystick(event: PointerEvent) {
  const point = joystickPoint(event);
  knob.style.transform = `translate(${point.x}px, ${point.y}px)`;
  const speed = Math.round(point.ratio * 180);
  speedValue.textContent = String(speed);
  headingValue.textContent = `${point.heading}°`;
  queuePointerDrive(speed, point.heading);
}

function stopPointerDriving(sendStop = true) {
  pointerDriving = false;
  if (driveTimer) window.clearTimeout(driveTimer);
  driveTimer = 0;
  pendingPointerDrive = null;

  if (!gamepadConnected || Math.hypot(latestGamepad.leftX, latestGamepad.leftY) < 0.14) {
    knob.style.transform = "translate(0px, 0px)";
    speedValue.textContent = "0";
  }

  if (sendStop && connected) void r2.stop();
}

joystick.addEventListener("pointerdown", (event) => {
  if (!requireConnected()) return;
  pointerDriving = true;
  joystick.setPointerCapture(event.pointerId);
  void nativeHaptic("light");
  updatePointerJoystick(event);
});

joystick.addEventListener("pointermove", (event) => {
  if (pointerDriving) updatePointerJoystick(event);
});

for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
  joystick.addEventListener(eventName, () => stopPointerDriving());
}

window.addEventListener("blur", () => {
  stopPointerDriving();
  if (connected) void r2.stop();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPointerDriving();
    if (connected) void r2.stop();
  }
});

document.querySelector("#resetYaw")?.addEventListener("click", async () => {
  if (!requireConnected()) return;
  await nativeHaptic("light");
  await r2.resetYaw();
});

async function setDome(value: number) {
  if (!requireConnected()) return;
  currentDome = Math.max(-160, Math.min(180, Math.round(value)));
  domeSlider.value = String(currentDome);
  domeValue.textContent = `${currentDome}°`;
  await r2.setHeadPosition(currentDome);
}

domeSlider.addEventListener("input", () => {
  currentDome = Number(domeSlider.value);
  domeValue.textContent = `${currentDome}°`;
});

domeSlider.addEventListener("change", () => void setDome(Number(domeSlider.value)));
document.querySelector("#centerDome")?.addEventListener("click", () => void setDome(0));

document.querySelectorAll<HTMLButtonElement>("[data-dome]").forEach((button) => {
  button.addEventListener("click", () => void setDome(Number(button.dataset.dome)));
});

document.querySelectorAll<HTMLButtonElement>("[data-stance]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (!requireConnected()) return;
    await nativeHaptic("medium");
    await r2.setStance(button.dataset.stance as "stop" | "tripod" | "bipod" | "waddle");
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-animation]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (!requireConnected()) return;
    await nativeHaptic("light");
    await r2.playAnimation(button.dataset.animation as "yes" | "no" | "excited" | "happy" | "curious" | "scan" | "laugh" | "scared");
  });
});

document.querySelector("#stopAnimation")?.addEventListener("click", () => {
  if (requireConnected()) void r2.stopAnimation();
});

document.querySelectorAll<HTMLButtonElement>("[data-sound]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (!requireConnected()) return;
    await nativeHaptic("light");
    await r2.playSound(button.dataset.sound as "positive" | "chatty" | "excited" | "alarm" | "scream");
  });
});

document.querySelector("#stopAudio")?.addEventListener("click", () => {
  if (requireConnected()) void r2.stopAudio();
});

document.querySelector<HTMLInputElement>("#volumeSlider")?.addEventListener("change", (event) => {
  if (requireConnected()) void r2.setVolume(Number((event.target as HTMLInputElement).value));
});

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

document.querySelector<HTMLInputElement>("#frontColor")?.addEventListener("change", (event) => {
  if (!requireConnected()) return;
  const [r, g, b] = hexToRgb((event.target as HTMLInputElement).value);
  void r2.setFrontLed(r, g, b);
});

document.querySelector<HTMLInputElement>("#backColor")?.addEventListener("change", (event) => {
  if (!requireConnected()) return;
  const [r, g, b] = hexToRgb((event.target as HTMLInputElement).value);
  void r2.setBackLed(r, g, b);
});

document.querySelector<HTMLInputElement>("#logicSlider")?.addEventListener("change", (event) => {
  if (requireConnected()) void r2.setLogicDisplay(Number((event.target as HTMLInputElement).value));
});

document.querySelector<HTMLInputElement>("#holoSlider")?.addEventListener("change", (event) => {
  if (requireConnected()) void r2.setHoloProjector(Number((event.target as HTMLInputElement).value));
});

bb8BodyColor.addEventListener("change", () => {
  if (!requireConnected() || !r2.isBB8) return;
  const [r, g, b] = hexToRgb(bb8BodyColor.value);
  void r2.setFrontLed(r, g, b);
});

bb8RearLed.addEventListener("change", () => {
  if (!requireConnected() || !r2.isBB8) return;
  void r2.setBB8RearLed(Number(bb8RearLed.value));
});

document.querySelector("#bb8StartCalibration")?.addEventListener("click", async () => {
  if (!requireConnected() || !r2.isBB8) return;
  await nativeHaptic("medium");
  await r2.startCalibration();
  bb8RearLed.value = "255";
});

document.querySelector("#bb8FinishCalibration")?.addEventListener("click", async () => {
  if (!requireConnected() || !r2.isBB8) return;
  await nativeHaptic("medium");
  await r2.finishCalibration();
  bb8RearLed.value = "0";
});

document.querySelector("#wakeButton")?.addEventListener("click", async () => {
  if (!requireConnected()) return;
  await nativeHaptic("medium");
  await r2.wake();
});

document.querySelector("#sleepButton")?.addEventListener("click", async () => {
  if (!requireConnected()) return;
  stopPointerDriving();
  await r2.sleep();
});

function renderMappings() {
  const buttonEntries = Object.entries(BUTTON_LABELS) as Array<[keyof typeof BUTTON_LABELS, string]>;

  mappingGrid.innerHTML = (Object.entries(ACTION_LABELS) as Array<[GamepadAction, string]>)
    .map(([action, label]) => {
      const options = buttonEntries
        .map(([button, buttonLabel]) => `<option value="${button}" ${gamepadBindings[action] === button ? "selected" : ""}>${buttonLabel}</option>`)
        .join("");

      return `
        <label class="mapping-row">
          <span>${label}</span>
          <select data-gamepad-action="${action}">${options}</select>
        </label>
      `;
    })
    .join("");

  mappingGrid.querySelectorAll<HTMLSelectElement>("select[data-gamepad-action]").forEach((select) => {
    select.addEventListener("change", () => {
      const action = select.dataset.gamepadAction as GamepadAction;
      gamepadBindings = {
        ...gamepadBindings,
        [action]: select.value
      } as GamepadBindings;
      saveGamepadBindings(gamepadBindings);
    });
  });
}

document.querySelector("#resetMappings")?.addEventListener("click", () => {
  gamepadBindings = { ...DEFAULT_GAMEPAD_BINDINGS };
  saveGamepadBindings(gamepadBindings);
  renderMappings();
  void nativeHaptic("medium");
});

function updateGamepadStatus(isConnected: boolean, name: string) {
  gamepadConnected = isConnected;
  gamepadDot.classList.toggle("connected", isConnected);
  gamepadName.textContent = isConnected ? name : "Not connected";

  if (!isConnected) {
    latestGamepad = {
      ...latestGamepad,
      leftX: 0,
      leftY: 0,
      rightX: 0,
      rightY: 0,
      leftTrigger: 0,
      rightTrigger: 0
    };
    lastGamepadDriveKey = "";
    if (connected) void r2.stop();
  }
}

async function emergencyStop() {
  lastGamepadDriveKey = "";
  stopPointerDriving(false);
  knob.style.transform = "translate(0px, 0px)";
  speedValue.textContent = "0";

  if (!connected) return;

  await nativeHaptic("heavy");
  await Promise.allSettled([
    r2.stop(),
    r2.stopAnimation(),
    r2.stopAudio(),
    r2.setStance("stop")
  ]);
}

async function toggleLights() {
  if (!requireConnected()) return;

  lightsOn = !lightsOn;

  if (r2.isBB8) {
    if (lightsOn) {
      const [r, g, b] = hexToRgb(bb8BodyColor.value);
      await r2.setFrontLed(r, g, b);
    } else {
      await r2.setFrontLed(0, 0, 0);
      await r2.setBB8RearLed(0);
    }
    return;
  }

  if (lightsOn) {
    await Promise.all([
      r2.setFrontLed(22, 71, 255),
      r2.setBackLed(255, 47, 47),
      r2.setLogicDisplay(180),
      r2.setHoloProjector(180)
    ]);
  } else {
    await Promise.all([
      r2.setFrontLed(0, 0, 0),
      r2.setBackLed(0, 0, 0),
      r2.setLogicDisplay(0),
      r2.setHoloProjector(0)
    ]);
  }
}

async function cycleGamepadSound(direction: -1 | 1) {
  if (!requireConnected()) return;
  gamepadSoundIndex = (gamepadSoundIndex + direction + GAMEPAD_SOUNDS.length) % GAMEPAD_SOUNDS.length;
  await r2.playSound(GAMEPAD_SOUNDS[gamepadSoundIndex]!);
}

async function runGamepadAction(action: GamepadAction) {
  if (action === "emergencyStop") {
    await emergencyStop();
    return;
  }

  if (!requireConnected()) return;

  switch (action) {
  case "happy":
    await Promise.allSettled([r2.playAnimation("happy"), r2.playSound("positive")]);
    break;
  case "negative":
    await r2.playAnimation("no");
    break;
  case "scan":
    await r2.playAnimation("scan");
    break;
  case "excited":
    await Promise.allSettled([r2.playAnimation("excited"), r2.playSound("excited")]);
    break;
  case "previousSound":
    await cycleGamepadSound(-1);
    break;
  case "nextSound":
    await cycleGamepadSound(1);
    break;
  case "tripod":
    await r2.setStance("tripod");
    break;
  case "bipod":
    await r2.setStance("bipod");
    break;
  case "domeLeft":
    await setDome(-90);
    break;
  case "domeRight":
    await setDome(90);
    break;
  case "resetYaw":
    await r2.resetYaw();
    break;
  case "centerDome":
    await setDome(0);
    break;
  case "toggleLights":
    await toggleLights();
    break;
  }
}

gamepad.onStatus = (status) => {
  updateGamepadStatus(status.connected, status.name);
};

gamepad.onButtonDown = (button) => {
  const actions = actionsForButton(gamepadBindings, button);
  actions.forEach((action) => void runGamepadAction(action));
};

gamepad.onSnapshot = (snapshot) => {
  latestGamepad = snapshot;
};

function updateGamepadDrive(now: number) {
  if (!gamepadConnected || !connected || pointerDriving) return;

  const deadzone = 0.14;
  const magnitude = Math.min(1, Math.hypot(latestGamepad.leftX, latestGamepad.leftY));

  if (magnitude < deadzone) {
    if (lastGamepadDriveKey) {
      lastGamepadDriveKey = "";
      void r2.stop();
      knob.style.transform = "translate(0px, 0px)";
      speedValue.textContent = "0";
    }
    return;
  }

  const normalizedMagnitude = (magnitude - deadzone) / (1 - deadzone);
  const heading = (
    Math.round((Math.atan2(latestGamepad.leftX, latestGamepad.leftY) * 180) / Math.PI) + 360
  ) % 360;

  let maxSpeed = 180;
  if (latestGamepad.leftTrigger > 0.08) {
    maxSpeed = Math.round(80 - latestGamepad.leftTrigger * 25);
  } else if (latestGamepad.rightTrigger > 0.08) {
    maxSpeed = Math.round(180 + latestGamepad.rightTrigger * 75);
  }

  const speed = Math.round(normalizedMagnitude * maxSpeed);
  const driveKey = `${speed}:${heading}`;

  const minDriveInterval = r2.isBB8 ? 70 : 35;
  if (
    (driveKey !== lastGamepadDriveKey && now - lastGamepadDriveAt >= minDriveInterval) ||
    now - lastGamepadDriveAt > 250
  ) {
    lastGamepadDriveKey = driveKey;
    lastGamepadDriveAt = now;
    void sendDrive(speed, heading);
  }

  const maxTravel = joystick.clientWidth * 0.36;
  const scale = normalizedMagnitude / Math.max(magnitude, 0.0001);
  const x = latestGamepad.leftX * scale * maxTravel;
  const y = -latestGamepad.leftY * scale * maxTravel;
  knob.style.transform = `translate(${x}px, ${y}px)`;
  speedValue.textContent = String(speed);
  headingValue.textContent = `${heading}°`;
}

function updateGamepadDome(now: number) {
  if (!gamepadConnected || !connected || r2.isBB8) return;

  const x = Math.abs(latestGamepad.rightX) < 0.16 ? 0 : latestGamepad.rightX;
  if (!x) return;

  const deltaMs = Math.min(100, now - lastGamepadTick);
  const degreesPerSecond = 110;
  const next = currentDome + x * degreesPerSecond * (deltaMs / 1000);
  currentDome = Math.max(-160, Math.min(180, next));

  if (now - Number(domeSlider.dataset.lastGamepadSend || "0") >= 65) {
    domeSlider.dataset.lastGamepadSend = String(now);
    domeSlider.value = String(Math.round(currentDome));
    domeValue.textContent = `${Math.round(currentDome)}°`;
    void r2.setHeadPosition(currentDome);
  }
}

function gamepadLoop(now: number) {
  updateGamepadDrive(now);
  updateGamepadDome(now);
  lastGamepadTick = now;
  requestAnimationFrame(gamepadLoop);
}

renderMappings();
gamepad.start();

if (window.webkit?.messageHandlers?.r2bridge) {
  window.webkit.messageHandlers.r2bridge.postMessage({
    id: 0,
    action: "refreshGamepad"
  });
}

requestAnimationFrame(gamepadLoop);
setState(transport.available ? "Ready" : "Bluetooth unavailable", false);
