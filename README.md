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

Package `manifest.json`, `popup.html`, `src/`, `_locales/`, `icons/`, `LICENSE` and `THIRD_PARTY_NOTICES.md` for distribution.

## License

Licensed under the [Apache License 2.0](LICENSE). Third-party components retain their respective licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md).
