import { BB8Controller } from "../bb8/protocol";
import { Animation, DeviceId, Sound } from "./constants";
import type { DroidKind, R2Transport } from "../transports/types";

const START = 0x8d;
const ESCAPE = 0xab;
const END = 0xd8;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function u16(value: number): number[] {
  const v = Math.round(value) & 0xffff;
  return [(v >> 8) & 0xff, v & 0xff];
}

function float32be(value: number): number[] {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, false);
  return Array.from(new Uint8Array(buffer));
}

export class R2PacketEncoder {
  private sequence = 0;

  build(device: number, command: number, payload: number[] = []): Uint8Array {
    const body = [0x0a, device & 0xff, command & 0xff, this.sequence & 0xff, ...payload];
    body.push((0xff - (body.reduce((sum, byte) => sum + byte, 0) & 0xff)) & 0xff);
    this.sequence = (this.sequence + 1) % 0xff;

    const escaped: number[] = [];
    for (const byte of body) {
      if (byte === ESCAPE) escaped.push(ESCAPE, 0x23);
      else if (byte === START) escaped.push(ESCAPE, 0x05);
      else if (byte === END) escaped.push(ESCAPE, 0x50);
      else escaped.push(byte);
    }

    return new Uint8Array([START, ...escaped, END]);
  }
}

export class R2Controller {
  private readonly encoder = new R2PacketEncoder();
  private readonly bb8: BB8Controller;

  constructor(public readonly transport: R2Transport) {
    this.bb8 = new BB8Controller(transport);
  }

  get robotKind(): DroidKind | null {
    return this.transport.robotKind;
  }

  get isBB8() {
    return this.robotKind === "bb8";
  }

  async connect(): Promise<DroidKind> {
    const kind = await this.transport.connect();

    if (kind === "r2d2") {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await this.wake();
    } else {
      await this.bb8.setStabilization(true);
      await this.bb8.setRearLed(0);
    }

    return kind;
  }

  disconnect() {
    return this.transport.disconnect();
  }

  private command(device: number, command: number, payload: number[] = []) {
    return this.transport.send(this.encoder.build(device, command, payload));
  }

  wake() {
    if (this.isBB8) return this.bb8.ping();
    return this.command(DeviceId.power, 0x0d);
  }

  sleep() {
    if (this.isBB8) return this.bb8.sleep();
    return this.command(DeviceId.power, 0x01);
  }

  resetYaw() {
    if (this.isBB8) return this.bb8.finishCalibration();
    return this.command(DeviceId.drive, 0x06);
  }

  drive(speed: number, heading: number, flags = 0) {
    if (this.isBB8) return this.bb8.drive(speed, heading);

    const safeSpeed = Math.round(clamp(speed, 0, 255));
    const safeHeading = ((Math.round(heading) % 360) + 360) % 360;
    return this.command(DeviceId.drive, 0x07, [
      safeSpeed,
      ...u16(safeHeading),
      flags & 0xff
    ]);
  }

  stop() {
    if (this.isBB8) return this.bb8.stop();
    return this.drive(0, 0);
  }

  setStance(stance: "stop" | "tripod" | "bipod" | "waddle") {
    if (this.isBB8) return Promise.resolve();
    const value = { stop: 0, tripod: 1, bipod: 2, waddle: 3 }[stance];
    return this.command(DeviceId.animatronic, 0x0d, [value]);
  }

  setHeadPosition(degrees: number) {
    if (this.isBB8) return Promise.resolve();
    return this.command(
      DeviceId.animatronic,
      0x0f,
      float32be(clamp(degrees, -160, 180))
    );
  }

  playAnimation(animation: number | keyof typeof Animation) {
    if (this.isBB8) return Promise.resolve();
    const id = typeof animation === "number" ? animation : Animation[animation];
    return this.command(DeviceId.animatronic, 0x05, u16(id));
  }

  stopAnimation() {
    if (this.isBB8) return Promise.resolve();
    return this.command(DeviceId.animatronic, 0x2b);
  }

  setIdleAnimations(enabled: boolean) {
    if (this.isBB8) return Promise.resolve();
    return this.command(DeviceId.animatronic, 0x2c, [enabled ? 1 : 0]);
  }

  playSound(sound: number | keyof typeof Sound, mode = 0) {
    if (this.isBB8) return Promise.resolve();
    const id = typeof sound === "number" ? sound : Sound[sound];
    return this.command(DeviceId.io, 0x07, [...u16(id), clamp(mode, 0, 2)]);
  }

  setVolume(volume: number) {
    if (this.isBB8) return Promise.resolve();
    return this.command(DeviceId.io, 0x08, [Math.round(clamp(volume, 0, 255))]);
  }

  stopAudio() {
    if (this.isBB8) return Promise.resolve();
    return this.command(DeviceId.io, 0x0a);
  }

  private setLeds(entries: Array<[number, number]>) {
    let mask = 0;
    const values: number[] = [];
    for (const [index, value] of [...entries].sort((a, b) => a[0] - b[0])) {
      mask |= 1 << index;
      values.push(Math.round(clamp(value, 0, 255)));
    }
    return this.command(DeviceId.io, 0x0e, [...u16(mask), ...values]);
  }

  setFrontLed(r: number, g: number, b: number) {
    if (this.isBB8) return this.bb8.setBodyLed(r, g, b);
    return this.setLeds([[0, r], [1, g], [2, b]]);
  }

  setBackLed(r: number, g: number, b: number) {
    if (this.isBB8) return this.bb8.setRearLed(Math.max(r, g, b));
    return this.setLeds([[4, r], [5, g], [6, b]]);
  }

  setLogicDisplay(brightness: number) {
    if (this.isBB8) return Promise.resolve();
    return this.setLeds([[3, brightness]]);
  }

  setHoloProjector(brightness: number) {
    if (this.isBB8) return this.bb8.setRearLed(brightness);
    return this.setLeds([[7, brightness]]);
  }

  startCalibration() {
    if (!this.isBB8) return Promise.resolve();
    return this.bb8.startCalibration();
  }

  finishCalibration() {
    if (!this.isBB8) return Promise.resolve();
    return this.bb8.finishCalibration();
  }

  setBB8RearLed(brightness: number) {
    if (!this.isBB8) return Promise.resolve();
    return this.bb8.setRearLed(brightness);
  }

  readBattery() {
    return this.transport.readBattery();
  }
}
