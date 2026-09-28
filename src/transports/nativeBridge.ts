import type { DroidKind, R2Transport } from "./types";

type NativeReply = { id: number; ok: boolean; value?: unknown; error?: string };

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        r2bridge?: { postMessage(message: unknown): void };
      };
    };
    __r2NativeResolve?: (reply: NativeReply) => void;
    __r2NativeDisconnected?: () => void;
  }
}

function isDroidKind(value: unknown): value is DroidKind {
  return value === "r2d2" || value === "bb8";
}

export class NativeBridgeTransport implements R2Transport {
  readonly kind = "native-ble" as const;
  readonly label = "Direct Bluetooth";
  readonly available = Boolean(window.webkit?.messageHandlers?.r2bridge);
  robotKind: DroidKind | null = null;

  private nextId = 1;
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private disconnectHandler?: () => void;

  constructor() {
    window.__r2NativeResolve = (reply) => {
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      this.pending.delete(reply.id);
      if (reply.ok) pending.resolve(reply.value);
      else pending.reject(new Error(reply.error || "Native Bluetooth request failed"));
    };

    window.__r2NativeDisconnected = () => {
      this.robotKind = null;
      this.disconnectHandler?.();
    };
  }

  private request(action: string, payload: Record<string, unknown> = {}) {
    if (!this.available) return Promise.reject(new Error("Native Bluetooth bridge unavailable"));
    const id = this.nextId++;

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      window.webkit!.messageHandlers!.r2bridge!.postMessage({ id, action, ...payload });

      window.setTimeout(() => {
        const request = this.pending.get(id);
        if (!request) return;
        this.pending.delete(id);
        request.reject(new Error(`${action} timed out`));
      }, action === "connect" ? 15000 : 5000);
    });
  }

  async connect(): Promise<DroidKind> {
    const value = await this.request("connect");
    if (!isDroidKind(value)) {
      throw new Error("Connected device did not report a supported droid type");
    }
    this.robotKind = value;
    return value;
  }

  async disconnect() {
    await this.request("disconnect");
    this.robotKind = null;
  }

  async send(packet: Uint8Array) {
    const binary = Array.from(packet, (byte) => String.fromCharCode(byte)).join("");
    await this.request("send", { packet: btoa(binary) });
  }

  async readBattery() {
    const value = await this.request("readBattery");
    return typeof value === "number" ? value : null;
  }

  onDisconnect(handler: () => void) {
    this.disconnectHandler = handler;
  }
}

export async function nativeHaptic(style: "light" | "medium" | "heavy" = "light") {
  if (!window.webkit?.messageHandlers?.r2bridge) {
    if ("vibrate" in navigator) navigator.vibrate(style === "heavy" ? 35 : 15);
    return;
  }

  window.webkit.messageHandlers.r2bridge.postMessage({
    id: 0,
    action: "haptic",
    style
  });
}
