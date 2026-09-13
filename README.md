# Chat Tidy

A browser extension for selecting and deleting ChatGPT conversations from the sidebar.

## Install

In Chrome or another Chromium browser, enable Developer mode on the extensions page and load this directory as an unpacked extension. Refresh ChatGPT after installing or updating.

## Usage

Select chats and open the management menu beside the chat heading. Clear, invert or select all loaded chats, then review and confirm deletion once. Scroll the sidebar to load more chats. Deletion cannot be undone.

The popup provides an enable switch, checkbox visibility, deletion concurrency and six languages: English, 简体中文, 繁體中文, Français, 日本語 and Русский. Hidden checkboxes appear when the pointer approaches the left edge. Selected and keyboard-focused rows remain visible.

Background deletion supports 1–3 concurrent requests. Rate limits stop the batch, start a cooldown and reduce concurrency. Stop prevents pending requests; requests already sent cannot be recalled. Keep the initiating page open until processing ends.

## Privacy and compatibility

Runs only on chatgpt.com. Preferences and cooldown state are stored locally. Conversation titles, identifiers and session credentials are used temporarily for user-requested operations. No developer server, advertising or analytics. ChatGPT website API changes may affect compatibility.

## Development

Requires Node.js and npm.

```sh
npm ci
npm run build:i18n
npm run check
npm test
```

Tests use fictional conversations and simulated responses; they do not delete real chats.

Translations are maintained in `_locales/*/messages.json`. Run `npm run build:i18n` after editing translations. The generated bundle preserves manual language switching; Chrome uses the same catalogs for manifest text. The Chinese catalogs cover simplified and traditional scripts, without separate regional editions.

Package `manifest.json`, `popup.html`, `src/`, `_locales/`, `icons/`, `LICENSE` for distribution.

## License

Licensed under the [Apache License 2.0](LICENSE). The GitHub logo is an official brand asset used to link to this repository, subject to [GitHub’s brand guidelines](https://brand.github.com/foundations/logo). It is not covered by this project’s Apache license.

### 本地问题诊断

在 ChatGPT 标签页打开插件的“问题诊断”，点击“开始记录”，关闭弹窗并复现悬停问题，再打开插件“导出报告”。报告仅包含事件次数、行数、选择数量和耗时，不包含聊天标题、内容、会话 ID、网址或登录凭据。诊断默认关闭，仅保存在当前页面内存；刷新页面或“停止并清空”即清除。页面长任务表示主线程繁忙，并不能单独证明卡顿来自 ChatGPT。
