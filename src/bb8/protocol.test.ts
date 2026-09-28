import { describe, expect, it } from "vitest";
import { BB8PacketEncoder, BB8Controller } from "./protocol";
import type { DroidKind, R2Transport } from "../transports/types";

class TestTransport implements R2Transport {
  readonly kind = "native-ble" as const;
  readonly label = "test";
  readonly available = true;
  robotKind: DroidKind | null = "bb8";
  packets: Uint8Array[] = [];

  async connect() { return "bb8" as const; }
  async disconnect() {}
  async send(packet: Uint8Array) { this.packets.push(packet); }
  async readBattery() { return null; }
}

describe("BB-8 v1 packets", () => {
  it("builds a ping packet with checksum", () => {
    const encoder = new BB8PacketEncoder();
    expect(Array.from(encoder.build(0x00, 0x01))).toEqual([
      0xff, 0xff, 0x00, 0x01, 0x00, 0x01, 0xfd
    ]);
  });

  it("builds a roll packet with speed and big-endian heading", async () => {
    const transport = new TestTransport();
    const bb8 = new BB8Controller(transport);

    await bb8.drive(100, 90);

    expect(Array.from(transport.packets[0]!)).toEqual([
      0xff, 0xff, 0x02, 0x30, 0x00, 0x05, 0x64, 0x00, 0x5a, 0x01, 0x09
    ]);
  });

  it("stops at the current heading", async () => {
    const transport = new TestTransport();
    const bb8 = new BB8Controller(transport);

    await bb8.drive(100, 270);
    await bb8.stop();

    expect(Array.from(transport.packets[1]!).slice(6, 10)).toEqual([
      0x00, 0x01, 0x0e, 0x01
    ]);
  });
});
