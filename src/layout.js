/* Chat width, compact sidebar, hidden clutter and focus mode (feature 5): one owned stylesheet built from the site adapter. */
globalThis.ChatTidyLayout = (() => {
  const widths = Object.freeze({wide: '1040px', full: 'calc(100% - 48px)'});
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v3a2 2 0 0 1-2 2H4M15 4v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4M15 20v-3a2 2 0 0 1 2-2h3"/></svg>';
  const light = '--cs-color-0:#202321;--cs-color-1:#6e7671;--cs-color-3:#fff;--cs-color-4:#dce2dd', dark = '--cs-color-0:#f2f2f2;--cs-color-1:#9a9a9a;--cs-color-3:#141414;--cs-color-4:#3a3a3a';
  // The exit button mirrors content.css tokens: OS dark by default, then the forced light/dark theme on <html>.
  const exitCss = `.cs-focus-exit{${light}}@media(prefers-color-scheme:dark){.cs-focus-exit{${dark}}}:root[data-cs-theme="light"] .cs-focus-exit{${light}}:root[data-cs-theme="dark"] .cs-focus-exit{${dark}}
/* z-index 45 keeps the exit button under site dialogs (typically z-50) while staying above page content. */
.cs-focus-exit{position:fixed;top:12px;right:16px;z-index:45;display:inline-flex;align-items:center;gap:6px;height:32px;margin:0;padding:0 12px 0 10px;border:1px solid var(--cs-color-4);border-radius:16px;background:var(--cs-color-3);color:var(--cs-color-1);font:500 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 2px 10px #0000001f;cursor:pointer;opacity:.78;animation:cs-focus-in .2s ease-out;transition:opacity .16s,color .16s,border-color .16s}
.cs-focus-exit svg{flex:none;width:16px;height:16px}
.cs-focus-exit:hover,.cs-focus-exit:focus-visible{opacity:1;color:var(--cs-color-0);border-color:#6366f1}
.cs-focus-exit:hover svg{color:#6366f1}
.cs-focus-exit:focus-visible{outline:2px solid #6366f1;outline-offset:2px}
@keyframes cs-focus-in{from{opacity:0}}
@media(forced-colors:active){.cs-focus-exit{border-color:ButtonText;opacity:1}}`;
  // Pure: the stylesheet text for these settings, or '' when nothing applies.
  function css(adapter, settings) {
    const layout = adapter?.layout || {}, parts = [];
    if (!settings?.enabled) return '';
    const width = widths[settings.chatWidth];
    if (width && layout.width) parts.push(layout.width.split('{width}').join(width));
    if (settings.compactSidebar && layout.compactSidebar) parts.push(layout.compactSidebar);
    if (settings.hideClutter && layout.clutter) parts.push(layout.clutter);
    if (settings.focusMode && layout.focus) parts.push(layout.focus);
    return parts.join('\n');
  }
  function create({t = key => key, adapter} = {}) {
    let style = null, exit = null, dead = false;
    const stop = event => { if (event.key !== 'Escape') event.stopPropagation(); };
    function clear() { style?.remove(); exit?.remove(); style = exit = null; }
    function update(settings) {
      if (dead) return;
      const text = css(adapter, settings), focused = !!(settings?.enabled && settings.focusMode && adapter?.layout?.focus);
      if (!text) return clear();
      // content.js cleanup() may have removed our nodes: rebuild whatever is missing.
      if (!style?.isConnected) { style = document.createElement('style'); style.id = 'cs-layout'; style.dataset.csOwned = 'true'; (document.head || document.documentElement).append(style); }
      const sheet = focused ? text + '\n' + exitCss : text;
      if (style.textContent !== sheet) style.textContent = sheet;
      if (!focused) { exit?.remove(); exit = null; return; }
      if (!exit?.isConnected) {
        exit = document.createElement('button'); exit.type = 'button'; exit.className = 'cs-focus-exit'; exit.dataset.csOwned = 'true'; exit.innerHTML = icon; exit.append(document.createElement('span'));
        exit.addEventListener('click', () => { try { void chrome.storage.local.set({focusMode: false})?.catch?.(() => {}); } catch { /* Invalidated extension: the page keeps its layout until reload. */ } });
        for (const type of ['keydown', 'keyup', 'keypress']) exit.addEventListener(type, stop);
        (document.body || document.documentElement).append(exit);
      }
      const label = t('focusExit');
      if (exit.lastChild.textContent !== label) exit.lastChild.textContent = label;
    }
    function destroy() { dead = true; clear(); }
    return {update, destroy};
  }
  return {create, css, widths, exitCss};
})();
