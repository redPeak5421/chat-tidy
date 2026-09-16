# 1.9.0 验证记录

- main 与 safari-main 保留工作区改动，未 commit/push。基线分别为 9f7c98c、6475141。
- 两个分支的版本均为 1.9.0；Safari build number 为 6。
- 两个分支均通过语法、翻译一致性检查和 86 项单元/DOM 测试。
- Chromium：7 项通过。WebKit：13 项通过，1 项仅适用于桌面的固有宽度测试在手机项目中跳过。
- 界面测试覆盖归档入口、多选、删除确认、恢复载荷、原生列表注入、主题即时切换、本地设置和 Bots 隐藏/原生折叠。
- 回归测试覆盖分页选择、部分失败保留、账号变化、操作中关闭重开、锁、停止、限流及 Safari 无打赏资源。
- Safari macOS 与 iOS 模拟器无签名 Debug 工程编译通过；打包结果包含 archive.js、bots.js。
- 自动操作使用虚构聊天和模拟网络响应；未删除真实聊天。网站实际 DOM 与网站源码只读核对。

## 原生结构与接口核对（2026-09-15）

ChatGPT 当前页面资源：
https://chatgpt.com/cdn/assets/2830c3ea-it8iggnh197z3afi.js

归档列表使用 GET /backend-api/conversations，参数 offset、limit、order=updated、is_archived=true；分页字段 items、offset、limit、total。恢复采用 PATCH /backend-api/conversation/{id}，is_archived=false；删除采用 is_visible=false。原生归档弹窗 data-testid 为 modal-archived-conversations。

Grok 当前页面资源：
https://cdn.grok.com/_next/static/chunks/0pfitiz7e9zwm.js

实际 DOM 的 Bots 标题按钮在 .unified-sidebar 的 data-sidebar="group" 内，通过 aria-expanded 表达折叠状态。调用原生按钮切换，不移动网站节点、不注入跨上下文桥接。上述网站接口并非公开稳定 API。
