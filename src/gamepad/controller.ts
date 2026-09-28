export type GamepadButton =
  | "a"
  | "b"
  | "x"
  | "y"
  | "lb"
  | "rb"
  | "view"
  | "menu"
  | "leftStick"
  | "rightStick"
  | "dpadUp"
  | "dpadDown"
  | "dpadLeft"
  | "dpadRight";

export type GamepadAction =
  | "happy"
  | "negative"
  | "scan"
  | "excited"
  | "previousSound"
  | "nextSound"
  | "tripod"
  | "bipod"
  | "domeLeft"
  | "domeRight"
  | "resetYaw"
  | "centerDome"
  | "emergencyStop"
  | "toggleLights";

export type GamepadBindings = Record<GamepadAction, GamepadButton>;

export type GamepadSnapshot = {
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  leftTrigger: number;
  rightTrigger: number;
  buttons: Record<GamepadButton, boolean>;
};

export type GamepadStatus = {
  connected: boolean;
  name: string;
  source: "native" | "browser";
};

type NativeSnapshotEvent = {
  kind: "snapshot";
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  leftTrigger: number;
  rightTrigger: number;
  buttons: Partial<Record<GamepadButton, boolean>>;
};

const STORAGE_KEY = "r2.gamepad.bindings.v1";

export const BUTTON_LABELS: Record<GamepadButton, string> = {
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  lb: "LB",
  rb: "RB",
  view: "View",
  menu: "Menu",
  leftStick: "Left Stick Click",
  rightStick: "Right Stick Click",
  dpadUp: "D-pad Up",
  dpadDown: "D-pad Down",
  dpadLeft: "D-pad Left",
  dpadRight: "D-pad Right"
};

export const ACTION_LABELS: Record<GamepadAction, string> = {
  happy: "Happy / Positive",
  negative: "No / Negative",
  scan: "Scan",
  excited: "Excited",
  previousSound: "Previous Sound",
  nextSound: "Next Sound",
  tripod: "Tripod",
  bipod: "Bipod",
  domeLeft: "Dome Left",
  domeRight: "Dome Right",
  resetYaw: "Reset Front",
  centerDome: "Center Dome",
  emergencyStop: "Emergency Stop",
  toggleLights: "Toggle Lights"
};

export const DEFAULT_GAMEPAD_BINDINGS: GamepadBindings = {
  happy: "a",
  negative: "b",
  scan: "x",
  excited: "y",
  previousSound: "lb",
  nextSound: "rb",
  tripod: "dpadUp",
  bipod: "dpadDown",
  domeLeft: "dpadLeft",
  domeRight: "dpadRight",
  resetYaw: "leftStick",
  centerDome: "rightStick",
  emergencyStop: "menu",
  toggleLights: "view"
};

const BUTTONS = Object.keys(BUTTON_LABELS) as GamepadButton[];

function blankButtons(): Record<GamepadButton, boolean> {
  return Object.fromEntries(BUTTONS.map((button) => [button, false])) as Record<GamepadButton, boolean>;
}

export function normalizeBindings(candidate: unknown): GamepadBindings {
  if (!candidate || typeof candidate !== "object") return { ...DEFAULT_GAMEPAD_BINDINGS };
  const source = candidate as Partial<Record<GamepadAction, unknown>>;
  const normalized = { ...DEFAULT_GAMEPAD_BINDINGS };

  (Object.keys(normalized) as GamepadAction[]).forEach((action) => {
    const value = source[action];
    if (typeof value === "string" && BUTTONS.includes(value as GamepadButton)) {
      normalized[action] = value as GamepadButton;
    }
  });

  return normalized;
}

export function loadGamepadBindings(): GamepadBindings {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? normalizeBindings(JSON.parse(value)) : { ...DEFAULT_GAMEPAD_BINDINGS };
  } catch {
    return { ...DEFAULT_GAMEPAD_BINDINGS };
  }
}

export function saveGamepadBindings(bindings: GamepadBindings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeBindings(bindings)));
}

export function actionsForButton(bindings: GamepadBindings, button: GamepadButton): GamepadAction[] {
  return (Object.keys(bindings) as GamepadAction[]).filter((action) => bindings[action] === button);
}

function clampAxis(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(-1, Math.min(1, n));
}

function clampTrigger(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeSnapshot(event: NativeSnapshotEvent): GamepadSnapshot {
  const buttons = blankButtons();
  BUTTONS.forEach((button) => {
    buttons[button] = Boolean(event.buttons?.[button]);
  });

  return {
    leftX: clampAxis(event.leftX),
    leftY: clampAxis(event.leftY),
    rightX: clampAxis(event.rightX),
    rightY: clampAxis(event.rightY),
    leftTrigger: clampTrigger(event.leftTrigger),
    rightTrigger: clampTrigger(event.rightTrigger),
    buttons
  };
}

declare global {
  interface Window {
    __r2GamepadEvent?: (event: NativeSnapshotEvent) => void;
    __r2GamepadStatus?: (status: { connected: boolean; name?: string }) => void;
  }
}

export class R2GamepadInput {
  private running = false;
  private animationFrame = 0;
  private previousButtons = blankButtons();
  private browserControllerIndex: number | null = null;

  onStatus?: (status: GamepadStatus) => void;
  onSnapshot?: (snapshot: GamepadSnapshot) => void;
  onButtonDown?: (button: GamepadButton) => void;
  onButtonUp?: (button: GamepadButton) => void;

  start() {
    if (this.running) return;
    this.running = true;

    window.__r2GamepadEvent = (event) => {
      if (event?.kind !== "snapshot") return;
      this.consumeSnapshot(normalizeSnapshot(event));
    };

    window.__r2GamepadStatus = (status) => {
      this.onStatus?.({
        connected: Boolean(status.connected),
        name: status.name || "Xbox Controller",
        source: "native"
      });
      if (!status.connected) this.releaseAllButtons();
    };

    window.addEventListener("gamepadconnected", this.handleBrowserConnect);
    window.addEventListener("gamepaddisconnected", this.handleBrowserDisconnect);
    this.pollBrowser();
  }

  stop() {
    this.running = false;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("gamepadconnected", this.handleBrowserConnect);
    window.removeEventListener("gamepaddisconnected", this.handleBrowserDisconnect);
    if (window.__r2GamepadEvent) delete window.__r2GamepadEvent;
    if (window.__r2GamepadStatus) delete window.__r2GamepadStatus;
    this.releaseAllButtons();
  }

  private handleBrowserConnect = (event: GamepadEvent) => {
    if (window.webkit?.messageHandlers?.r2bridge) return;
    this.browserControllerIndex = event.gamepad.index;
    this.onStatus?.({
      connected: true,
      name: event.gamepad.id || "Game Controller",
      source: "browser"
    });
  };

  private handleBrowserDisconnect = (event: GamepadEvent) => {
    if (this.browserControllerIndex !== event.gamepad.index) return;
    this.browserControllerIndex = null;
    this.onStatus?.({
      connected: false,
      name: event.gamepad.id || "Game Controller",
      source: "browser"
    });
    this.releaseAllButtons();
  };

  private pollBrowser = () => {
    if (!this.running) return;

    if (!window.webkit?.messageHandlers?.r2bridge && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      let gamepad: Gamepad | null = null;

      if (this.browserControllerIndex != null) {
        gamepad = pads[this.browserControllerIndex] ?? null;
      }

      if (!gamepad) {
        gamepad = Array.from(pads).find((pad): pad is Gamepad => Boolean(pad && pad.connected && pad.mapping === "standard")) ?? null;
        if (gamepad && this.browserControllerIndex !== gamepad.index) {
          this.browserControllerIndex = gamepad.index;
          this.onStatus?.({
            connected: true,
            name: gamepad.id || "Game Controller",
            source: "browser"
          });
        }
      }

      if (gamepad) this.consumeSnapshot(this.snapshotFromBrowser(gamepad));
    }

    this.animationFrame = requestAnimationFrame(this.pollBrowser);
  };

  private snapshotFromBrowser(gamepad: Gamepad): GamepadSnapshot {
    const pressed = (index: number) => Boolean(gamepad.buttons[index]?.pressed);
    const value = (index: number) => gamepad.buttons[index]?.value ?? 0;

    return {
      leftX: clampAxis(gamepad.axes[0] ?? 0),
      leftY: clampAxis(-(gamepad.axes[1] ?? 0)),
      rightX: clampAxis(gamepad.axes[2] ?? 0),
      rightY: clampAxis(-(gamepad.axes[3] ?? 0)),
      leftTrigger: clampTrigger(value(6)),
      rightTrigger: clampTrigger(value(7)),
      buttons: {
        a: pressed(0),
        b: pressed(1),
        x: pressed(2),
        y: pressed(3),
        lb: pressed(4),
        rb: pressed(5),
        view: pressed(8),
        menu: pressed(9),
        leftStick: pressed(10),
        rightStick: pressed(11),
        dpadUp: pressed(12),
        dpadDown: pressed(13),
        dpadLeft: pressed(14),
        dpadRight: pressed(15)
      }
    };
  }

  private consumeSnapshot(snapshot: GamepadSnapshot) {
    BUTTONS.forEach((button) => {
      const previous = this.previousButtons[button];
      const next = snapshot.buttons[button];
      if (!previous && next) this.onButtonDown?.(button);
      if (previous && !next) this.onButtonUp?.(button);
      this.previousButtons[button] = next;
    });

    this.onSnapshot?.(snapshot);
  }

  private releaseAllButtons() {
    BUTTONS.forEach((button) => {
      if (this.previousButtons[button]) this.onButtonUp?.(button);
      this.previousButtons[button] = false;
    });
    this.onSnapshot?.({
      leftX: 0,
      leftY: 0,
      rightX: 0,
      rightY: 0,
      leftTrigger: 0,
      rightTrigger: 0,
      buttons: blankButtons()
    });
  }
}
