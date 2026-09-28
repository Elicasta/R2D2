import Foundation
import GameController

final class R2GameControllerManager {
    var onStatus: (([String: Any]) -> Void)?
    var onSnapshot: (([String: Any]) -> Void)?

    private weak var controller: GCController?
    private var connectObserver: NSObjectProtocol?
    private var disconnectObserver: NSObjectProtocol?
    private var started = false

    init() {
        connectObserver = NotificationCenter.default.addObserver(
            forName: .GCControllerDidConnect,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let controller = notification.object as? GCController else { return }
            self?.attach(controller)
        }

        disconnectObserver = NotificationCenter.default.addObserver(
            forName: .GCControllerDidDisconnect,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let controller = notification.object as? GCController else { return }
            self?.detach(controller)
        }
    }

    deinit {
        if let connectObserver {
            NotificationCenter.default.removeObserver(connectObserver)
        }
        if let disconnectObserver {
            NotificationCenter.default.removeObserver(disconnectObserver)
        }
    }

    func start() {
        guard !started else {
            emitCurrentStatus()
            return
        }

        started = true
        GCController.startWirelessControllerDiscovery(completionHandler: nil)

        if let existing = GCController.controllers().first(where: { $0.extendedGamepad != nil }) {
            attach(existing)
        } else {
            emitStatus(connected: false, name: "Xbox Controller")
        }
    }

    func emitCurrentStatus() {
        guard let controller else {
            emitStatus(connected: false, name: "Xbox Controller")
            return
        }

        emitStatus(
            connected: true,
            name: controller.vendorName ?? "Xbox Controller"
        )
        emitSnapshot()
    }

    private func attach(_ controller: GCController) {
        guard let gamepad = controller.extendedGamepad else { return }

        self.controller = controller

        gamepad.valueChangedHandler = { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.emitSnapshot()
            }
        }

        emitStatus(
            connected: true,
            name: controller.vendorName ?? "Xbox Controller"
        )
        emitSnapshot()
    }

    private func detach(_ controller: GCController) {
        guard self.controller === controller else { return }

        controller.extendedGamepad?.valueChangedHandler = nil
        self.controller = nil

        emitStatus(
            connected: false,
            name: controller.vendorName ?? "Xbox Controller"
        )
        emitNeutralSnapshot()
    }

    private func emitStatus(connected: Bool, name: String) {
        onStatus?([
            "connected": connected,
            "name": name
        ])
    }

    private func emitSnapshot() {
        guard let gamepad = controller?.extendedGamepad else {
            emitNeutralSnapshot()
            return
        }

        let buttons: [String: Bool] = [
            "a": gamepad.buttonA.isPressed,
            "b": gamepad.buttonB.isPressed,
            "x": gamepad.buttonX.isPressed,
            "y": gamepad.buttonY.isPressed,
            "lb": gamepad.leftShoulder.isPressed,
            "rb": gamepad.rightShoulder.isPressed,
            "view": gamepad.buttonOptions?.isPressed ?? false,
            "menu": gamepad.buttonMenu.isPressed,
            "leftStick": gamepad.leftThumbstickButton?.isPressed ?? false,
            "rightStick": gamepad.rightThumbstickButton?.isPressed ?? false,
            "dpadUp": gamepad.dpad.up.isPressed,
            "dpadDown": gamepad.dpad.down.isPressed,
            "dpadLeft": gamepad.dpad.left.isPressed,
            "dpadRight": gamepad.dpad.right.isPressed
        ]

        onSnapshot?([
            "kind": "snapshot",
            "leftX": Double(gamepad.leftThumbstick.xAxis.value),
            "leftY": Double(gamepad.leftThumbstick.yAxis.value),
            "rightX": Double(gamepad.rightThumbstick.xAxis.value),
            "rightY": Double(gamepad.rightThumbstick.yAxis.value),
            "leftTrigger": Double(gamepad.leftTrigger.value),
            "rightTrigger": Double(gamepad.rightTrigger.value),
            "buttons": buttons
        ])
    }

    private func emitNeutralSnapshot() {
        onSnapshot?([
            "kind": "snapshot",
            "leftX": 0.0,
            "leftY": 0.0,
            "rightX": 0.0,
            "rightY": 0.0,
            "leftTrigger": 0.0,
            "rightTrigger": 0.0,
            "buttons": [
                "a": false,
                "b": false,
                "x": false,
                "y": false,
                "lb": false,
                "rb": false,
                "view": false,
                "menu": false,
                "leftStick": false,
                "rightStick": false,
                "dpadUp": false,
                "dpadDown": false,
                "dpadLeft": false,
                "dpadRight": false
            ]
        ])
    }
}
