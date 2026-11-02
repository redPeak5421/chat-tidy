# Chat Tidy Privacy Policy / 隐私政策
Effective date: 2026-11-02

Chat Tidy is an independent browser extension for organizing and navigating conversations on supported AI chat websites. It is not affiliated with the supported services.

## Data handled and purpose
Chat Tidy temporarily reads conversation titles, identifiers, timestamps and workspace/task metadata to display selection controls, history and confirmation dialogs. It uses the user's existing authenticated session, including temporary authentication responses or tokens where required, to load history and perform user-requested deletion (after confirmation), native archiving, restoration, or project/group creation and moves where supported. Several deletion requests may be sent at the same time (1, 3, 5, 10 or 15, chosen by the user); this changes only how fast requests are sent, not which data is handled. On the chat page that is open, it reads the rendered message text in page memory to build the question outline, search the loaded messages and add code-block tools (line numbers, folding, per-line copy and risky-command warnings); this text is not stored unless the user bookmarks something. Copying a line of code writes only that line to the clipboard, at the user's click. It does not persist login credentials, nor build a browsing history or activity profile.

## Storage and retention
Preferences (language, enabled status, checkbox visibility, appearance, concurrency, reading-tool and layout options, and optional sidebar settings) and rate-limit cooldown timestamps are stored locally through Chrome extension storage until changed or removed. Bookmarks the user creates are also stored there, and only there: for a bookmarked chat its title, address, tags and note; for a bookmarked answer additionally the question and a short excerpt of the answer (each at most 300 characters). Bookmarks stay until the user removes them in the extension. A request to jump to a saved answer is kept for at most two minutes. Uninstalling removes this extension storage. Selections and loaded history metadata remain in temporary page/extension memory and are cleared when the relevant page or context closes or reloads. Already-sent requests cannot be recalled by stopping or uninstalling.

## Transmission
Selected identifiers and necessary authentication are sent over HTTPS only to the corresponding service at chatgpt.com, claude.ai, grok.com, gemini.google.com, www.kimi.com, chat.qwen.ai or chat.z.ai for the requested operation. The extension has no developer-operated backend, analytics or advertising and does not send chat data to the developer. These services process requests under their own policies; deletion does not guarantee immediate erasure from all of their systems.

## Optional support pages
Only after a user chooses a support link, the extension opens Afdian in a new tab or an extension support tab containing the official Ko-fi page in a cross-origin iframe. These websites and their payment providers may process network identifiers, cookies and information entered by the user under their own policies. Chat Tidy does not read payment fields, collect financial details, or pass chat data or chat-service credentials to these pages. Supporting the project is optional and does not unlock extension functionality.

## Limited Use
Chat Tidy complies with the Chrome Web Store User Data Policy, including Limited Use requirements. Data is used solely for disclosed conversation-management features, is not sold, and is not used for advertising, creditworthiness, lending or unrelated purposes.

## Controls and contact
Users may disable the extension, change settings, stop requests not yet sent or uninstall it. The extension cannot undo deletion; restoration of supported archived items is handled through the original website. Contact: canonforge5421@gmail.com. Do not include private chats or credentials in support requests.

## 中文摘要
本插件用于整理和浏览所支持 AI 聊天网站的对话，在临时内存中处理聊天标题、标识、时间和工作区/任务信息，并使用网站现有登录会话执行用户要求的删除（需确认），以及网站支持的原生归档、恢复、项目或分组创建与移动。在打开的对话页中，插件于页面内存里读取已显示的消息文字，用于生成提问目录、搜索已加载消息和代码块工具，这些文字不会被保存，除非用户主动收藏；逐行复制仅在用户点击时把该行写入剪贴板。本地只保存设置、限流冷却时间和用户主动创建的收藏（对话标题、地址、标签、备注；收藏回答时另存提问和回答摘录，各不超过 300 字），收藏在用户删除前一直保留，卸载插件即全部清除。不保存登录凭据，不向开发者或任何第三方发送聊天数据，无统计或广告服务。操作请求仅通过 HTTPS 发送至对应网站。可选的爱发电、Ko-fi 支持页面仅在用户点击后打开，付款由第三方网站处理，插件不读取付款信息，也不向其发送聊天数据。用户可停用、卸载或停止尚未发送的请求；已发送请求无法撤回。数据使用遵守 Chrome 应用商店用户数据政策及有限使用要求。
