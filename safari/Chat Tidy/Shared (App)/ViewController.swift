#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#else
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
#endif

// The installation host uses native controls; no WKWebView or JavaScript bridge.
final class ViewController: PlatformViewController {
    private let chinese = Locale.preferredLanguages.first?.hasPrefix("zh") == true

    override func viewDidLoad() {
        super.viewDidLoad()
        let instructions = chinese
            ? "在 Safari 的扩展设置中启用 Chat Tidy，并允许访问 ChatGPT、Claude、Grok、Gemini、Kimi 和 Qwen。然后刷新网站页面，在侧边栏勾选聊天进行管理。\n\n需要 Safari 16.4 或更新版本。处理期间请保持网页打开。"
            : "Enable Chat Tidy in Safari extension settings and allow access to ChatGPT, Claude, Grok, Gemini, Kimi and Qwen. Reload the website, then select chats in the sidebar.\n\nRequires Safari 16.4 or later. Keep the website open while processing."
#if os(iOS)
        view.backgroundColor = .systemBackground
        let title = UILabel()
        title.text = "Chat Tidy"
        title.font = .preferredFont(forTextStyle: .largeTitle)
        let detail = UILabel()
        detail.text = instructions
        detail.font = .preferredFont(forTextStyle: .body)
        detail.numberOfLines = 0
        detail.adjustsFontForContentSizeCategory = true
        let stack = UIStackView(arrangedSubviews: [title, detail])
        stack.axis = .vertical
        stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -28),
            stack.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor)
        ])
#else
        let title = NSTextField(labelWithString: "Chat Tidy")
        title.font = .systemFont(ofSize: 28, weight: .semibold)
        let detail = NSTextField(wrappingLabelWithString: instructions)
        detail.font = .systemFont(ofSize: 14)
        let button = NSButton(title: chinese ? "打开 Safari 扩展设置" : "Open Safari Extension Settings", target: self, action: #selector(openSettings))
        let privacyButton = NSButton(title: chinese ? "隐私政策" : "Privacy Policy", target: self, action: #selector(openPrivacyPolicy))
        let stack = NSStackView(views: [title, detail, button, privacyButton])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -28),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            detail.widthAnchor.constraint(equalTo: stack.widthAnchor)
        ])
#endif
    }
#if os(macOS)
    @objc private func openPrivacyPolicy() {
        guard let url = URL(string: "https://github.com/redPeak5421/chat-tidy/blob/app-store-info/safari/app-store/PRIVACY.md") else { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func openSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: "com.canonforge.ChatTidy.Extension") { error in
            if let error = error {
                DispatchQueue.main.async { NSAlert(error: error).runModal() }
            }
        }
    }
#endif
}
