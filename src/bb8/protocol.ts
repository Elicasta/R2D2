import { BB8Command, BB8DeviceId } from "./constants";
import type { R2Transport } from "../transports/types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function u16(value: number): number[] {
  const v = Math.round(value) & 0xffff;
  return [(v >> 8) & 0xff, v & 0xff];
}

export class BB8PacketEncoder {
  private sequence = 0;

  build(device: number, command: number, payload: number[] = []): Uint8Array {
    const seq = this.sequence & 0xff;
    this.sequence = (this.sequence + 1) & 0xff;

    const dlen = payload.length + 1;
    const sum = [device & 0xff, command & 0xff, seq, dlen, ...payload]
      .reduce((total, byte) => total + byte, 0);
    const checksum = (~(sum & 0xff)) & 0xff;

    return new Uint8Array([
      0xff,
      0xff,
      device & 0xff,
      command & 0xff,
      seq,
      dlen,
      ...payload.map((byte) => byte & 0xff),
      checksum
    ]);
  }
}

export class BB8Controller {
  private readonly encoder = new BB8PacketEncoder();
  private heading = 0;

  constructor(public readonly transport: R2Transport) {}

  private command(device: number, command: number, payload: number[] = []) {
    return this.transport.send(this.encoder.build(device, command, payload));
  }

  ping() {
    return this.command(BB8DeviceId.core, BB8Command.ping);
  }

  sleep() {
    return this.command(BB8DeviceId.core, BB8Command.sleep, [0, 0, 0, 0, 0]);
  }

  setHeading(heading: number) {
    this.heading = ((Math.round(heading) % 360) + 360) % 360;
    return this.command(BB8DeviceId.sphero, BB8Command.setHeading, u16(this.heading));
  }

  setStabilization(enabled: boolean) {
    return this.command(BB8DeviceId.sphero, BB8Command.stabilization, [enabled ? 1 : 0]);
  }

  drive(speed: number, heading: number) {
    const safeSpeed = Math.round(clamp(speed, 0, 255));
    this.heading = ((Math.round(heading) % 360) + 360) % 360;
    return this.command(BB8DeviceId.sphero, BB8Command.roll, [
      safeSpeed,
      ...u16(this.heading),
      0x01
    ]);
  }

  stop() {
    return this.command(BB8DeviceId.sphero, BB8Command.roll, [
      0,
      ...u16(this.heading),
      0x01
    ]);
  }

  setBodyLed(r: number, g: number, b: number) {
    return this.command(BB8DeviceId.sphero, BB8Command.setRgb, [
      Math.round(clamp(r, 0, 255)),
      Math.round(clamp(g, 0, 255)),
      Math.round(clamp(b, 0, 255))
    ]);
  }

  setRearLed(brightness: number) {
    return this.command(BB8DeviceId.sphero, BB8Command.setBackLed, [
      Math.round(clamp(brightness, 0, 255))
    ]);
  }

  async startCalibration() {
    await this.setStabilization(false);
    await this.setRearLed(255);
  }

  async finishCalibration() {
    await this.setHeading(0);
    await this.setRearLed(0);
    await this.setStabilization(true);
  }
}
