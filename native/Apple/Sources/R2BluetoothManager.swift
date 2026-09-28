import Foundation
import CoreBluetooth

final class R2BluetoothManager: NSObject {
    enum R2Error: LocalizedError {
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
                return "R2-D2 was not found. Make sure he is awake and nearby."
            case .connectionFailed(let message):
                return "Bluetooth connection failed: \(message)"
            case .commandUnavailable:
                return "R2-D2 command channel is not ready."
            case .batteryUnavailable:
                return "Battery status is unavailable."
            case .invalidPacket:
                return "Invalid R2-D2 command packet."
            }
        }
    }

    private enum UUIDs {
        static let authService = CBUUID(string: "00020001-574F-4F20-5370-6865726F2121")
        static let authCharacteristic = CBUUID(string: "00020005-574F-4F20-5370-6865726F2121")
        static let notifyCharacteristic = CBUUID(string: "00020002-574F-4F20-5370-6865726F2121")
        static let commandService = CBUUID(string: "00010001-574F-4F20-5370-6865726F2121")
        static let commandCharacteristic = CBUUID(string: "00010002-574F-4F20-5370-6865726F2121")
        static let batteryService = CBUUID(string: "180F")
        static let batteryCharacteristic = CBUUID(string: "2A19")
    }

    private lazy var central = CBCentralManager(delegate: self, queue: .main)
    private var peripheral: CBPeripheral?
    private var authCharacteristic: CBCharacteristic?
    private var notifyCharacteristic: CBCharacteristic?
    private var commandCharacteristic: CBCharacteristic?
    private var batteryCharacteristic: CBCharacteristic?

    private var connectCompletion: ((Result<Void, Error>) -> Void)?
    private var batteryCompletion: ((Result<Int, Error>) -> Void)?
    private var scanTimeout: DispatchWorkItem?
    private var didAuthenticate = false
    private var didFinishConnection = false

    var onDisconnect: (() -> Void)?

    override init() {
        super.init()
        _ = central
    }

    func connect(completion: @escaping (Result<Void, Error>) -> Void) {
        if let peripheral, peripheral.state == .connected, commandCharacteristic != nil {
            completion(.success(()))
            return
        }

        resetConnectionState(keepCentral: true)
        connectCompletion = completion

        guard central.state == .poweredOn else {
            if central.state == .unsupported || central.state == .unauthorized || central.state == .poweredOff {
                finishConnect(.failure(R2Error.bluetoothUnavailable))
            }
            return
        }

        beginScan()
    }

    func disconnect(completion: (() -> Void)? = nil) {
        scanTimeout?.cancel()
        central.stopScan()

        guard let peripheral else {
            resetConnectionState(keepCentral: true)
            completion?()
            return
        }

        central.cancelPeripheralConnection(peripheral)
        resetConnectionState(keepCentral: true)
        completion?()
    }

    func send(_ data: Data, completion: @escaping (Result<Void, Error>) -> Void) {
        guard !data.isEmpty else {
            completion(.failure(R2Error.invalidPacket))
            return
        }
        guard let peripheral, peripheral.state == .connected, let characteristic = commandCharacteristic else {
            completion(.failure(R2Error.commandUnavailable))
            return
        }

        let type: CBCharacteristicWriteType =
            characteristic.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse

        peripheral.writeValue(data, for: characteristic, type: type)
        completion(.success(()))
    }

    func readBattery(completion: @escaping (Result<Int, Error>) -> Void) {
        guard let peripheral, peripheral.state == .connected, let batteryCharacteristic else {
            completion(.failure(R2Error.batteryUnavailable))
            return
        }

        batteryCompletion = completion
        peripheral.readValue(for: batteryCharacteristic)

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            guard let self, self.batteryCompletion != nil else { return }
            let pending = self.batteryCompletion
            self.batteryCompletion = nil
            pending?(.failure(R2Error.batteryUnavailable))
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
            self.finishConnect(.failure(R2Error.deviceNotFound))
        }
        scanTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: timeout)
    }

    private func resetConnectionState(keepCentral: Bool) {
        scanTimeout?.cancel()
        scanTimeout = nil
        peripheral = nil
        authCharacteristic = nil
        notifyCharacteristic = nil
        commandCharacteristic = nil
        batteryCharacteristic = nil
        batteryCompletion = nil
        didAuthenticate = false
        didFinishConnection = false
    }

    private func finishConnect(_ result: Result<Void, Error>) {
        guard !didFinishConnection else { return }
        didFinishConnection = true
        scanTimeout?.cancel()
        scanTimeout = nil
        let completion = connectCompletion
        connectCompletion = nil
        completion?(result)
    }

    private func initializeProtocolIfReady() {
        guard
            let peripheral,
            let authCharacteristic,
            let commandCharacteristic,
            !didAuthenticate
        else { return }

        didAuthenticate = true

        if let notifyCharacteristic {
            peripheral.setNotifyValue(true, for: notifyCharacteristic)
        }
        peripheral.setNotifyValue(true, for: commandCharacteristic)

        let auth = Data("usetheforce...band".utf8)
        let writeType: CBCharacteristicWriteType =
            authCharacteristic.properties.contains(.write) ? .withResponse : .withoutResponse
        peripheral.writeValue(auth, for: authCharacteristic, type: writeType)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            self?.finishConnect(.success(()))
        }
    }
}

extension R2BluetoothManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard connectCompletion != nil else { return }

        switch central.state {
        case .poweredOn:
            beginScan()
        case .unsupported, .unauthorized, .poweredOff:
            finishConnect(.failure(R2Error.bluetoothUnavailable))
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

        guard name.hasPrefix("D2-") || name.hasPrefix("Q5-") else { return }

        self.peripheral = peripheral
        peripheral.delegate = self
        scanTimeout?.cancel()
        central.stopScan()
        central.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([
            UUIDs.authService,
            UUIDs.commandService,
            UUIDs.batteryService
        ])
    }

    func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        finishConnect(.failure(R2Error.connectionFailed(error?.localizedDescription ?? "Unknown error")))
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        let hadConnection = didFinishConnection
        resetConnectionState(keepCentral: true)
        if hadConnection {
            onDisconnect?()
        }
    }
}

extension R2BluetoothManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            finishConnect(.failure(R2Error.connectionFailed(error.localizedDescription)))
            return
        }

        peripheral.services?.forEach { service in
            switch service.uuid {
            case UUIDs.authService:
                peripheral.discoverCharacteristics([
                    UUIDs.authCharacteristic,
                    UUIDs.notifyCharacteristic
                ], for: service)
            case UUIDs.commandService:
                peripheral.discoverCharacteristics([
                    UUIDs.commandCharacteristic
                ], for: service)
            case UUIDs.batteryService:
                peripheral.discoverCharacteristics([
                    UUIDs.batteryCharacteristic
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
        if let error, service.uuid != UUIDs.batteryService {
            finishConnect(.failure(R2Error.connectionFailed(error.localizedDescription)))
            return
        }

        service.characteristics?.forEach { characteristic in
            switch characteristic.uuid {
            case UUIDs.authCharacteristic:
                authCharacteristic = characteristic
            case UUIDs.notifyCharacteristic:
                notifyCharacteristic = characteristic
            case UUIDs.commandCharacteristic:
                commandCharacteristic = characteristic
            case UUIDs.batteryCharacteristic:
                batteryCharacteristic = characteristic
            default:
                break
            }
        }

        initializeProtocolIfReady()
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
            completion?(.failure(R2Error.batteryUnavailable))
            return
        }

        completion?(.success(Int(first)))
    }
}
