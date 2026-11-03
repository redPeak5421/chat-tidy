/* Chat width, resizable sidebar, hidden clutter and focus mode (feature 5): one owned stylesheet built from the site adapter. */
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
  // Sidebar drag handle: a thin line on the open sidebar's right edge. z-index 61 sits over edge rails such as Grok's (z-60).
  const handleCss = `.cs-sidebar-handle{position:fixed;z-index:61;width:10px;margin:0 0 0 -5px;padding:0;border:0;background:none;cursor:col-resize;touch-action:none;outline:none}
.cs-sidebar-handle::after{content:"";position:absolute;inset-block:0;left:4px;width:2px;border-radius:1px;background:#6366f1;opacity:0;transition:opacity .15s}
.cs-sidebar-handle:hover::after{opacity:.7;transition-delay:.12s}
.cs-sidebar-handle:focus-visible::after,.cs-sidebar-handle[data-dragging]::after{opacity:1;transition-delay:0s}
:root[data-cs-resizing],:root[data-cs-resizing] *{cursor:col-resize!important;user-select:none!important}
@media(forced-colors:active){.cs-sidebar-handle::after{background:Highlight}}`;
  const sidebarRange = Object.freeze({min: 180, max: 480, step: 16});
  const clampWidth = value => Math.round(Math.min(sidebarRange.max, Math.max(sidebarRange.min, value)));
  // The stored width for this site, clamped, or 0 when the site keeps its own width.
  function sidebarWidth(adapter, settings) {
    const value = Number(settings?.sidebarWidths?.[adapter?.id]);
    return Number.isFinite(value) && value > 0 ? clampWidth(value) : 0;
  }
  const resizable = (adapter, settings) => !!(settings?.enabled && settings.compactSidebar && !settings.focusMode && adapter?.layout?.compactSidebar && adapter.layout.sidebar);
  // Pure: the stylesheet text for these settings, or '' when nothing applies.
  function css(adapter, settings) {
    const layout = adapter?.layout || {}, parts = [];
    if (!settings?.enabled) return '';
    const width = widths[settings.chatWidth];
    if (width && layout.width) parts.push(layout.width.split('{width}').join(width));
    const sidebar = settings.compactSidebar && layout.sidebar ? sidebarWidth(adapter, settings) : 0;
    if (sidebar && layout.compactSidebar) parts.push(layout.compactSidebar.split('{sidebar}').join(sidebar + 'px'));
    if (settings.hideClutter && layout.clutter) parts.push(layout.clutter);
    if (settings.focusMode && layout.focus) parts.push(layout.focus);
    return parts.join('\n');
  }
  function create({t = key => key, adapter} = {}) {
    let style = null, exit = null, handle = null, dead = false, current = null, dragging = null, saveTimer = 0, poll = 0;
    const stop = event => { if (event.key !== 'Escape') event.stopPropagation(); };
    const panel = () => [...document.querySelectorAll(adapter.layout.sidebar)].find(node => !node.closest('[data-cs-owned]') && node.getBoundingClientRect().width >= 120) || null;
    function write(sheet) {
      if (!sheet) { style?.remove(); style = null; return; }
      // content.js cleanup() may have removed our nodes: rebuild whatever is missing.
      if (!style?.isConnected) { style = document.createElement('style'); style.id = 'cs-layout'; style.dataset.csOwned = 'true'; (document.head || document.documentElement).append(style); }
      if (style.textContent !== sheet) style.textContent = sheet;
    }
    function sheetFor(settings) {
      const text = css(adapter, settings), focused = !!(settings?.enabled && settings.focusMode && adapter?.layout?.focus);
      return [text, focused ? exitCss : '', resizable(adapter, settings) ? handleCss : ''].filter(Boolean).join('\n');
    }
    function clear() { style?.remove(); exit?.remove(); dropHandle(); style = exit = null; }
    // Follows the sidebar edge; hidden while the sidebar is collapsed, closed or missing.
    function place() {
      if (!handle?.isConnected) return;
      const box = panel()?.getBoundingClientRect();
      handle.hidden = !box;
      if (!box) return;
      handle.style.left = Math.round(box.right) + 'px'; handle.style.top = Math.round(box.top) + 'px'; handle.style.height = Math.round(box.height) + 'px';
      const width = Math.round(box.width);
      handle.setAttribute('aria-valuenow', String(width)); handle.setAttribute('aria-valuetext', width + ' px');
    }
    function save(width) {
      const widths = {...(current?.sidebarWidths || {})};
      if (width) widths[adapter.id] = width; else delete widths[adapter.id];
      current = {...current, sidebarWidths: widths};
      try { void chrome.storage.local.set({sidebarWidths: widths})?.catch?.(() => {}); } catch { /* Invalidated extension: the width lasts until reload. */ }
    }
    // While dragging, only our stylesheet changes; storage is written once the drag ends.
    function preview(width) { current = {...current, sidebarWidths: {...(current?.sidebarWidths || {}), [adapter.id]: width}}; write(sheetFor(current)); place(); }
    function makeHandle() {
      handle = document.createElement('div'); handle.className = 'cs-sidebar-handle'; handle.dataset.csOwned = 'true';
      handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical'); handle.tabIndex = 0;
      handle.setAttribute('aria-valuemin', String(sidebarRange.min)); handle.setAttribute('aria-valuemax', String(sidebarRange.max));
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const box = panel()?.getBoundingClientRect(); if (!box) return;
        event.preventDefault(); event.stopPropagation();
        dragging = {left: box.left, id: event.pointerId, moved: false};
        try { handle.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers cannot be captured. */ }
        handle.dataset.dragging = ''; document.documentElement.dataset.csResizing = '';
      });
      handle.addEventListener('pointermove', event => { if (!dragging || event.pointerId !== dragging.id) return; dragging.moved = true; preview(clampWidth(event.clientX - dragging.left)); });
      const end = event => {
        if (!dragging || event.pointerId !== dragging.id) return;
        const moved = dragging.moved; dragging = null;
        delete handle.dataset.dragging; delete document.documentElement.dataset.csResizing;
        if (moved) save(sidebarWidth(adapter, current));
      };
      handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
      // Double-click gives the sidebar back its own width.
      handle.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); save(0); write(sheetFor(current)); requestAnimationFrame(place); });
      handle.addEventListener('keydown', event => {
        const step = {ArrowLeft: -sidebarRange.step, ArrowRight: sidebarRange.step}[event.key];
        if (event.key !== 'Escape') event.stopPropagation();
        if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); preview(event.key === 'Home' ? sidebarRange.min : sidebarRange.max); }
        else if (step) { event.preventDefault(); const box = panel()?.getBoundingClientRect(); if (!box) return; preview(clampWidth(box.width + step)); }
        else return;
        clearTimeout(saveTimer); saveTimer = setTimeout(() => save(sidebarWidth(adapter, current)), 400);
      });
      for (const type of ['keyup', 'keypress', 'click']) handle.addEventListener(type, event => { if (event.key !== 'Escape') event.stopPropagation(); });
      (document.body || document.documentElement).append(handle);
      addEventListener('resize', place);
      // Sites rerender and collapse their sidebars without telling us; a cheap rect read keeps the line on the edge.
      poll = setInterval(place, 500);
    }
    function dropHandle() {
      handle?.remove(); handle = null; dragging = null; clearInterval(poll); poll = 0; clearTimeout(saveTimer);
      removeEventListener('resize', place); delete document.documentElement.dataset.csResizing;
    }
    function update(settings) {
      if (dead) return;
      // A drag in progress keeps its live width; the stored value catches up when it ends.
      current = dragging ? {...settings, sidebarWidths: current?.sidebarWidths} : settings;
      const sheet = sheetFor(current), focused = !!(current?.enabled && current.focusMode && adapter?.layout?.focus);
      if (!sheet) return clear();
      write(sheet);
      if (resizable(adapter, current)) { if (!handle?.isConnected) { dropHandle(); makeHandle(); } handle.setAttribute('aria-label', t('sidebarResize')); place(); }
      else dropHandle();
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
  return {create, css, widths, exitCss, sidebarRange};
})();
