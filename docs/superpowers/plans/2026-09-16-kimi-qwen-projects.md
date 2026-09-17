# 1.10.0 验证记录：Kimi / Qwen 支持、项目移动、弹窗与 Claude 归档菜单

范围：main 与 safari-main 同步实现；两个分支保留工作区改动，未 commit / push。基线分别为 9f7c98c、6475141。版本统一为 1.10.0，Safari build number 8。

## 需求对应

1. 弹窗布局：移除 `.popup-shell` 的固定最小高度，折叠使用说明后弹窗随内容收缩；压缩头部、行高与间距，简体中文展开后总高 592px（Chrome 上限 600px），英语 624px、俄语 716px 时仍可滚动，展开时自动滚到说明位置。
2. 设置页新增描述：标题“支持 ChatGPT、Claude、Grok、Gemini、Kimi、Qwen 的浏览器页面增强”，无序列表按平台列出能力，六种语言；用 `<details>` 实现，默认折叠，点标题展开。
3. Kimi 批量删除。4. Qwen 批量删除、归档、归档管理（恢复 / 删除）。5. ChatGPT、Qwen 批量移动至项目 / 新项目。6. Claude 批量移动至组 / 新组。7. 普通 Claude 聊天不再显示“归档”菜单项，仅所选全部为 Cowork 任务时出现。

## 网站结构与接口核对（2026-09-16，只读核对公开前端代码）

Kimi（https://www.kimi.com/ ，前端包 https://statics.moonshot.cn/kimi-web-seo/assets/ ）：
- 侧栏：`section.next-sidebar-section > .next-sidebar-section__header` 内是 `button.next-sidebar-section__title.is-collapsible`（标题文本现为“对话”，i18n `sidebar.chatSection`；旧文案“历史会话”）和 `.next-sidebar-section__action`（“查看全部”）；管理图标插在标题按钮之后、动作之前，头部加 `cs-heading-row` 变为同一行。列表 `.next-sidebar-history-list`，行 `.next-sidebar-history-item` 内 `a.next-sidebar-history-item__link[href="/chat/{id}?chat_enter_method=history"]`；置顶列表 `.next-sidebar-pinned-list__item` 复用同一行组件。
- 接口：Connect 协议，`POST /apiv2/kimi.chat.v1.ChatService/DeleteChat`，JSON 体 `{"chat_id":…}`（`useProtoFieldName`），响应为空消息 `{}`；服务同时提供 `BatchDeleteChats`、`ListChats`，本次只用逐条删除。
- 请求头：`Authorization: Bearer <localStorage.access_token>`、`Connect-Protocol-Version: 1`、`x-msh-platform: web`、`x-msh-version: 2.2.0`、`X-Traffic-Id`（`msh_user_id`）、`x-msh-device-id` / `x-msh-session-id`（`localStorage['volcano-token-info']` 的 webId / ssid）、`X-Language`、`R-Timezone`。网站客户端还会在 1 秒内等待 TrustDecision 指纹写入 `x-msh-shield-data`，拿不到则省略；扩展无法访问页面世界的指纹 SDK，因此不发送该头，未在真实账号验证服务端是否接受。

Qwen（https://chat.qwen.ai/ ，前端包 https://assets.alicdn.com/g/qwenweb/qwen-chat-fe/0.2.91/js/ ）：
- 侧栏 `#sidebar .session-list`，主列表区块 `#finsh`，行 `div.chat-item-drag > a.chat-item-drag-link[aria-label="chat-item"]`，无 href，标题在 `.chat-item-title-text`（超过 100 字截断为 97 字加“...”）。项目列表在 `.project-list-wrapper`。
- 接口基址 `/api/v2`，Cookie 会话；请求头 `source: web`、`X-Request-Id`、`Timezone`、`Accept-Language`，web 端不带 Authorization。`/api/v2` 响应信封 `{success, data}`；`/api/v1/auths/` 直接返回用户记录（网站在客户端才包成信封），扩展按原始记录读取 `id`。
- “所有对话”区块由 `yk`（index38.js）渲染为 `div.list-folder`；`id:"finsh"` 只是组件 prop，**不会**写入 DOM。结构：`.list-folder > .collapsible-full > .collapsible-full（头部，点击折叠） > div > .collapsible-full > .folder-button > .folder-name（“所有对话”）+ .folder-button-icon-container（箭头）`，内容在其后的 `div > .folder-content`（置顶行 + `.list-folder-pt`）。管理图标插在 `.folder-name` 之后、箭头之前，`.folder-button` 加 `cs-heading-row` 保持同一行；图标按钮阻止冒泡，不会触发区块折叠。旧版“头部是 `#finsh` 第一个子元素”的写法在真实页面上退化到列表前（2026-09-16 用户截图），已改正。
- 弹窗“归档管理”导航按钮之前没有下边距，与设置卡片贴在一起；现为上 8px、下 10px。
- 列表 `GET /chats/?page=N&exclude_project=true`（每页 60）、`GET /chats/pinned`、归档列表 `GET /chats/archived`、删除 `DELETE /chats/{id}`、归档切换 `POST /chats/{id}/archive`、项目 `GET/POST /projects/`、批量加入项目 `POST /projects/add_chat` `{chat_ids, project_id}`、身份 `GET /api/v1/auths/`。
- 扩展按结构对齐侧栏与网站列表：置顶行对应 `/chats/pinned`，主列表按日期标签（`.list-folder-chats`）分段，对应 API 项目的 `time_range` 连续分段；仅当分段大小一致时才按位置映射，且每行还要通过标题比对；出现未知行的分段不加复选框并在 30 秒节流内重新拉取列表。分页失败会重试同一页而不是跳过；删除 / 归档 / 移动后在内存中剔除已处理 ID，恢复后重新加入。提交批处理前会再次核对所选 ID 仍映射在同标题的行上，并在会话身份未知时先取身份、失败即停。

ChatGPT（CDN 资源 https://chatgpt.com/cdn/assets/ ，由 2830c3ea 起爬取 11 个模块）：
- 项目列表 `GET /backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0&owned_only=true&limit=N[&cursor]`，条目 `item.gizmo.gizmo.id`（`g-p-…`）与 `display.name`。
- 移动 `PATCH /backend-api/conversation/{id}` `{"gizmo_id": <project id 或空串>}`（网站 `moveConversationToProject` 流程）。
- 新建项目：网站现有代码同时存在 `POST /backend-api/projects`（请求体未能从已爬取模块确认）与 `POST /backend-api/gizmos/snorlax/upsert`。真实账号测试中不带 `sharing` 的 upsert 体返回 422；现改为网站更新路径同款体 `{instructions:"",display:{name,description:"",prompt_starters:[]},tools:[],files:[],training_disabled:false,sharing:[{type:"private",capabilities:{can_read:true,can_view_config:false,can_write:false,can_delete:false,can_export:false,can_share:false}}]}`，若仍 422 则以同一体回退到 `/backend-api/projects`；响应取 `resource.gizmo.id`（或顶层 `gizmo` / 记录本身）。仍未在真实账号验证；失败时不移动任何聊天，可先在网站里新建项目再从列表选择。

Claude（claude.ai 拒绝脚本抓取，依据公开来源）：
- 移动：`PUT /api/organizations/{org}/chat_conversations/{uuid}` `{"project_uuid": …}`，返回 202 无正文（anthropics/claude-code issue #92560，2026-09-06）。
- 项目列表 `GET /api/organizations/{org}/projects`（guidodinello/claude-client）。新建 `POST /api/organizations/{org}/projects` `{name, description:"", is_private:true}` 为推断，未在真实账号执行；失败时不移动任何聊天。
- 界面用语：网站菜单为 “Add to project”（2026-03 教程），扩展按需求以“组 / group”命名。

## 检查

两个分支：`npm run check` 通过（已把 kimi.js、qwen.js、projects.js 纳入语法检查）；117 项 Node/DOM 测试通过（新增 Kimi、Qwen 分段映射与分页重试、批量移动、归档适配器、设置页描述等用例）。Chromium 13 项通过；WebKit 桌面 + iPhone 项目 25 项通过（桌面专属固有宽度用例在 iPhone 跳过）。Safari macOS Debug 工程编译检查见本文档末尾。

独立代码审查（code-reviewer）指出的分页跳页、标题顺序无校验、缓存冻结与恢复无反向、Qwen 身份校验失败即放行、新建目标后静默失败、Claude 移动只看状态码等问题均已修复；未处理的低优先级项：冷却时间按站点而非按操作记录。

自动化测试使用虚构聊天和模拟网站响应，未删除、归档或移动真实聊天。安装后请在 Kimi、Qwen 页面人工核对：复选框出现在正确的行，确认框标题与所选一致，先取消一次后再用可丢弃的测试聊天验证。

## Safari 工程编译

macOS Debug（无签名）编译通过；打包的扩展 `src/` 含 kimi.js、qwen.js、projects.js。安装应用的启用说明、隐私政策与商店文案已补充 Kimi 和 Qwen。iOS 模拟器 Debug（无签名）编译同样通过。

## 发布（2026-09-16）

- Chrome：`chat-tidy-main/release/chat-tidy-chrome-1.10.0.zip`（34 个文件，按 manifest 引用校验）已于 2026-09-16 17:44 CST 通过开发者信息中心上传并提交审核（条目 pinmjlibamcaggmjlphibcmbfogdmmhc，状态“待审核”，通过后自动发布；商店之前的公开版本是 1.8.9，1.9.1 从未上架）。英文商店说明同步改为六站点 + 归档管理 + 移动至项目 / 组的新文案。
- 操作方式备注：Chrome 禁止扩展（含 Claude in Chrome）在 `chrome.google.com/webstore/*` 上运行脚本，开发者信息中心也在禁区；“允许 Apple 事件中的 JavaScript”菜单项在该页面激活时整组置灰，且本机点击后也未生效。最终用系统辅助功能 + CGEvent 真实鼠标事件操作页面；文件选择面板里任何回车都会被网页的“选择文件”按钮吃掉并关闭面板，所以把 zip 临时复制到桌面，用鼠标点“Desktop › 文件 › 打开”完成选择，事后删除副本。
- Safari：1.10.0 build 8 归档、云签名并上传成功（13:52 CST）。第一次导出被 App Store Connect 拒绝（错误 90862）：法语 `extensionDescription` 118 字符，超过 Safari 对 manifest description 的 112 字符上限（Chrome 上限 132）。已缩短为 109 字符，并在两棵树的 `scripts/build-i18n.cjs --check` 中加入 ≤112 / name ≤45 的校验。
- App Store Connect：撤回待审的 1.9.1（reviewSubmission b2c43b22…），版本记录改为 1.10.0、挂 build 8、商店描述与审核备注补充 Kimi / Qwen，再建新的 reviewSubmission 提审。已完成：1.9.1 提交 b2c43b22… 于 13:54 CST 撤回（版本先变 DEVELOPER_REJECTED，挂 build 8 后回到 PREPARE_FOR_SUBMISSION），新提交 dd2da354-c917-4e36-8d9e-66e454a53d44 于 13:55 CST（05:55 UTC）进入 WAITING_FOR_REVIEW，版本 1.10.0 + build 8。
- 提审前核对已挂 build 要用 `GET /appStoreVersions/{id}/build`；`GET /appStoreVersions/{id}?include=build` 不返回 included，会误判为未挂。


## 1.10.1 与 App 审核资料（2026-09-17）

- 1.10.0（build 8，提交 dd2da354…）被 App Review 以 Guideline 2.1「Information Needed – New App Submission」退回：不是功能问题，而是新开发者账号例行索要六项资料（真机录屏、用途与目标用户、安装使用说明、外部服务清单、地区差异、受监管行业/受保护素材），要求回复解决中心并写入 App Review Information 的 Notes。提交撤回后留言只在“所有提交/历史”里可见，API 读不到。
- 1.10.1（build 9，Grok Bots 折叠改为仅默认状态 + 支持卡片样式恢复）于 2026-09-17 01:56 CST 重新提审（reviewSubmission 7ef9f414-d844-46f5-aa0f-fea20cb9f0ad）。六项答复已通过 `PATCH /appStoreReviewDetails/{id}` 写入 Notes（等待审核状态下仍可改，3568 字符）；真机录屏 `build/app-store/chat-tidy-1.10.1-macos-demo.mp4`（macOS 26.6.2 / Safari 26.6.2，2.5 分钟：启动 App → Safari 设置 › 扩展 → chatgpt.com 创建测试对话 → 勾选 → 菜单删除 → 先取消再确认 → 结果；无关对话标题与账号区域已打码）经 `POST /appStoreReviewAttachments` 分片上传为附件（id 637026e2…，状态 COMPLETE）。
- 录屏中发现：Safari 运行期间替换/重新登记 App 后，App 内“打开 Safari 扩展设置”按钮会报 `SFErrorDomain error 1`（NoExtensionFound），Safari「退出并保留窗口」重启后一度恢复，但本机开发签名版仍不稳定；商店签名版未验证。录屏因此改走 Safari › 设置 › 扩展 的手动路径。建议后续版本给该按钮增加失败回退（激活 Safari 并提示手动路径），避免审核人员看到原始错误框。另外 build 目录里的多份 Chat Tidy.app 会让 Safari 扩展列表出现重复条目，需 `lsregister -u` 注销。
- Chrome Web Store 的 1.10.1 替换已于 2026-09-17 10:36 CST 完成：商品详情页右上角“⋮”菜单 → 取消审核（确认后条目回到“已发布 - 公开发布”，草稿仍是 1.10.0）→ 文件包页“上传新的软件包”选 `chat-tidy-main/release/chat-tidy-chrome-1.10.1.zip`（与 main 分支 296735a 逐文件一致）→ 草稿显示 1.10.1 → 商品详情页“提请审核”→ 确认框“提交审核”（通过后自动发布）。条目状态回到“待审核”。商店文案未改。
