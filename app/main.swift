// VaderDaddy.app: a window around the local vader service (http://127.0.0.1:47815).
// Starts `vader serve` if it isn't running, shows the UI, and stops the service on quit.
import Cocoa
import WebKit

let serviceURL = URL(string: "http://127.0.0.1:47815/")!

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var service: Process?
    var tries = 0

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        // Light design: the window and the area behind the page match the page's top colour (#F4F7FB), so
        // nothing dark shows before the page paints, while resizing, or when scrolling bounces.
        let background = NSColor(srgbRed: 0xF4 / 255, green: 0xF7 / 255, blue: 0xFB / 255, alpha: 1)
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "vaderIcon")  // the page posts the light bar's colours
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.setValue(false, forKey: "drawsBackground")  // the window's background shows until the page paints
        if #available(macOS 12.0, *) { web.underPageBackgroundColor = background }
        // The page draws right up to the top edge, under a see-through title bar; it keeps its controls
        // out of that strip.
        // Default 1280×820; the page is laid out for 940×600 and up.
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "VaderDaddy"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = background
        window.appearance = NSAppearance(named: .aqua)  // light title bar buttons and panels (was dark)
        window.minSize = NSSize(width: 940, height: 600)
        // The web view takes every click, including in the title bar strip, so a see-through strip above it
        // does the dragging. The page keeps its controls below it (the top bar starts at 32 pt).
        let content = NSView(frame: NSRect(x: 0, y: 0, width: 1280, height: 820))
        web.frame = content.bounds
        web.autoresizingMask = [.width, .height]
        let strip = DragStrip(frame: NSRect(x: 0, y: 820 - DragStrip.height, width: 1280, height: DragStrip.height))
        strip.autoresizingMask = [.width, .minYMargin]
        content.addSubview(web)
        content.addSubview(strip)
        window.contentView = content
        // v3: a new name so frames saved by the old dark window (other sizes) do not carry over.
        window.setFrameAutosaveName("main-v3")
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        show("Starting…")
        connect()
    }

    func show(_ message: String) {
        web.loadHTMLString("<body style='background:#F4F7FB;color:#566173;font:15px -apple-system;display:grid;place-items:center;height:100vh;margin:0'><div style='max-width:520px;text-align:center'>\(message)</div></body>", baseURL: nil)
    }

    /// Load the UI if the service answers; otherwise start it and retry for a few seconds.
    func connect() {
        var req = URLRequest(url: serviceURL)
        req.timeoutInterval = 1
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            DispatchQueue.main.async {
                if (resp as? HTTPURLResponse)?.statusCode == 200 {
                    self.web.load(URLRequest(url: serviceURL))
                } else if self.tries < 20 {
                    if self.tries == 0 { self.startService() }
                    self.tries += 1
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.connect() }
                } else {
                    self.show("Couldn't start the vader service.<br><br>Try running <code>vader serve</code> in Terminal to see the error.")
                }
            }
        }.resume()
    }

    func startService() {
        guard let pathFile = Bundle.main.url(forResource: "vader-path", withExtension: "txt"),
              let launcher = try? String(contentsOf: pathFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
              FileManager.default.isExecutableFile(atPath: launcher) else {
            show("The vader command this app was built for is missing. Rebuild with app/build.sh.")
            tries = 99
            return
        }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: launcher)
        p.arguments = ["serve"]
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        try? p.run()
        service = p
    }

    // Dock icon: the light bar in the colours of the profile on screen. The page posts five "#rrggbb" strings,
    // left to right along the V (an empty list puts the stock icon back). Only while the app runs.
    static let ledSegments: [[(CGFloat, CGFloat)]] = [
        [(387, 415), (423, 442)], [(443.5, 457.5), (476, 482)], [(496.5, 497.5), (512, 509), (527.5, 497.5)],
        [(548, 482), (580.5, 457.5)], [(601, 442), (637, 415)],
    ]
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        // Only our own page may change the icon.
        guard message.name == "vaderIcon", message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.host == serviceURL.host, message.frameInfo.request.url?.port == serviceURL.port else { return }
        let colours = (message.body as? [String] ?? []).compactMap(AppDelegate.colour)
        guard colours.count == 5, let url = Bundle.main.url(forResource: "IconBase", withExtension: "png"),
              let base = NSImage(contentsOf: url) else { NSApp.applicationIconImage = nil; return }
        // Drawn at 512 pt (plenty for the Dock) in icon.svg's 1024 coordinates; animated lighting redraws it
        // several times a second.
        let size = NSSize(width: 512, height: 512)
        let icon = NSImage(size: size, flipped: true) { rect in  // flipped: same coordinates as icon.svg
            let scale = NSAffineTransform()
            scale.scale(by: rect.width / 1024)
            scale.concat()
            base.draw(in: NSRect(x: 0, y: 0, width: 1024, height: 1024))
            for pass in 0..<2 {
                for (i, points) in AppDelegate.ledSegments.enumerated() {
                    let c = colours[i]
                    let lit = c.brightnessComponent > 0.04
                    let path = NSBezierPath()
                    path.move(to: NSPoint(x: points[0].0, y: points[0].1))
                    for p in points.dropFirst() { path.line(to: NSPoint(x: p.0, y: p.1)) }
                    path.lineCapStyle = .round
                    path.lineJoinStyle = .round
                    NSGraphicsContext.saveGraphicsState()
                    if pass == 0 {  // the LED itself, with its glow
                        if lit {
                            let glow = NSShadow()
                            glow.shadowColor = c.withAlphaComponent(0.8)
                            glow.shadowBlurRadius = 30
                            glow.set()
                        }
                        (lit ? c : NSColor(srgbRed: 0.22, green: 0.25, blue: 0.30, alpha: 1)).setStroke()
                        path.lineWidth = 24
                        path.stroke()
                    } else if lit {  // a lighter core, as in the stock icon
                        (c.blended(withFraction: 0.65, of: .white) ?? c).withAlphaComponent(0.75).setStroke()
                        path.lineWidth = 6
                        path.stroke()
                    }
                    NSGraphicsContext.restoreGraphicsState()
                }
            }
            return true
        }
        NSApp.applicationIconImage = icon
    }
    static func colour(_ hex: String) -> NSColor? {
        let h = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
        return NSColor(srgbRed: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }

    func applicationWillTerminate(_ note: Notification) { service?.terminate() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // File picker for "Import…".
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.begin { completionHandler($0 == .OK ? panel.urls : nil) }
    }

    // "Download" of a backup: the page uses a blob link with a download attribute.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, preferences: WKWebpagePreferences,
                 decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
        decisionHandler(action.shouldPerformDownload ? .download : .allow, preferences)
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.begin { completionHandler($0 == .OK ? panel.url : nil) }
    }

    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About VaderDaddy", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide VaderDaddy", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit VaderDaddy", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        let windowItem = NSMenuItem(); main.addItem(windowItem)
        let win = NSMenu(title: "Window")
        win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        win.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = win
        NSApp.windowsMenu = win
        NSApp.mainMenu = main
    }
    @objc func reload() { tries = 0; connect() }
}

/// Drags the window from the strip at its top; a double-click zooms it, as a title bar does.
final class DragStrip: NSView {
    static let height: CGFloat = 32
    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 { window?.performZoom(nil) } else { window?.performDrag(with: event) }
    }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
