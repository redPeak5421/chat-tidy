# Gemini support verification

Scope: Gemini bulk deletion in main and safari-main, with the management icon beside Recent. Feature changes remain uncommitted.

Observed website DOM (2026-09-15): side-navigation-content inside main; conversations-list contains gem-nav-list-item[data-test-id="conversation"] anchors; Recent uses button[aria-controls="sidenav-section-content-chats"] in .expandable-section-header-row. The Notebook and main conversation content are excluded from selection.

Native website source: Gemini's public BardChatUi bundle, modules LQaXg and ziINQc, build boq_assistant-bard-web-server_20260914.08_p0. DeleteConversation uses RPC GzXR5e, with the conversation ID in request field 1. Native conversation IDs are c_ followed by 1–16 hexadecimal characters; displayed app routes omit c_. Credentials are read from the loaded same-origin page; account identity is rechecked before each deletion. No app-page refetch is performed. Deletion uses the native batchexecute transport and requires a matching empty response acknowledgment.

Checks: source syntax and locale checks; ID scope, exact RPC payload, account switching, cancellation and unsupported archive tests; Chromium/WebKit integration with the real DOM structure modeled in isolated fixtures. Layout asserts the Recent button and icon share the same vertical center. Fixtures confirm only the selected ID is sent and other rows remain visible. Existing site tests remain part of the full regression run. No real conversations were deleted for testing.

Safari macOS and iOS simulator builds pass. The packaged macOS extension contains src/gemini.js and gemini.google.com host/content-script permissions. After updating, reload extension/site tabs and grant Gemini website access where requested.

2026-09-16: /app?authuser=0 returns HTTP 302 to /app. The previous redirect:error preparatory fetch therefore failed before deletion. Removed this redundant fetch; added a regression that throws on the old request, plus a browser fixture with the actual redirect shape. Both branches pass 91 unit/DOM tests; Chromium and desktop/mobile WebKit Gemini integration tests pass.
