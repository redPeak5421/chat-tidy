# Chat Tidy

English | [简体中文](README.zh-CN.md)

A browser extension for selecting and deleting ChatGPT, Claude and Grok conversations from the sidebar.

## Installation

The `safari-main` branch targets Safari 16.4 or later, with macOS 13.3 and iOS/iPadOS 16.4 deployment targets. The Chromium version remains on `main`.

Open `safari/Chat Tidy/Chat Tidy.xcodeproj` in Xcode, select the macOS or iOS scheme, and configure signing for both app and extension targets. Build and run, enable Chat Tidy in Safari extension settings, and grant access to each supported website. Reload website tabs after installing or updating.

See [Safari development and validation](safari/README.md) for build commands, signing, architecture and verification limits.

## Usage

Select chats and open the management menu beside the chat heading. Clear, invert or select all loaded chats, then review and confirm deletion once. Scroll the sidebar to load more chats. Chat Tidy uses each website’s native deletion behavior and cannot undo it. Grok uses its native soft-delete operation.

The popup provides an enable switch, checkbox visibility, deletion concurrency and six languages: English, 简体中文, 繁體中文, Français, 日本語 and Русский. Hidden checkboxes appear when the pointer approaches the left edge. Selected and keyboard-focused rows remain visible.

ChatGPT and Grok support 1–3 concurrent deletion requests. Claude sends same-origin requests from the initiating page to the website’s native bulk-delete endpoint, with up to 20 selected chats per request and a 500 ms interval between groups; the concurrency setting applies to ChatGPT and Grok. A 403 stops immediately without retries or alternate endpoints. Rate limits stop the batch, start a cooldown and reduce concurrency. Stop prevents pending requests; requests already sent cannot be recalled. Keep the initiating page open until processing ends.

ChatGPT also supports native bulk archiving, with restoration through its Archived Chats settings. Grok archiving is not offered because no native conversation archive operation has been verified; there is no local hiding substitute.

Cowork uses its native session endpoints, one task per request, independently of the concurrency setting. Some tasks require device attestation. This extension does not generate or copy device proofs; rejected operations stop and must be completed using Claude’s native controls. Successful responses are required before items disappear.

Grok’s View all search dialog supports checkboxes and a top bulk-delete toolbar. The popup shows a Show all switch only on Grok: it reads the native paginated history and adds omitted chats to the sidebar. Disabling it restores the original list. History metadata stays in page memory and is discarded on reload; request failures stop loading.

## Privacy and compatibility

Runs only on chatgpt.com, claude.ai and grok.com. Preferences and cooldown state are stored locally. Conversation titles, identifiers and session credentials are used temporarily for user-requested operations. No developer server, advertising or analytics. Website API changes may affect compatibility.

Claude selection is scoped to the active workspace. Cowork tasks support selection, deletion and native archiving. Ordinary Claude chats do not support archiving in this extension; select only Cowork tasks to enable Archive. Grok bots are excluded. These are website interfaces, not documented public APIs; endpoint behavior was checked against website code, while automated tests use simulated responses.

## Development

Requires Node.js and npm.

```sh
npm ci
npm run build:i18n
npm run check
npm test
```

Tests use fictional conversations and simulated responses; they do not delete real chats.

Translations are maintained in `_locales/*/messages.json`. Run `npm run build:i18n` after editing translations. The generated bundle preserves manual language switching; Safari uses the same catalogs for manifest text. The Chinese catalogs cover simplified and traditional scripts, without separate regional editions.

The Safari project copies only `manifest.json`, `popup.html`, `src/`, `_locales/`, `icons/` and `LICENSE` into the extension. Use Xcode signing and Archive for distribution.

## License

Licensed under the [Apache License 2.0](LICENSE). The GitHub logo is an official brand asset used to link to this repository, subject to [GitHub’s brand guidelines](https://brand.github.com/foundations/logo). It is not covered by this project’s Apache license.

## Safari execution

All three sites execute requests directly from the initiating page’s isolated content script using same-origin credentials. There is no background worker, runtime API polyfill, page-script relay, or native messaging bridge. The installation host uses AppKit/UIKit controls.

Native Web Locks prevent overlapping batches within the same website storage partition. Different websites can run independently; private browsing and separate storage partitions have independent locks. Leaving the page cancels subsequent requests, and batches never resume automatically. Already submitted requests may finish. Keep the initiating website open until processing ends.
