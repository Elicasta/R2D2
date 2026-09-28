import Foundation
import CoreBluetooth

final class R2BluetoothManager: NSObject {
    enum DroidKind: String {
        case r2d2
        case bb8
    }

    enum DroidError: LocalizedError {
        case bluetoothUnavailable
        case deviceNotFound
        case connectionFailed(String)
        case commandUnavailable
        case batteryUnavailable
        case invalidPacket

        var errorDescription: String? {
            switch self {
            case .bluetoothUnavailable:
                return "Bluetooth is unavailable."
            case .deviceNotFound:
                return "No supported R2-D2 or BB-8 was found. Make sure the droid is awake and nearby."
            case .connectionFailed(let message):
                return "Bluetooth connection failed: \(message)"
            case .commandUnavailable:
                return "Droid command channel is not ready."
            case .batteryUnavailable:
                return "Battery status is unavailable for this droid."
            case .invalidPacket:
                return "Invalid droid command packet."
            }
        }
    }

    private struct QueuedWrite {
        let data: Data
        let completion: (Result<Void, Error>) -> Void
    }

    private enum UUIDs {
        // R2-D2 / Q5 (Sphero V2)
        static let r2AuthService = CBUUID(string: "00020001-574F-4F20-5370-6865726F2121")
        static let r2AuthCharacteristic = CBUUID(string: "00020005-574F-4F20-5370-6865726F2121")
        static let r2NotifyCharacteristic = CBUUID(string: "00020002-574F-4F20-5370-6865726F2121")
        static let r2CommandService = CBUUID(string: "00010001-574F-4F20-5370-6865726F2121")
        static let r2CommandCharacteristic = CBUUID(string: "00010002-574F-4F20-5370-6865726F2121")
        static let batteryService = CBUUID(string: "180F")
        static let batteryCharacteristic = CBUUID(string: "2A19")

        // BB-8 (legacy Sphero BLE / V1 packet protocol)
        static let bb8BLEService = CBUUID(string: "22BB746F-2BB0-7554-2D6F-726568705327")
        static let bb8ControlService = CBUUID(string: "22BB746F-2BA0-7554-2D6F-726568705327")
        static let bb8AntiDosCharacteristic = CBUUID(string: "22BB746F-2BBD-7554-2D6F-726568705327")
        static let bb8TxPowerCharacteristic = CBUUID(string: "22BB746F-2BB2-7554-2D6F-726568705327")
        static let bb8WakeCharacteristic = CBUUID(string: "22BB746F-2BBF-7554-2D6F-726568705327")
        static let bb8CommandCharacteristic = CBUUID(string: "22BB746F-2BA1-7554-2D6F-726568705327")
        static let bb8ResponseCharacteristic = CBUUID(string: "22BB746F-2BA6-7554-2D6F-726568705327")
    }

    private lazy var central = CBCentralManager(delegate: self, queue: .main)

    private var peripheral: CBPeripheral?
    private var droidKind: DroidKind?

    private var r2AuthCharacteristic: CBCharacteristic?
    private var r2NotifyCharacteristic: CBCharacteristic?
    private var commandCharacteristic: CBCharacteristic?
    private var batteryCharacteristic: CBCharacteristic?

    private var bb8AntiDosCharacteristic: CBCharacteristic?
    private var bb8TxPowerCharacteristic: CBCharacteristic?
    private var bb8WakeCharacteristic: CBCharacteristic?
    private var bb8ResponseCharacteristic: CBCharacteristic?

    private var connectCompletion: ((Result<DroidKind, Error>) -> Void)?
    private var batteryCompletion: ((Result<Int, Error>) -> Void)?
    private var scanTimeout: DispatchWorkItem?

    private var didInitializeProtocol = false
    private var didFinishConnection = false
    private var connected = false
    private var waitingForBB8Notifications = false

    private var handshakeWriteUUID: CBUUID?
    private var handshakeContinuation: (() -> Void)?

    private var writeQueue: [QueuedWrite] = []
    private var responseWriteCompletion: ((Result<Void, Error>) -> Void)?

    var onDisconnect: (() -> Void)?

    override init() {
        super.init()
        _ = central
    }

    func connect(completion: @escaping (Result<DroidKind, Error>) -> Void) {
        if connected,
           let droidKind,
           let peripheral,
           peripheral.state == .connected,
           commandCharacteristic != nil {
            completion(.success(droidKind))
            return
        }

        resetConnectionState()
        connectCompletion = completion

        guard central.state == .poweredOn else {
            if central.state == .unsupported || central.state == .unauthorized || central.state == .poweredOff {
                finishConnect(.failure(DroidError.bluetoothUnavailable))
            }
            return
        }

        beginScan()
    }

    func disconnect(completion: (() -> Void)? = nil) {
        scanTimeout?.cancel()
        central.stopScan()
        failPendingWrites(with: DroidError.commandUnavailable)

        guard let peripheral else {
            resetConnectionState()
            completion?()
            return
        }

        central.cancelPeripheralConnection(peripheral)
        resetConnectionState()
        completion?()
    }

    func send(_ data: Data, completion: @escaping (Result<Void, Error>) -> Void) {
        guard !data.isEmpty else {
            completion(.failure(DroidError.invalidPacket))
            return
        }

        guard connected,
              let peripheral,
              peripheral.state == .connected,
              commandCharacteristic != nil
        else {
            completion(.failure(DroidError.commandUnavailable))
            return
        }

        writeQueue.append(QueuedWrite(data: data, completion: completion))
        drainWriteQueue()
    }

    func readBattery(completion: @escaping (Result<Int, Error>) -> Void) {
        guard droidKind == .r2d2 else {
            completion(.failure(DroidError.batteryUnavailable))
            return
        }

        guard let peripheral,
              peripheral.state == .connected,
              let batteryCharacteristic
        else {
            completion(.failure(DroidError.batteryUnavailable))
            return
        }

        batteryCompletion = completion
        peripheral.readValue(for: batteryCharacteristic)

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            guard let self, self.batteryCompletion != nil else { return }
            let pending = self.batteryCompletion
            self.batteryCompletion = nil
            pending?(.failure(DroidError.batteryUnavailable))
        }
    }

    private func beginScan() {
        guard !central.isScanning else { return }

        central.scanForPeripherals(
            withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )

        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.peripheral == nil else { return }
            self.central.stopScan()
            self.finishConnect(.failure(DroidError.deviceNotFound))
        }

        scanTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: timeout)
    }

    private func resetConnectionState() {
        scanTimeout?.cancel()
        scanTimeout = nil

        peripheral = nil
        droidKind = nil

        r2AuthCharacteristic = nil
        r2NotifyCharacteristic = nil
        commandCharacteristic = nil
        batteryCharacteristic = nil

        bb8AntiDosCharacteristic = nil
        bb8TxPowerCharacteristic = nil
        bb8WakeCharacteristic = nil
        bb8ResponseCharacteristic = nil

        batteryCompletion = nil
        didInitializeProtocol = false
        didFinishConnection = false
        connected = false
        waitingForBB8Notifications = false

        handshakeWriteUUID = nil
        handshakeContinuation = nil

        writeQueue.removeAll()
        responseWriteCompletion = nil
    }

    private func finishConnect(_ result: Result<DroidKind, Error>) {
        guard !didFinishConnection else { return }
        didFinishConnection = true
        scanTimeout?.cancel()
        scanTimeout = nil

        switch result {
        case .success(let kind):
            connected = true
            droidKind = kind
        case .failure:
            connected = false
        }

        let completion = connectCompletion
        connectCompletion = nil
        completion?(result)
    }

    private func initializeProtocolIfReady() {
        guard !didInitializeProtocol else { return }

        switch droidKind {
        case .r2d2:
            initializeR2IfReady()
        case .bb8:
            initializeBB8IfReady()
        case .none:
            break
        }
    }

    private func initializeR2IfReady() {
        guard
            let peripheral,
            let r2AuthCharacteristic,
            let commandCharacteristic
        else { return }

        didInitializeProtocol = true

        if let r2NotifyCharacteristic {
            peripheral.setNotifyValue(true, for: r2NotifyCharacteristic)
        }

        if commandCharacteristic.properties.contains(.notify) {
            peripheral.setNotifyValue(true, for: commandCharacteristic)
        }

        let auth = Data("usetheforce...band".utf8)
        let writeType: CBCharacteristicWriteType =
            r2AuthCharacteristic.properties.contains(.write) ? .withResponse : .withoutResponse

        peripheral.writeValue(auth, for: r2AuthCharacteristic, type: writeType)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            self?.finishConnect(.success(.r2d2))
        }
    }

    private func initializeBB8IfReady() {
        guard
            let peripheral,
            bb8AntiDosCharacteristic != nil,
            bb8TxPowerCharacteristic != nil,
            bb8WakeCharacteristic != nil,
            commandCharacteristic != nil,
            let response = bb8ResponseCharacteristic
        else { return }

        didInitializeProtocol = true
        waitingForBB8Notifications = true
        peripheral.setNotifyValue(true, for: response)
    }

    private func startBB8Handshake() {
        guard
            let antiDos = bb8AntiDosCharacteristic,
            let txPower = bb8TxPowerCharacteristic,
            let wake = bb8WakeCharacteristic
        else {
            finishConnect(.failure(DroidError.connectionFailed("BB-8 handshake characteristics are missing.")))
            return
        }

        writeHandshake(Data("011i3".utf8), to: antiDos) { [weak self] in
            guard let self else { return }
            self.writeHandshake(Data([0x07]), to: txPower) { [weak self] in
                guard let self else { return }
                self.writeHandshake(Data([0x01]), to: wake) { [weak self] in
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        self?.finishConnect(.success(.bb8))
                    }
                }
            }
        }
    }

    private func writeHandshake(
        _ data: Data,
        to characteristic: CBCharacteristic,
        completion: @escaping () -> Void
    ) {
        guard let peripheral else {
            finishConnect(.failure(DroidError.connectionFailed("Droid disconnected during initialization.")))
            return
        }

        if characteristic.properties.contains(.write) {
            handshakeWriteUUID = characteristic.uuid
            handshakeContinuation = completion
            peripheral.writeValue(data, for: characteristic, type: .withResponse)
        } else if characteristic.properties.contains(.writeWithoutResponse) {
            peripheral.writeValue(data, for: characteristic, type: .withoutResponse)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.06, execute: completion)
        } else {
            finishConnect(.failure(DroidError.connectionFailed("A BB-8 setup characteristic is not writable.")))
        }
    }

    private func drainWriteQueue() {
        guard
            connected,
            let peripheral,
            peripheral.state == .connected,
            let characteristic = commandCharacteristic,
            !writeQueue.isEmpty
        else { return }

        if characteristic.properties.contains(.writeWithoutResponse) {
            guard peripheral.canSendWriteWithoutResponse else { return }

            let write = writeQueue.removeFirst()
            peripheral.writeValue(write.data, for: characteristic, type: .withoutResponse)
            write.completion(.success(()))

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.01) { [weak self] in
                self?.drainWriteQueue()
            }
            return
        }

        guard responseWriteCompletion == nil else { return }
        let write = writeQueue.removeFirst()
        responseWriteCompletion = write.completion
        peripheral.writeValue(write.data, for: characteristic, type: .withResponse)
    }

    private func failPendingWrites(with error: Error) {
        let queued = writeQueue
        writeQueue.removeAll()
        queued.forEach { $0.completion(.failure(error)) }

        let response = responseWriteCompletion
        responseWriteCompletion = nil
        response?(.failure(error))

        handshakeContinuation = nil
        handshakeWriteUUID = nil
    }
}

extension R2BluetoothManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard connectCompletion != nil else { return }

        switch central.state {
        case .poweredOn:
            beginScan()
        case .unsupported, .unauthorized, .poweredOff:
            finishConnect(.failure(DroidError.bluetoothUnavailable))
        default:
            break
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        let name = advertisedName ?? peripheral.name ?? ""

        let kind: DroidKind?
        if name.hasPrefix("D2-") || name.hasPrefix("Q5-") {
            kind = .r2d2
        } else if name.uppercased().hasPrefix("BB") {
            kind = .bb8
        } else {
            kind = nil
        }

        guard let kind else { return }

        self.droidKind = kind
        self.peripheral = peripheral
        peripheral.delegate = self

        scanTimeout?.cancel()
        central.stopScan()
        central.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        switch droidKind {
        case .r2d2:
            peripheral.discoverServices([
                UUIDs.r2AuthService,
                UUIDs.r2CommandService,
                UUIDs.batteryService
            ])
        case .bb8:
            peripheral.discoverServices([
                UUIDs.bb8BLEService,
                UUIDs.bb8ControlService
            ])
        case .none:
            finishConnect(.failure(DroidError.connectionFailed("Unknown droid type.")))
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        finishConnect(.failure(DroidError.connectionFailed(error?.localizedDescription ?? "Unknown error")))
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        let wasConnected = connected
        failPendingWrites(with: DroidError.commandUnavailable)
        resetConnectionState()

        if wasConnected {
            onDisconnect?()
        }
    }
}

extension R2BluetoothManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            finishConnect(.failure(DroidError.connectionFailed(error.localizedDescription)))
            return
        }

        peripheral.services?.forEach { service in
            switch service.uuid {
            case UUIDs.r2AuthService:
                peripheral.discoverCharacteristics([
                    UUIDs.r2AuthCharacteristic,
                    UUIDs.r2NotifyCharacteristic
                ], for: service)

            case UUIDs.r2CommandService:
                peripheral.discoverCharacteristics([
                    UUIDs.r2CommandCharacteristic
                ], for: service)

            case UUIDs.batteryService:
                peripheral.discoverCharacteristics([
                    UUIDs.batteryCharacteristic
                ], for: service)

            case UUIDs.bb8BLEService:
                peripheral.discoverCharacteristics([
                    UUIDs.bb8AntiDosCharacteristic,
                    UUIDs.bb8TxPowerCharacteristic,
                    UUIDs.bb8WakeCharacteristic
                ], for: service)

            case UUIDs.bb8ControlService:
                peripheral.discoverCharacteristics([
                    UUIDs.bb8CommandCharacteristic,
                    UUIDs.bb8ResponseCharacteristic
                ], for: service)

            default:
                break
            }
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        if let error {
            if service.uuid == UUIDs.batteryService {
                batteryCharacteristic = nil
                initializeProtocolIfReady()
                return
            }

            finishConnect(.failure(DroidError.connectionFailed(error.localizedDescription)))
            return
        }

        service.characteristics?.forEach { characteristic in
            switch characteristic.uuid {
            case UUIDs.r2AuthCharacteristic:
                r2AuthCharacteristic = characteristic
            case UUIDs.r2NotifyCharacteristic:
                r2NotifyCharacteristic = characteristic
            case UUIDs.r2CommandCharacteristic:
                commandCharacteristic = characteristic
            case UUIDs.batteryCharacteristic:
                batteryCharacteristic = characteristic

            case UUIDs.bb8AntiDosCharacteristic:
                bb8AntiDosCharacteristic = characteristic
            case UUIDs.bb8TxPowerCharacteristic:
                bb8TxPowerCharacteristic = characteristic
            case UUIDs.bb8WakeCharacteristic:
                bb8WakeCharacteristic = characteristic
            case UUIDs.bb8CommandCharacteristic:
                commandCharacteristic = characteristic
            case UUIDs.bb8ResponseCharacteristic:
                bb8ResponseCharacteristic = characteristic

            default:
                break
            }
        }

        initializeProtocolIfReady()
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateNotificationStateFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard characteristic.uuid == UUIDs.bb8ResponseCharacteristic,
              waitingForBB8Notifications
        else { return }

        waitingForBB8Notifications = false

        if let error {
            finishConnect(.failure(DroidError.connectionFailed(error.localizedDescription)))
            return
        }

        guard characteristic.isNotifying else {
            finishConnect(.failure(DroidError.connectionFailed("BB-8 response notifications could not be enabled.")))
            return
        }

        startBB8Handshake()
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard characteristic.uuid == UUIDs.batteryCharacteristic else { return }

        let completion = batteryCompletion
        batteryCompletion = nil

        if let error {
            completion?(.failure(error))
            return
        }

        guard let value = characteristic.value, let first = value.first else {
            completion?(.failure(DroidError.batteryUnavailable))
            return
        }

        completion?(.success(Int(first)))
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didWriteValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        if let handshakeWriteUUID, characteristic.uuid == handshakeWriteUUID {
            let continuation = handshakeContinuation
            self.handshakeWriteUUID = nil
            self.handshakeContinuation = nil

            if let error {
                finishConnect(.failure(DroidError.connectionFailed(error.localizedDescription)))
            } else {
                continuation?()
            }
            return
        }

        guard characteristic.uuid == commandCharacteristic?.uuid else { return }

        let completion = responseWriteCompletion
        responseWriteCompletion = nil

        if let error {
            completion?(.failure(error))
        } else {
            completion?(.success(()))
        }

        drainWriteQueue()
    }

    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        drainWriteQueue()
    }
}
