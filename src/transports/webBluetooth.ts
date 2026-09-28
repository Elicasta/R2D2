import { BB8 } from "../bb8/constants";
import { R2 } from "../r2/constants";
import type { DroidKind, R2Transport } from "./types";

type BluetoothDeviceLike = {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServerLike>;
    disconnect(): void;
  };
  addEventListener(type: string, listener: EventListener): void;
};

type BluetoothRemoteGATTServerLike = {
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTServiceLike>;
};

type BluetoothRemoteGATTServiceLike = {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristicLike>;
};

type BluetoothRemoteGATTCharacteristicLike = {
  value?: DataView | null;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristicLike>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  readValue(): Promise<DataView>;
};

type BluetoothNavigator = Navigator & {
  bluetooth?: {
    requestDevice(options: unknown): Promise<BluetoothDeviceLike>;
  };
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function detectDroidKind(name: string | undefined): DroidKind | null {
  if (!name) return null;
  if (R2.namePrefixes.some((prefix) => name.startsWith(prefix))) return "r2d2";
  if (BB8.namePrefixes.some((prefix) => name.startsWith(prefix))) return "bb8";
  return null;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class WebBluetoothTransport implements R2Transport {
  readonly kind = "web-bluetooth" as const;
  readonly label = "Direct Bluetooth";
  readonly available = Boolean((navigator as BluetoothNavigator).bluetooth);
  robotKind: DroidKind | null = null;

  private device?: BluetoothDeviceLike;
  private command?: BluetoothRemoteGATTCharacteristicLike;
  private battery?: BluetoothRemoteGATTCharacteristicLike;
  private disconnectHandler?: () => void;

  async connect(): Promise<DroidKind> {
    const bluetooth = (navigator as BluetoothNavigator).bluetooth;
    if (!bluetooth) throw new Error("Web Bluetooth is not supported by this browser");

    const filters = [
      ...R2.namePrefixes.map((namePrefix) => ({ namePrefix })),
      ...BB8.namePrefixes.map((namePrefix) => ({ namePrefix }))
    ];

    const device = await bluetooth.requestDevice({
      filters,
      optionalServices: [
        R2.authService,
        R2.commandService,
        R2.batteryService,
        BB8.bleService,
        BB8.controlService
      ]
    });

    if (!device.gatt) throw new Error("Bluetooth device has no GATT server");

    const detected = detectDroidKind(device.name);
    if (!detected) throw new Error("That Bluetooth device is not a supported R2-D2 or BB-8");

    this.robotKind = detected;
    this.device = device;

    device.addEventListener("gattserverdisconnected", () => {
      this.command = undefined;
      this.battery = undefined;
      this.robotKind = null;
      this.disconnectHandler?.();
    });

    let server: BluetoothRemoteGATTServerLike;
    try {
      server = await device.gatt.connect();
    } catch (error) {
      this.robotKind = null;
      throw new Error(`Bluetooth link failed: ${message(error)}`);
    }

    try {
      if (detected === "bb8") {
        await this.initializeBB8(server);
      } else {
        await this.initializeR2(server);
      }
    } catch (error) {
      device.gatt.disconnect();
      this.command = undefined;
      this.battery = undefined;
      this.robotKind = null;
      throw error;
    }

    return detected;
  }

  private async initializeR2(server: BluetoothRemoteGATTServerLike) {
    const authService = await server.getPrimaryService(R2.authService);
    const auth = await authService.getCharacteristic(R2.authCharacteristic);
    const notify = await authService.getCharacteristic(R2.notifyCharacteristic);

    const commandService = await server.getPrimaryService(R2.commandService);
    this.command = await commandService.getCharacteristic(R2.commandCharacteristic);

    await notify.startNotifications().catch(() => undefined);
    await auth.writeValue(toArrayBuffer(R2.authMessage));
    await this.command.startNotifications().catch(() => undefined);

    try {
      const batteryService = await server.getPrimaryService(R2.batteryService);
      this.battery = await batteryService.getCharacteristic(R2.batteryCharacteristic);
    } catch {
      this.battery = undefined;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  private async initializeBB8(server: BluetoothRemoteGATTServerLike) {
    let bleService: BluetoothRemoteGATTServiceLike;
    try {
      bleService = await server.getPrimaryService(BB8.bleService);
    } catch (error) {
      throw new Error(`BB-8 setup service failed: ${message(error)}`);
    }

    let antiDos: BluetoothRemoteGATTCharacteristicLike;
    let txPower: BluetoothRemoteGATTCharacteristicLike;
    let wake: BluetoothRemoteGATTCharacteristicLike;

    try {
      antiDos = await bleService.getCharacteristic(BB8.antiDosCharacteristic);
      txPower = await bleService.getCharacteristic(BB8.txPowerCharacteristic);
      wake = await bleService.getCharacteristic(BB8.wakeCharacteristic);
    } catch (error) {
      throw new Error(`BB-8 setup characteristics failed: ${message(error)}`);
    }

    // Chrome/Web Bluetooth is happiest with the original Sphero browser order:
    // unlock the legacy BLE service first, then wake the droid, then touch the
    // command/response service. Accessing the control service before this can
    // fail with Chrome's generic "GATT operation failed for unknown reason".
    try {
      await antiDos.writeValue(toArrayBuffer(BB8.antiDosMessage));
    } catch (error) {
      throw new Error(`BB-8 Anti-DOS unlock failed: ${message(error)}`);
    }

    try {
      await txPower.writeValue(toArrayBuffer(new Uint8Array([0x07])));
    } catch (error) {
      throw new Error(`BB-8 TX power setup failed: ${message(error)}`);
    }

    try {
      await wake.writeValue(toArrayBuffer(new Uint8Array([0x01])));
    } catch (error) {
      throw new Error(`BB-8 wake failed: ${message(error)}`);
    }

    // The older BB-8 stack needs a short settle after wake before the control
    // service is consistently usable from Chrome/macOS.
    await new Promise((resolve) => setTimeout(resolve, 500));

    let controlService: BluetoothRemoteGATTServiceLike;
    try {
      controlService = await server.getPrimaryService(BB8.controlService);
    } catch (error) {
      throw new Error(`BB-8 control service failed after wake: ${message(error)}`);
    }

    try {
      this.command = await controlService.getCharacteristic(BB8.commandCharacteristic);
    } catch (error) {
      throw new Error(`BB-8 command channel failed: ${message(error)}`);
    }

    // Responses are useful for battery/telemetry later, but are not required
    // for driving. Some Chrome/macOS combinations reject notification setup on
    // this legacy characteristic, so don't make it a connection blocker.
    try {
      const response = await controlService.getCharacteristic(BB8.responseCharacteristic);
      await response.startNotifications();
    } catch {
      // Continue in command-only mode.
    }

    this.battery = undefined;
  }

  async disconnect() {
    this.device?.gatt?.disconnect();
    this.command = undefined;
    this.battery = undefined;
    this.robotKind = null;
  }

  async send(packet: Uint8Array) {
    if (!this.command) throw new Error("Droid command channel is not ready");

    const buffer = toArrayBuffer(packet);
    if (this.command.writeValueWithoutResponse) {
      await this.command.writeValueWithoutResponse(buffer);
    } else {
      await this.command.writeValue(buffer);
    }
  }

  async readBattery() {
    if (this.robotKind === "bb8") return null;
    if (!this.battery) return null;

    const value = await this.battery.readValue();
    return value.byteLength ? value.getUint8(0) : null;
  }

  onDisconnect(handler: () => void) {
    this.disconnectHandler = handler;
  }
}
