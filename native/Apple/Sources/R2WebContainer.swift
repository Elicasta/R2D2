import SwiftUI
import WebKit

private final class R2WebViewFactory: NSObject, WKNavigationDelegate {
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
        webView.navigationDelegate = self
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
            showError(
                in: webView,
                title: "R2 Remote UI missing",
                detail: "WebApp/index.html was not bundled. Run the bootstrap script again."
            )
            return
        }

        do {
            let html = try String(contentsOf: indexURL, encoding: .utf8)

            // The native build is deliberately self-contained, so WKWebView never
            // needs file:// access to the app bundle. This avoids iOS sandbox
            // extension failures seen when WebContent tries to open bundle files.
            webView.loadHTMLString(html, baseURL: nil)
        } catch {
            showError(
                in: webView,
                title: "R2 Remote UI could not load",
                detail: error.localizedDescription
            )
        }
    }

    private func showError(in webView: WKWebView, title: String, detail: String) {
        let escapedTitle = title
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        let escapedDetail = detail
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")

        let html = """
        <!doctype html>
        <html>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <body style="margin:0;background:#07101c;color:white;font-family:-apple-system;padding:40px">
            <h2>\(escapedTitle)</h2>
            <p style="color:#9eb4cf;line-height:1.5">\(escapedDetail)</p>
          </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        print("R2WebView navigation failed: \(error.localizedDescription)")
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        print("R2WebView provisional navigation failed: \(error.localizedDescription)")
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
