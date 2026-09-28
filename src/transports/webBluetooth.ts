import { R2 } from "../r2/constants";
import type { R2Transport } from "./types";

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

export class WebBluetoothTransport implements R2Transport {
  readonly kind = "web-bluetooth" as const;
  readonly label = "Direct Bluetooth";
  readonly available = Boolean((navigator as BluetoothNavigator).bluetooth);

  private device?: BluetoothDeviceLike;
  private command?: BluetoothRemoteGATTCharacteristicLike;
  private battery?: BluetoothRemoteGATTCharacteristicLike;
  private disconnectHandler?: () => void;

  async connect() {
    const bluetooth = (navigator as BluetoothNavigator).bluetooth;
    if (!bluetooth) throw new Error("Web Bluetooth is not supported by this browser");

    const device = await bluetooth.requestDevice({
      filters: R2.namePrefixes.map((namePrefix) => ({ namePrefix })),
      optionalServices: [R2.authService, R2.commandService, R2.batteryService]
    });

    if (!device.gatt) throw new Error("Bluetooth device has no GATT server");
    this.device = device;
    device.addEventListener("gattserverdisconnected", () => this.disconnectHandler?.());

    const server = await device.gatt.connect();
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

  async disconnect() {
    this.device?.gatt?.disconnect();
    this.command = undefined;
    this.battery = undefined;
  }

  async send(packet: Uint8Array) {
    if (!this.command) throw new Error("R2-D2 is not connected");
    const buffer = toArrayBuffer(packet);
    if (this.command.writeValueWithoutResponse) {
      await this.command.writeValueWithoutResponse(buffer);
    } else {
      await this.command.writeValue(buffer);
    }
  }

  async readBattery() {
    if (!this.battery) return null;
    const value = await this.battery.readValue();
    return value.byteLength ? value.getUint8(0) : null;
  }

  onDisconnect(handler: () => void) {
    this.disconnectHandler = handler;
  }
}
