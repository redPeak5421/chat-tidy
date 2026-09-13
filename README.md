# Chat Tidy

English | [简体中文](README.zh-CN.md)

A browser extension for selecting and deleting ChatGPT, Claude and Grok conversations from the sidebar.

## Install

In Chrome or another Chromium browser, enable Developer mode on the extensions page and load this directory as an unpacked extension. Refresh the website after installing or updating.

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

Translations are maintained in `_locales/*/messages.json`. Run `npm run build:i18n` after editing translations. The generated bundle preserves manual language switching; Chrome uses the same catalogs for manifest text. The Chinese catalogs cover simplified and traditional scripts, without separate regional editions.

Package `manifest.json`, `popup.html`, `src/`, `_locales/`, `icons/`, `LICENSE` for distribution.

## Support

If Chat Tidy is useful to you, you can support its development on Ko-fi.

[![Support on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U2C326XLKJ)

## License

Licensed under the [Apache License 2.0](LICENSE). The GitHub logo is an official brand asset used to link to this repository, subject to [GitHub’s brand guidelines](https://brand.github.com/foundations/logo). It is not covered by this project’s Apache license.
