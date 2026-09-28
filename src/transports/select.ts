import type { R2Transport } from "./types";
import { NativeBridgeTransport } from "./nativeBridge";
import { WebBluetoothTransport } from "./webBluetooth";

export function createBestTransport(): R2Transport {
  const native = new NativeBridgeTransport();
  if (native.available) return native;

  const webBluetooth = new WebBluetoothTransport();
  if (webBluetooth.available) return webBluetooth;

  return {
    kind: "mac-bridge",
    label: "Mac Bridge Required",
    available: false,
    robotKind: null,
    connect: async () => {
      throw new Error("Direct Bluetooth is unavailable here. Open the native app on iPhone/iPad or use a Web Bluetooth browser.");
    },
    disconnect: async () => undefined,
    send: async () => { throw new Error("No transport available"); },
    readBattery: async () => null
  };
}
