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
    connect: async () => {
      throw new Error("Direct Bluetooth is unavailable here. Open R2 Remote on iPhone/iPad or Android, or connect through the Mac bridge.");
    },
    disconnect: async () => undefined,
    send: async () => { throw new Error("No transport available"); },
    readBattery: async () => null
  };
}
