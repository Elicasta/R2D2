import SwiftUI
import WebKit

private final class R2WebViewFactory {
    let bridge = R2NativeBridge()

    func make() -> WKWebView {
        let contentController = WKUserContentController()
        contentController.add(bridge, name: "r2bridge")

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController

        #if os(iOS)
        configuration.allowsInlineMediaPlayback = true
        #endif

        let webView = WKWebView(frame: .zero, configuration: configuration)
        bridge.webView = webView

        #if os(iOS)
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .clear
        #elseif os(macOS)
        webView.setValue(false, forKey: "drawsBackground")
        #endif

        loadApp(into: webView)
        return webView
    }

    private func loadApp(into webView: WKWebView) {
        guard let indexURL = Bundle.main.url(
            forResource: "index",
            withExtension: "html",
            subdirectory: "WebApp"
        ) else {
            let html = """
            <html>
              <body style="background:#07101c;color:white;font-family:-apple-system;padding:40px">
                <h2>R2 Remote UI missing</h2>
                <p>Run the web sync build before launching the native app.</p>
              </body>
            </html>
            """
            webView.loadHTMLString(html, baseURL: nil)
            return
        }

        let directory = indexURL.deletingLastPathComponent()
        webView.loadFileURL(indexURL, allowingReadAccessTo: directory)
    }
}

#if os(iOS)
struct R2WebContainer: UIViewRepresentable {
    private let factory = R2WebViewFactory()

    func makeUIView(context: Context) -> WKWebView {
        factory.make()
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
#elseif os(macOS)
struct R2WebContainer: NSViewRepresentable {
    private let factory = R2WebViewFactory()

    func makeNSView(context: Context) -> WKWebView {
        factory.make()
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
#endif
