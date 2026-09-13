# Chat Tidy

A browser extension for selecting and deleting ChatGPT, Claude and Grok conversations from the sidebar.

## Install

In Chrome or another Chromium browser, enable Developer mode on the extensions page and load this directory as an unpacked extension. Refresh the website after installing or updating.

## Usage

Select chats and open the management menu beside the chat heading. Clear, invert or select all loaded chats, then review and confirm deletion once. Scroll the sidebar to load more chats. Chat Tidy uses each website’s native deletion behavior and cannot undo it. Grok uses its native soft-delete operation.

The popup provides an enable switch, checkbox visibility, deletion concurrency and six languages: English, 简体中文, 繁體中文, Français, 日本語 and Русский. Hidden checkboxes appear when the pointer approaches the left edge. Selected and keyboard-focused rows remain visible.

ChatGPT and Grok support 1–3 concurrent deletion requests. Claude sends same-origin requests from the initiating page to the website’s native bulk-delete endpoint, with up to 20 selected chats per request and a 500 ms interval between groups; the concurrency setting applies to ChatGPT and Grok. A 403 stops immediately without retries or alternate endpoints. Rate limits stop the batch, start a cooldown and reduce concurrency. Stop prevents pending requests; requests already sent cannot be recalled. Keep the initiating page open until processing ends.

## Privacy and compatibility

Runs only on chatgpt.com, claude.ai and grok.com. Preferences and cooldown state are stored locally. Conversation titles, identifiers and session credentials are used temporarily for user-requested operations. No developer server, advertising or analytics. Website API changes may affect compatibility.

Claude selection is scoped to the active workspace. Cowork tasks and Grok bots are excluded. These are website interfaces, not documented public APIs; endpoint behavior was checked against website code, while automated tests use simulated responses.

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
