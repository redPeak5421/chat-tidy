# Chat Tidy

English | [简体中文](README.zh-CN.md)

A browser extension for selecting and bulk-managing ChatGPT, Claude, Grok, Gemini, Kimi, Qwen and Z.ai conversations from the sidebar, with optional chat enhancements inside each conversation.

1.12.28 adds chat enhancements: an outline of your questions beside each chat (click to jump), search across the loaded messages with highlights, bookmarks with tags and notes for chats and single answers, code block tools (line numbers, folding of long blocks, per-line copy of commands and warnings for risky commands), and optional layout settings (chat width, compact sidebar, hidden disclaimers and a focus mode). The sidebar filter panel now opens beside the sidebar and lists its matches. Everything is set up under Chat enhancements in the popup.

1.11.19 adds Z.ai (chat.z.ai) bulk deletion, much faster batch deletion (a rolling pool that keeps 1, 3, 5, 10 or 15 requests genuinely in flight at once, default 5, and pauses and resumes on short rate limits instead of fixed waits), a refreshed popup and a larger icon, an always-visible management entry in the ChatGPT navigation rail and the Z.ai sidebar, and fixes the Claude sidebar icon sizing. It also introduced an ocean-blue icon and a lighter footprint: each website loads only the scripts it needs, and sidebar scanning and pointer tracking do far less layout work. Since 1.10.5, Chat Tidy supports the redesigned ChatGPT, Claude and Grok sidebars, adds title filtering and keeps the management menu open after actions. The redesigned ChatGPT management entry appears in the application navigation rail below Explore. It stays visible in both checkbox modes, so the menu is always one click away even while checkboxes are hidden. Conversation buttons, rerenders, recycled rows and legacy chat links remain supported.

## Install

In Chrome or another Chromium browser, enable Developer mode on the extensions page and load this directory as an unpacked extension. Refresh the website after installing or updating.

## Usage

Select chats and open the management menu in the application navigation rail on redesigned ChatGPT, beside the first recent-group collapse heading on Claude, or beside the chat heading on other layouts. Clear, invert or select all loaded chats; the menu stays open after actions so you can select all and then delete directly. Close it with the management icon, an outside click or Escape. Review and confirm deletion once. Type in the filter box at the top of the menu to highlight loaded chats whose titles match, then press Enter or “Select” to add them to the selection. Scroll the sidebar to load more chats. Chat Tidy uses each website’s native deletion behavior and cannot undo it. Grok uses its native soft-delete operation.

The popup provides an enable switch, checkbox visibility, deletion concurrency and six languages: English, 简体中文, 繁體中文, Français, 日本語 and Русский. Hidden checkboxes appear when the pointer approaches the left edge. Selected and keyboard-focused rows remain visible. The redesigned ChatGPT rail entry stays visible in both modes. On other layouts, the management icon beside the heading follows the same setting: always shown when checkboxes are shown; otherwise it appears on hover and stays visible while any chat is selected.

Every site supports 1, 3, 5, 10 or 15 concurrent deletion requests (default 5), kept truly in flight at the same time as a rolling pool with no fixed pauses between requests. Claude sends same-origin requests from the initiating page to the website’s native bulk-delete endpoint, with up to 20 selected chats per request; Claude moves and Claude Cowork tasks (archive and delete) always run one at a time. A 403 stops immediately without retries or alternate endpoints. A short rate limit (a Retry-After of 30 seconds or less) pauses the pool, halves the requests in flight and resumes automatically, up to three times per run; requests that were already in flight when the pause began join it instead of halving again, and a rate limit without Retry-After gets one guessed 5-second pause; a longer or repeated rate limit stops the batch, starts a cooldown and reduces concurrency to 1. Stop prevents pending requests; requests already sent cannot be recalled. Keep the initiating page open until processing ends.

ChatGPT supports bulk archiving. Open Archived chats from the sidebar management menu or extension popup to select, restore or delete archived conversations; the native Archived Chats settings also gains bulk controls. Select all applies to loaded items, and Load more continues the list. Failed items remain selected; deletion requires confirmation. Grok archiving is not offered because no native conversation archive operation has been verified; there is no local hiding substitute.

Kimi and Qwen support bulk deletion from the sidebar. Kimi rows are native links; deletion calls the website’s Connect RPC chat service one chat per request with the page’s own login token. Qwen rows carry no identifiers, so Chat Tidy reads the website’s own chat list and matches rows by title and order; rows it cannot match, and rows whose title another chat shares, receive no checkbox, and an action runs only if each chosen chat still sits on the very row you ticked. Qwen also supports bulk archiving and an Archived chats manager for restoring or deleting archived conversations. Z.ai (chat.z.ai) supports bulk deletion only: its sidebar rows carry no identifiers, so Chat Tidy reads the website’s own chat list and matches rows by title; rows it cannot match, and rows whose title another chat shares, receive no checkbox. Deletion calls the website’s own per-chat endpoint with the page’s login.

ChatGPT and Qwen chats can be moved into a project, and Claude chats into a group, from the management menu: pick an existing destination or type a name to create a new one first; a failed creation moves nothing. ChatGPT updates each conversation’s project, Claude updates each conversation record with the group, and Qwen adds up to 20 chats per request. Moved ChatGPT and Qwen chats leave the main list, while Claude keeps them in recents. Cowork tasks cannot be moved. Ordinary Claude chats never show Archive; the item appears only while the selection consists of Cowork tasks alone.

The popup follows its content: collapsing the guide leaves no empty space, and the expanded guide fits the popup height in the default languages. The Settings page lists what each website supports.

Cowork uses its native session endpoints, one task per request, independently of the concurrency setting. Some tasks require device attestation. This extension does not generate or copy device proofs; rejected operations stop and must be completed using Claude’s native controls. Successful responses are required before items disappear.

Grok’s View all search dialog supports checkboxes and a top bulk-delete toolbar. The popup shows a Show all switch only on Grok: it reads the native paginated history and adds omitted chats to the sidebar. Disabling it restores the original list. History metadata stays in page memory and is discarded on reload; request failures stop loading.

The bottom Settings page saves System (default), Light or Dark appearance locally. On Grok, Hide Bots and Collapse Bots by default are available and default to off; hiding takes precedence, and the collapse is only the state after a reload, so you can still expand the section by hand. The Chrome version also offers Hide support to remove the entire support section.

## Chat enhancements

Open any conversation to use them; the popup's Chat enhancements page explains each one and turns it on or off.

- **Outline and search**: a thin rail of ticks on the right of the chat, one per question. Hover to read a question, click to jump. Open the list to search the messages loaded on the page (matches are highlighted and you can step through them), bookmark answers, and add tags and a note to the chat or to an answer.
- **My bookmarks**: the popup lists bookmarked chats and answers. Search titles, tags and notes or filter by tag; opening an answer scrolls back to it.
- **Code blocks**: line numbers, folding of blocks longer than 24 lines, per-line copy for shell commands and an amber warning for risky commands such as `rm -rf /` or `curl … | sh`. Where the website already shows line numbers (Qwen), only copy and warnings are added.
- **Page layout** (off by default): chat width, compact sidebar, hide disclaimers and upgrade prompts, focus mode. An option a website does not support is marked in the popup.

| | Outline, search, bookmarks, code | Width | Compact sidebar | Hide disclaimers | Focus mode |
|---|---|---|---|---|---|
| ChatGPT | ✓ | ✓ | – (native resizable sidebar) | ✓ | ✓ |
| Claude | ✓ | ✓ | ✓ | ✓ | ✓ |
| Grok | ✓ | ✓ | ✓ | – (nothing to hide) | ✓ |
| Gemini | ✓ | ✓ | ✓ | ✓ | ✓ |
| Kimi | ✓ | ✓ | ✓ | ✓ | ✓ |
| Qwen | ✓ | ✓ | ✓ | ✓ | ✓ |
| Z.ai | ✓ | ✓ | ✓ | – | ✓ |

Search covers messages the website has loaded; long chats on Claude, Grok and Gemini load older messages as you scroll up.

## Privacy and compatibility

Runs only on chatgpt.com, claude.ai, grok.com, gemini.google.com, www.kimi.com, chat.qwen.ai and chat.z.ai. Preferences, cooldown state and your bookmarks (titles, addresses, tags, notes and, for answers, short excerpts of up to 300 characters) are stored locally and never leave the browser. Conversation titles, identifiers and session credentials are used temporarily for user-requested operations; message text on the open chat is read in page memory for the outline, search and code tools and is not stored unless you bookmark it. No developer server, advertising or analytics. Website API changes may affect compatibility.

Claude selection is scoped to the active workspace. Cowork tasks support selection, deletion and native archiving. Ordinary Claude chats do not support archiving in this extension; select only Cowork tasks to enable Archive. Grok bots are excluded. These are website interfaces, not documented public APIs; endpoint behavior was checked against website code, while automated tests use simulated responses. Project creation on ChatGPT and Claude and Kimi’s optional device-shield header were checked against public client code but not exercised against live accounts.

## Development

Requires Node.js and npm.

```sh
npm ci
npm run build:i18n
npm run check
npm test
npm run package   # writes release/chat-tidy-<version>.zip
```

Tests use fictional conversations and simulated responses; they do not delete real chats.

Translations are maintained in `_locales/*/messages.json`. Run `npm run build:i18n` after editing translations. The generated bundle preserves manual language switching; Chrome uses the same catalogs for manifest text. The Chinese catalogs cover simplified and traditional scripts, without separate regional editions.

Package `manifest.json`, `popup.html`, `src/`, `_locales/`, `icons/`, `LICENSE` for distribution.

## Support

If Chat Tidy is useful to you, you can support its development on Ko-fi or Afdian.

<p>
  <a href="https://ko-fi.com/U2C326XLKJ"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support on Ko-fi" width="223" height="30" /></a>&nbsp;&nbsp;
  <a href="https://afdian.com/a/redPeak5421"><img src="docs/assets/afdian-en.svg" alt="Support on Afdian" width="223" height="30" /></a>
</p>

## License

Licensed under the [Apache License 2.0](LICENSE). The GitHub logo is an official brand asset used to link to this repository, subject to [GitHub’s brand guidelines](https://brand.github.com/foundations/logo). It is not covered by this project’s Apache license.

Gemini: select recent conversations using the management icon on the Recent heading row. Only selected conversations are deleted, using the native same-origin API. Deletion is sequential; stop and failed-item selection are preserved. Reload website tabs after updating the extension.
