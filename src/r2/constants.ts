export const R2 = {
  namePrefixes: ["D2-", "Q5-"],
  authService: "00020001-574f-4f20-5370-6865726f2121",
  authCharacteristic: "00020005-574f-4f20-5370-6865726f2121",
  notifyCharacteristic: "00020002-574f-4f20-5370-6865726f2121",
  commandService: "00010001-574f-4f20-5370-6865726f2121",
  commandCharacteristic: "00010002-574f-4f20-5370-6865726f2121",
  batteryService: "0000180f-0000-1000-8000-00805f9b34fb",
  batteryCharacteristic: "00002a19-0000-1000-8000-00805f9b34fb",
  authMessage: new TextEncoder().encode("usetheforce...band")
} as const;

export const DeviceId = {
  power: 0x13,
  drive: 0x16,
  animatronic: 0x17,
  io: 0x1a
} as const;

export const Animation = {
  alarm: 7,
  angry: 8,
  excited: 12,
  no: 16,
  yes: 21,
  scan: 22,
  surprised: 24,
  idle1: 25,
  curious: 35,
  happy: 40,
  laugh: 42,
  scared: 48
} as const;

export const Sound = {
  alarm: 1737,
  chatty: 1950,
  excited: 2600,
  positive: 3302,
  scream: 3797
} as const;
