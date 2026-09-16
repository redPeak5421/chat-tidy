# Archive and Settings Implementation Plan

> Execute with superpowers:executing-plans. User approved design; do not commit these changes.

**Goal:** Deliver archive management, local appearance preferences and Grok Bots controls in main and safari-main at one version.
**Architecture:** Separate archive UI/data, appearance and Bots controllers; reuse existing batching, local storage and translations. Keep Safari direct execution and no donation assets.
**Tech Stack:** JavaScript, browser extensions, node:test/jsdom, Playwright Chromium/WebKit, Xcode.

- [x] Add failing popup tests for secondary settings, theme persistence and site-scoped controls in tests/settings.test.cjs. Implement popup.html, src/popup.js, src/popup.css and localizations; run node --test tests/settings.test.cjs.
- [x] Inspect real ChatGPT archive UI and website resources for listing and restore behavior; record only schema and selectors, no personal data.
- [x] Add tests for restore payloads, list pagination, failed operations and cancellation. Implement src/archive.js and extend src/batch.js, keeping authentication ephemeral and operations scoped.
- [x] Integrate independent archive dialog and native multi-selection through src/content.js and src/content.css. Add DOM tests for selection, confirmation, restoration and native rerender cleanup.
- [x] Inspect Grok Bots section; test reversible hiding/collapsing and precedence. Implement dedicated src/bots.js controller and integrate local storage updates.
- [x] Add complete six-language labels; regenerate src/i18n.js. Verify all manifests reference new files.
- [x] Create main worktree; apply common changes with native Chrome API adaptation, retain support controls in main only. Never commit/push feature work.
- [x] Bump package, lockfile, manifest, popup and Safari project marketing version to 1.9.0; maintain increasing build number.
- [x] Run npm run check, npm test, browser UI tests on both variants and Safari compilation. Inspect final diff and versions. Deliver both uncommitted workspaces with evidence.
