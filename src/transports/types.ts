export type TransportKind = "native-ble" | "web-bluetooth" | "mac-bridge";

export type R2ConnectionState =
  | "idle"
  | "scanning"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface R2Transport {
  readonly kind: TransportKind;
  readonly label: string;
  readonly available: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(packet: Uint8Array): Promise<void>;
  readBattery(): Promise<number | null>;
  onDisconnect?(handler: () => void): void;
}

export type TransportFactory = () => R2Transport;
