import "./styles.css";
import { R2Controller } from "./r2/protocol";
import { createBestTransport } from "./transports/select";
import { nativeHaptic } from "./transports/nativeBridge";

const transport = createBestTransport();
const r2 = new R2Controller(transport);

let connected = false;
let battery: number | null = null;
let driving = false;
let driveTimer = 0;

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div>
        <div class="eyebrow">R2 UNIT CONTROL</div>
        <h1>R2-D2</h1>
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

      <article class="panel dome-panel">
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

      <article class="panel">
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

      <article class="panel">
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

      <article class="panel lights-panel">
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
        <p class="hint">Drive stops immediately when your finger leaves the pad or the app loses control.</p>
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

function setState(label: string, isConnected = connected) {
  stateLabel.textContent = label;
  connectButton.classList.toggle("connected", isConnected);
  connectLabel.textContent = isConnected ? "Disconnect" : "Connect";
}

function requireConnected() {
  if (connected) return true;
  setState("Connect first");
  nativeHaptic("medium");
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
  stopDriving(false);
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
    await r2.connect();
    connected = true;
    setState("Connected", true);
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

function updateJoystick(event: PointerEvent) {
  const point = joystickPoint(event);
  knob.style.transform = `translate(${point.x}px, ${point.y}px)`;
  const speed = Math.round(point.ratio * 180);
  speedValue.textContent = String(speed);
  headingValue.textContent = `${point.heading}°`;

  if (driveTimer) window.clearTimeout(driveTimer);
  driveTimer = window.setTimeout(() => void sendDrive(speed, point.heading), 25);
}

function stopDriving(sendStop = true) {
  driving = false;
  if (driveTimer) window.clearTimeout(driveTimer);
  driveTimer = 0;
  knob.style.transform = "translate(0px, 0px)";
  speedValue.textContent = "0";
  if (sendStop && connected) void r2.stop();
}

joystick.addEventListener("pointerdown", (event) => {
  if (!requireConnected()) return;
  driving = true;
  joystick.setPointerCapture(event.pointerId);
  void nativeHaptic("light");
  updateJoystick(event);
});

joystick.addEventListener("pointermove", (event) => {
  if (driving) updateJoystick(event);
});

for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
  joystick.addEventListener(eventName, () => stopDriving());
}

window.addEventListener("blur", () => stopDriving());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopDriving();
});

document.querySelector("#resetYaw")?.addEventListener("click", async () => {
  if (!requireConnected()) return;
  await nativeHaptic("light");
  await r2.resetYaw();
});

async function setDome(value: number) {
  if (!requireConnected()) return;
  domeSlider.value = String(value);
  domeValue.textContent = `${value}°`;
  await r2.setHeadPosition(value);
}

domeSlider.addEventListener("input", () => {
  const value = Number(domeSlider.value);
  domeValue.textContent = `${value}°`;
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
    await r2.playAnimation(button.dataset.animation as any);
  });
});

document.querySelector("#stopAnimation")?.addEventListener("click", () => {
  if (requireConnected()) void r2.stopAnimation();
});

document.querySelectorAll<HTMLButtonElement>("[data-sound]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (!requireConnected()) return;
    await nativeHaptic("light");
    await r2.playSound(button.dataset.sound as any);
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

document.querySelector("#wakeButton")?.addEventListener("click", async () => {
  if (!requireConnected()) return;
  await nativeHaptic("medium");
  await r2.wake();
});

document.querySelector("#sleepButton")?.addEventListener("click", async () => {
  if (!requireConnected()) return;
  stopDriving();
  await r2.sleep();
});

setState(transport.available ? "Ready" : "Bluetooth unavailable", false);
