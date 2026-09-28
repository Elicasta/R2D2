import SwiftUI

@main
struct R2RemoteApp: App {
    var body: some Scene {
        WindowGroup {
            R2WebContainer()
                .ignoresSafeArea()
        }
    }
}
