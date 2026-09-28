import { describe, expect, it } from "vitest";
import { R2Controller, R2PacketEncoder } from "./protocol";
import type { R2Transport } from "../transports/types";

class FakeTransport implements R2Transport {
  readonly kind = "native-ble" as const;
  readonly label = "Fake";
  readonly available = true;
  packets: Uint8Array[] = [];

  async connect() {}
  async disconnect() {}
  async send(packet: Uint8Array) {
    this.packets.push(packet);
  }
  async readBattery() {
    return 77;
  }
}

describe("R2PacketEncoder", () => {
  it("builds the expected wake packet and checksum", () => {
    const encoder = new R2PacketEncoder();
    expect(Array.from(encoder.build(0x13, 0x0d))).toEqual([
      0x8d,
      0x0a, 0x13, 0x0d, 0x00, 0xd5,
      0xd8
    ]);
  });

  it("escapes reserved protocol bytes", () => {
    const encoder = new R2PacketEncoder();
    const packet = Array.from(encoder.build(0xab, 0xd8, [0x8d]));

    expect(packet.slice(0, 1)).toEqual([0x8d]);
    expect(packet.slice(-1)).toEqual([0xd8]);
    expect(packet).toEqual(expect.arrayContaining([0xab, 0x23]));
    expect(packet).toEqual(expect.arrayContaining([0xab, 0x50]));
    expect(packet).toEqual(expect.arrayContaining([0xab, 0x05]));
  });
});

describe("R2Controller", () => {
  it("encodes drive speed and heading", async () => {
    const transport = new FakeTransport();
    const controller = new R2Controller(transport);

    await controller.drive(100, 90);

    expect(Array.from(transport.packets[0]!)).toEqual([
      0x8d,
      0x0a, 0x16, 0x07, 0x00, 0x64, 0x00, 0x5a, 0x00, 0x1a,
      0xd8
    ]);
  });

  it("clamps drive values before sending", async () => {
    const transport = new FakeTransport();
    const controller = new R2Controller(transport);

    await controller.drive(999, -90);

    const packet = Array.from(transport.packets[0]!);
    expect(packet).toEqual(expect.arrayContaining([0xff, 0x01, 0x0e]));
  });

  it("builds LED masks in LED-index order", async () => {
    const transport = new FakeTransport();
    const controller = new R2Controller(transport);

    await controller.setFrontLed(10, 20, 30);

    const packet = Array.from(transport.packets[0]!);
    expect(packet).toEqual(expect.arrayContaining([
      0x1a, 0x0e, 0x00,
      0x00, 0x07, 10, 20, 30
    ]));
  });

  it("returns battery values through the transport", async () => {
    const transport = new FakeTransport();
    const controller = new R2Controller(transport);

    await expect(controller.readBattery()).resolves.toBe(77);
  });
});
