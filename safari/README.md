# Safari 开发与验证

此目录是 Safari Web Extension 的 macOS / iOS 安装工程。运行时扩展源码只有仓库根目录下的一份；修改 `src/`、清单或翻译后重新构建即可。不要直接在整个仓库上重新运行转换工具：它会把开发依赖和测试目录加入资源，并重新引入模板消息桥。

## 环境与安装

- 目标：Safari 16.4+；macOS 13.3+，iOS/iPadOS 16.4+。最低版本由原生 Web Locks、`:has()`、`dialog`、动态视口单位等 API 要求决定，不包含旧版本 polyfill。
- 本次构建：Xcode 26.6，macOS 和 iOS Simulator Debug 均通过。
- Xcode 打开 `Chat Tidy/Chat Tidy.xcodeproj`，选择 `Chat Tidy (macOS)` 或 `Chat Tidy (iOS)`。
- 本地安装需为应用及扩展 target 配置适当签名。当前 Bundle ID 为 `com.redpeak5421.ChatTidy` / `com.redpeak5421.ChatTidy.Extension`；如果修改，同步修改 `Shared (App)/ViewController.swift` 中设置按钮使用的扩展标识。
- macOS 开发调试可在 Safari 的开发设置中允许未签名扩展；该设置可能在重启 Safari 后恢复。正式分发需要 Apple 签名流程。
- 运行应用后，在 Safari 设置的扩展页面启用 Chat Tidy，并给 chatgpt.com、claude.ai、grok.com 网站权限。iPhone/iPad 在系统设置的 Safari 扩展页面启用。刷新已打开的网站页面。

## 构建与测试

从仓库根目录执行：

```sh
npm ci
npm run check
npm test
npx playwright install webkit
npm run test:webkit
npm run build:safari:macos
npm run build:safari:ios
```

两个构建命令关闭签名，仅验证工程编译，不能代替发布归档或已签名安装。macOS 产物为 `build/safari-macos/Build/Products/Debug/Chat Tidy.app`；iOS 模拟器产物在 `build/safari-ios/Build/Products/Debug-iphonesimulator/`。真实设备或发布通过 Xcode 的签名和 Archive 流程完成。

## 源码架构

- `src/batch.js`：三个网站直接同源请求，登录 token 仅保留在当前批次闭包。固定接口和校验过的 ID 决定请求路径，不提供任意 URL 调用接口。
- `src/content.js`：原生 DOM 选择、确认框、进度和停止，直接调用执行器。扩展消息仅用于弹窗查询当前网站，不传递删除请求或凭据。
- `navigator.locks`：按网站存储分区跨标签页互斥，不轮询、不保活、不经过后台。锁不可用时拒绝操作。同一页面只允许一个批次。锁不是跨网站、跨隐私浏览或跨配置文件的全局锁。
- `browser.storage.local`：偏好和各站点冷却状态。429 后收集已发出请求的结果、停止后续批次并降低并发；下一次运行重新读取冷却状态。
- 页面关闭/离开会阻止后续批次；已经发出的请求不能撤回。不会恢复未完成的删除。Claude 工作区每波重新检查。
- `manifest.json`：MV3，无后台 worker、nativeMessaging、cookies 或额外注入权限。
- AppKit/UIKit 安装应用只显示启用说明和原生设置按钮；无 WebView、JavaScript 转发或 native-message echo。必要的 extension handler 不处理数据。
- CSS 使用媒体查询和变量适配深色、触屏、窄弹窗与安全区域，无 JavaScript 样式兼容层。

## 验证证据与边界

2026-09-14：68 项 Node/DOM 测试通过；6 项 WebKit 26.6 测试通过（桌面与 iPhone 尺寸各 3 项），覆盖原生确认框、触屏入口、同源精确删除、弹窗设置以及两个独立页面的原生锁竞争与释放。macOS 和 iOS Simulator 工程构建通过。截图输出在忽略的 `artifacts/webkit/`。

测试均使用虚构聊天和模拟网站响应；WebKit 测试用替身提供扩展存储 API，不能替代 Safari 已安装扩展的权限与隔离世界实测。未执行真实账户删除、真机 iOS 测试、Safari 16.4 旧版实机测试或 App Store 分发验证。支持最低版本是源码目标，不表示每个 Safari 版本均已实测。三个网站的私有接口仍可能变化。

安装后人工检查：启用三个站点权限；确认设置与六种语言；分别检查网站侧栏和 Grok 搜索/展示全部；先取消一次删除确认；如需验证真实删除，由使用者挑选可丢弃测试聊天。检查归档、失败提示、停止、刷新以及另一标签页竞争。不要用真实重要记录做兼容性测试。

## 官方依据

- [Apple：Safari Web Extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)
- [Apple：内容脚本与样式](https://developer.apple.com/documentation/safariservices/using-content-script-and-style-sheet-keys)
- [Apple：网站权限](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions)
- [WebKit：扩展后台请求的 Origin 限制](https://bugs.webkit.org/show_bug.cgi?id=244576)
- [WebKit：后台 fetch 携带 Cookie 的兼容问题](https://bugs.webkit.org/show_bug.cgi?id=260676)
