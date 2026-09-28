export const BB8 = {
  namePrefixes: ["BB"],
  bleService: "22bb746f-2bb0-7554-2d6f-726568705327",
  controlService: "22bb746f-2ba0-7554-2d6f-726568705327",
  antiDosCharacteristic: "22bb746f-2bbd-7554-2d6f-726568705327",
  txPowerCharacteristic: "22bb746f-2bb2-7554-2d6f-726568705327",
  wakeCharacteristic: "22bb746f-2bbf-7554-2d6f-726568705327",
  commandCharacteristic: "22bb746f-2ba1-7554-2d6f-726568705327",
  responseCharacteristic: "22bb746f-2ba6-7554-2d6f-726568705327",
  antiDosMessage: new TextEncoder().encode("011i3")
} as const;

export const BB8DeviceId = {
  core: 0x00,
  sphero: 0x02
} as const;

export const BB8Command = {
  ping: 0x01,
  sleep: 0x22,
  setHeading: 0x01,
  stabilization: 0x02,
  setRgb: 0x20,
  setBackLed: 0x21,
  roll: 0x30
} as const;
