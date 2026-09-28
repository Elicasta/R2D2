import Foundation
import WebKit

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

final class R2NativeBridge: NSObject, WKScriptMessageHandler {
    private let bluetooth = R2BluetoothManager()
    private let gameController = R2GameControllerManager()

    weak var webView: WKWebView? {
        didSet {
            if webView != nil {
                gameController.start()
            }
        }
    }

    override init() {
        super.init()

        bluetooth.onDisconnect = { [weak self] in
            DispatchQueue.main.async {
                self?.webView?.evaluateJavaScript(
                    "window.__r2NativeDisconnected && window.__r2NativeDisconnected();"
                )
            }
        }

        gameController.onStatus = { [weak self] status in
            self?.emitJavaScript(function: "window.__r2GamepadStatus", payload: status)
        }

        gameController.onSnapshot = { [weak self] snapshot in
            self?.emitJavaScript(function: "window.__r2GamepadEvent", payload: snapshot)
        }
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard
            message.name == "r2bridge",
            let body = message.body as? [String: Any],
            let action = body["action"] as? String
        else { return }

        let id = body["id"] as? Int ?? 0

        switch action {
        case "connect":
            bluetooth.connect { [weak self] result in
                self?.reply(id: id, result: result.map { _ in NSNull() })
            }

        case "disconnect":
            bluetooth.disconnect { [weak self] in
                self?.reply(id: id, value: NSNull())
            }

        case "send":
            guard
                let packetString = body["packet"] as? String,
                let packet = Data(base64Encoded: packetString)
            else {
                reply(id: id, error: "Invalid R2-D2 packet.")
                return
            }

            bluetooth.send(packet) { [weak self] result in
                self?.reply(id: id, result: result.map { _ in NSNull() })
            }

        case "readBattery":
            bluetooth.readBattery { [weak self] result in
                self?.reply(id: id, result: result.map { $0 as Any })
            }

        case "haptic":
            playHaptic(style: body["style"] as? String ?? "light")
            if id != 0 {
                reply(id: id, value: NSNull())
            }

        case "refreshGamepad":
            gameController.emitCurrentStatus()
            if id != 0 {
                reply(id: id, value: NSNull())
            }

        default:
            reply(id: id, error: "Unknown native action: \(action)")
        }
    }

    private func reply<T>(id: Int, result: Result<T, Error>) {
        switch result {
        case .success(let value):
            reply(id: id, value: value)
        case .failure(let error):
            reply(id: id, error: error.localizedDescription)
        }
    }

    private func reply(id: Int, value: Any) {
        emit([
            "id": id,
            "ok": true,
            "value": value
        ])
    }

    private func reply(id: Int, error: String) {
        emit([
            "id": id,
            "ok": false,
            "error": error
        ])
    }

    private func emit(_ payload: [String: Any]) {
        emitJavaScript(function: "window.__r2NativeResolve", payload: payload)
    }

    private func emitJavaScript(function: String, payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8)
        else { return }

        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(
                "\(function) && \(function)(\(json));"
            )
        }
    }

    private func playHaptic(style: String) {
        #if os(iOS)
        let impactStyle: UIImpactFeedbackGenerator.FeedbackStyle
        switch style {
        case "heavy":
            impactStyle = .heavy
        case "medium":
            impactStyle = .medium
        default:
            impactStyle = .light
        }

        let generator = UIImpactFeedbackGenerator(style: impactStyle)
        generator.prepare()
        generator.impactOccurred()
        #elseif os(macOS)
        NSHapticFeedbackManager.defaultPerformer.perform(
            .alignment,
            performanceTime: .now
        )
        #endif
    }
}
