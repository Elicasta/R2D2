# R2 Remote

A modern controller for the Sphero Star Wars R2-D2.

## What works in this first build

- iPhone/iPad native app shell with direct CoreBluetooth
- macOS native app shell with direct CoreBluetooth
- installable web/PWA controller
- Android/compatible Chromium direct Web Bluetooth
- R2-D2 authentication handshake
- drive + heading with dead-man stop
- dome position
- tripod, bipod, waddle, stop stance controls
- animations
- built-in R2 audio
- front/back LEDs, logic display, holo projector
- volume
- wake/sleep
- battery read when the standard battery characteristic is exposed
- native iPhone haptics
- queued CoreBluetooth writes so fast joystick input does not flood the BLE channel

## iPhone note

Safari on iPhone does not expose Web Bluetooth. The installable PWA is still useful as the shared web controller, but **direct iPhone Bluetooth uses the native R2 Remote app**. The native app embeds the same UI, so it does not become a separate product to maintain.

A LAN Mac bridge can be added later if we want the Safari/PWA build to control R2 through a nearby Mac.

## Architecture

```text
Shared TypeScript UI + R2 protocol
          |
          +-- Native iPhone/iPad shell -> CoreBluetooth -> R2-D2
          |
          +-- Native Mac shell --------> CoreBluetooth -> R2-D2
          |
          +-- Android/Chromium PWA ----> Web Bluetooth -> R2-D2
```

The R2 packet protocol lives once in `src/r2`. Native Apple code only owns Bluetooth transport, permissions, and haptics.

## Repo layout

- `src/r2` R2 packet encoder and high-level commands
- `src/transports` native bridge and Web Bluetooth transports
- `src/main.ts` shared controller behavior
- `src/styles.css` shared controller UI
- `native/Apple` shared SwiftUI/CoreBluetooth app source + XcodeGen spec
- `native/Shared/WebApp` generated web bundle embedded into the native apps
- `scripts/sync-native-web.sh` builds the web UI for the native shells
- `scripts/bootstrap-apple.sh` prepares the Apple project

## Web development

```bash
npm install
npm test
npm run dev
```

## Build the Apple project

On a Mac with Xcode installed:

```bash
git clone https://github.com/Elicasta/R2D2.git
cd R2D2
bash scripts/bootstrap-apple.sh
open native/Apple/R2Remote.xcodeproj
```

In Xcode:

1. Choose **R2Remote-iOS** for iPhone/iPad or **R2Remote-macOS** for Mac.
2. For a physical iPhone, select your Apple Development Team under Signing.
3. Run the app.
4. Grant Bluetooth permission.
5. Wake R2-D2 and tap **Connect**.

R2-D2 normally advertises with a name beginning with `D2-`. R2-Q5 uses `Q5-`.
