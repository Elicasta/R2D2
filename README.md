# R2 Remote

A modern controller for the Sphero Star Wars R2-D2.

## Architecture

One UI, multiple transports:

- **Native iPhone/iPad**: CoreBluetooth direct to R2-D2.
- **Android / compatible Chromium**: Web Bluetooth direct to R2-D2.
- **PWA on iPhone/iPad**: connects to the macOS bridge when available.
- **macOS**: local BLE bridge and controller.

The shared R2 protocol layer is transport-agnostic so drive, dome, stance, lights, audio, animations, battery, wake/sleep, and future sequences behave the same everywhere.

## Repo layout

- `src/r2` Sphero R2-D2 packet protocol and commands
- `src/transports` BLE/LAN transport adapters
- `src/ui` remote UI
- `native/ios` CoreBluetooth bridge target
- `native/macos` macOS BLE/LAN bridge target

## Development

```bash
npm install
npm run dev
```

## Transport priority

1. Native CoreBluetooth when running inside the iOS/macOS shell
2. Web Bluetooth when the browser supports it
3. LAN bridge when configured and reachable
4. Offline/disconnected UI with reconnect controls

R2-D2 advertises with names beginning with `D2-`; R2-Q5 uses `Q5-`.
