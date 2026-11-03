/* Chat-area structure per site for the reading tools (outline, search, code tools, layout).
   Every function only reads the DOM. A site entry overrides the generic fallback field by field.
   Selectors and layout CSS were checked live on 2026-11-01 (ChatGPT app shell, Claude, Grok, Gemini, Kimi, Z.ai); Qwen's chat page is
   unverified and keeps Open WebUI-style guesses, so it only gets the features that degrade to nothing when a guess misses. */
globalThis.ChatTidyReaderSites = (() => {
  const own = node => !!node.closest?.('[data-cs-owned]');
  const text = node => (node?.innerText ?? node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const attr = name => el => el.getAttribute(name) || el.closest(`[${name}]`)?.getAttribute(name) || null;
  // Messages oldest first. spec: [{selector, role: 'user'|'assistant'|fn(node), id?: fn(node), body?: selector inside the node}];
  // order(el) gives the position for windowed lists whose DOM order can differ from the reading order.
  function collect(specs, root = document, order) {
    const found = [];
    for (const spec of specs) for (const el of root.querySelectorAll(spec.selector)) {
      if (own(el) || el.closest('[contenteditable="true"],textarea,form')) continue;
      const role = typeof spec.role === 'function' ? spec.role(el) : spec.role;
      if (role !== 'user' && role !== 'assistant') continue;
      // body may list selectors by priority (an array): the first that matches wins, whatever its document position.
      const body = [].concat(spec.body || []).map(selector => el.querySelector(selector)).find(Boolean) || el;
      found.push({el, role, id: spec.id?.(el) || null, body});
    }
    found.sort((a, b) => a.el === b.el ? 0 : a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    // Nested matches (a turn wrapper and its own message) keep the innermost element; in document order a wrapper comes
    // right before what it contains, so one pass over the sorted list is enough.
    const unique = [];
    for (const item of found) { const last = unique[unique.length - 1]; if (last && last.el.contains(item.el)) unique[unique.length - 1] = item; else if (!last || last.el !== item.el) unique.push(item); }
    // A missing position anywhere keeps plain DOM order: mixing numeric and DOM comparisons would not be a consistent sort.
    if (order) { const keys = unique.map(item => Number(order(item.el))); if (keys.every(Number.isFinite)) { const at = new Map(unique.map((item, i) => [item, [keys[i], i]])); unique.sort((a, b) => { const [x, i] = at.get(a), [y, j] = at.get(b); return x - y || i - j; }); } }
    return unique;
  }
  function scrollerOf(node) {
    for (let el = node?.parentElement; el && el !== document.body; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
    }
    return document.scrollingElement || document.documentElement;
  }
  // [{pre, code, lang, editor?}] in document order. Read-only editors render code without a pre of their own:
  // - CodeMirror 6 (Z.ai): the .cm-editor stands in for pre, code is .cm-content, each .cm-line is one line;
  // - Monaco (Qwen chat pages, inside pre.qwen-markdown-code): the .monaco-editor stands in, code is .view-lines, each
  //   absolutely positioned .view-line is one line (order by its top), and Monaco already draws line numbers.
  // editor names the kind, so the code tools read rendered lines instead of text nodes.
  function codeBlocks(root, lang) {
    const found = [];
    const named = (value, el) => { const name = value || lang?.(el) || null; return name ? name.trim().toLowerCase() : null; };
    for (const pre of root.querySelectorAll('pre')) {
      if (own(pre) || pre.closest('[contenteditable="true"],textarea,.cm-editor,.monaco-editor')) continue;
      const monaco = pre.querySelector('.monaco-editor');
      if (monaco) { const lines = monaco.querySelector('.view-lines'); if (lines) found.push({pre: monaco, code: lines, lang: named(null, pre), editor: 'monaco', numbered: true}); continue; }
      const code = pre.querySelector('code') || pre;
      // The class names the highlighter's language; some sites print it only in the block header.
      found.push({pre, code, lang: named((code.className.match?.(/language-([\w+#.-]+)/) || pre.className.match?.(/language-([\w+#.-]+)/) || [])[1] || pre.dataset.language, pre)});
    }
    for (const editor of root.querySelectorAll('.cm-editor')) {
      const content = editor.querySelector('.cm-content');
      if (own(editor) || !content || content.getAttribute('contenteditable') === 'true' || editor.closest('form,textarea')) continue;
      found.push({pre: editor, code: content, lang: named((editor.closest('[class*="language-"]')?.className.match(/language-([\w+#.-]+)/) || [])[1], editor), editor: 'codemirror'});
    }
    return found.sort((a, b) => a.pre === b.pre ? 0 : a.pre.compareDocumentPosition(b.pre) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  }
  const generic = {
    // Selectors that hold the whole conversation; the first visible match wins.
    thread: 'main',
    messages: [
      {selector: '[data-message-author-role="user"]', role: 'user', id: el => el.getAttribute('data-message-id')},
      {selector: '[data-message-author-role="assistant"]', role: 'assistant', id: el => el.getAttribute('data-message-id')}
    ],
    exclude: '.sr-only',
    order: null,
    lazy: false,
    codeLang: null,
    // CSS for the layout options; {width} is replaced with the chosen max-width. An empty string means unsupported here.
    // compactSidebar sets the dragged sidebar width ({sidebar}); sidebar is the open panel the drag handle sits on.
    layout: {width: '', compactSidebar: '', sidebar: '', clutter: '', focus: ''}
  };
  const chatgptId = el => {
    const key = el.getAttribute('data-content-search-unit-key');
    // Live: the user unit sits inside its id holder, the assistant unit is its own holder.
    const holder = el.closest('[data-chatgpt-search-message-ids]') || el.querySelector('[data-chatgpt-search-message-ids]') || (key && el.parentElement?.querySelector(`[data-chatgpt-search-unit-key="${CSS.escape(key)}"]`));
    return holder?.getAttribute('data-chatgpt-search-message-ids')?.split(/\s+/)[0] || el.querySelector('[data-chatgpt-selection-message-id]')?.getAttribute('data-chatgpt-selection-message-id') || null;
  };
  const sites = {
    chatgpt: {
      thread: 'main',
      // The app shell marks each message as a search unit ending in :user or :assistant; the legacy role attributes stay as a fallback.
      messages: [
        {selector: '[data-content-search-unit-key$=":user"]', role: 'user', id: chatgptId, body: '[data-user-message-bubble]'},
        {selector: '[data-content-search-unit-key$=":assistant"]', role: 'assistant', id: chatgptId, body: '[class*="MarkdownRoot"]'},
        {selector: '[data-message-author-role="user"]', role: 'user', id: el => el.getAttribute('data-message-id'), body: '.whitespace-pre-wrap'},
        {selector: '[data-message-author-role="assistant"]', role: 'assistant', id: el => el.getAttribute('data-message-id'), body: '.markdown'}
      ],
      exclude: '.sr-only,h4[data-conversation-role],[data-markdown-copy="exclude"],[data-chatgpt-agent-turn-start]',
      codeLang: pre => text(pre.closest('[data-code-block]')?.firstElementChild?.querySelector('.truncate')) || null,
      layout: {
        width: '[data-request-input-activity-root],main{--thread-content-responsive-max-width:{width}!important}[class*="transcriptContent"],[class*="thread-content-max-width"]{--thread-content-max-width:{width}!important}',
        // The app-shell sidebar is natively resizable (inline width set by its drag handle), so compact stays off here.
        compactSidebar: '',
        // In a chat the disclaimer reads a visibility variable; on the new-chat page it sits alone in the composer banner portal.
        clutter: '[data-request-input-activity-root]{--thread-composer-disclaimer-visibility:hidden!important}[class*="ComposerBannerPortal"] > [data-markdown-copy="exclude"]{display:none!important}',
        focus: 'aside.app-shell-left-panel,nav[data-app-navigation-rail],[data-app-shell-main-titlebar],#stage-slideover-sidebar,#page-header{display:none!important}'
      }
    },
    claude: {
      thread: 'main,[data-testid="chat-column-body"]',
      messages: [
        {selector: '[data-testid="user-message"]', role: 'user', id: attr('data-turn-key')},
        {selector: '[data-testid="assistant-message"]', role: 'assistant', id: attr('data-turn-key'), body: '.standard-markdown,.font-claude-response'}
      ],
      // Long chats are windowed (only rows near the viewport are mounted); rows carry their list position.
      lazy: true,
      order: el => el.closest('[data-rs-index]')?.getAttribute('data-rs-index'),
      layout: {
        width: '[data-testid="chat-column-body"]{--transcript-width:{width}!important}',
        // The sidebar has its own drag handle (232-420px, written to --df-sidebar-width inline), so ours stays off here.
        compactSidebar: '',
        clutter: '[role="note"][data-disclaimer="true"]{display:none!important}',
        focus: '.dframe-root{--df-sidebar-width:0px!important}aside.dframe-sidebar,[data-testid="chat-header"]{display:none!important}'
      }
    },
    grok: {
      thread: 'main,[data-testid="drop-ui"]',
      messages: [
        {selector: '[data-testid="user-message"]', role: 'user', id: el => el.closest('[id^="response-"]')?.id.slice(9) || null, body: '.response-content-markdown'},
        {selector: '[data-testid="assistant-message"]', role: 'assistant', id: el => el.closest('[id^="response-"]')?.id.slice(9) || null, body: '.response-content-markdown'}
      ],
      exclude: '.sr-only,.thinking-container,[data-testid="code-block"] > div > div:first-child',
      lazy: true,
      // Shiki blocks carry no language class; the header (first row of the bordered box) names it, beside collapse and copy.
      codeLang: pre => text(pre.closest('[data-testid="code-block"]')?.querySelector(':scope > div > div:first-child > span')) || null,
      // Plane rows are absolutely positioned with translateY, so their DOM order is not the reading order.
      order: el => el.getBoundingClientRect().top,
      layout: {
        width: '[class*="@container/chat"]{--content-max-width:{width}!important}',
        // The native rail at the edge only collapses on click; the trigger button in the sidebar header still does that.
        compactSidebar: '[class*="group/sidebar-wrapper"]{--sidebar-width:{sidebar}!important}',
        sidebar: 'div.peer[data-side="left"][data-state="expanded"] [data-sidebar="sidebar"]',
        clutter: '',
        // The shadcn peer wrapper reserves the sidebar's width; hiding it lets the chat take the whole row.
        focus: 'div.peer[data-side="left"][data-state],[data-sidebar="sidebar"],[data-sidebar="resize-handle"]{display:none!important}'
      }
    },
    gemini: {
      thread: 'chat-window,main',
      messages: [
        {selector: 'user-query', role: 'user', id: el => el.closest('.conversation-container')?.id || null, body: '.query-text'},
        {selector: 'model-response', role: 'assistant', id: el => el.closest('.conversation-container')?.id || null, body: '.markdown-main-panel,message-content'}
      ],
      exclude: '.sr-only,.model-response-label-announcer,.response-container-header,.response-container-footer,.code-block-decoration',
      // Older turns load when the history is scrolled to the top.
      lazy: true,
      codeLang: pre => text(pre.closest('code-block')?.querySelector('.code-block-decoration.header-formatted > span')) || null,
      layout: {
        // xl-grid caps every child at 708px with no variable; the legacy layout reads the variable.
        width: 'chat-window,.chat-history{--bard-chat-window-max-width-default:{width}!important}.conversation-container,.conversation-container user-query,model-response .markdown > *,.response-container-header,.response-container-footer,model-response-disclaimers,code-block{max-width:{width}!important}',
        // The open width comes from a variable; the collapsed rail uses its own (--bard-sidenav-closed-width) and is untouched.
        compactSidebar: 'bard-sidenav,side-navigation-content{--bard-sidenav-open-width:{sidebar}!important}',
        sidebar: 'bard-sidenav',
        clutter: 'hallucination-disclaimer,chat-app-banners.app-upsell-banner,g1-dynamic-upsell-button,.buttons-container.adv-upsell{display:none!important}',
        focus: 'bard-sidenav,top-bar-actions{display:none!important}'
      }
    },
    kimi: {
      thread: '.chat-content-list,main',
      messages: [
        {selector: '.chat-content-item-user', role: 'user', id: attr('data-archer-id'), body: '.user-content'},
        {selector: '.chat-content-item-assistant', role: 'assistant', id: attr('data-archer-id'), body: '.markdown'}
      ],
      exclude: '.sr-only,.segment-code-header',
      codeLang: pre => text(pre.closest('.segment-code')?.querySelector('.segment-code-lang')) || null,
      layout: {
        width: '.chat-content-list{max-width:{width}!important}',
        // Only while the sidebar is shown (.has-sidebar); .main keeps a left margin equal to the sidebar width.
        compactSidebar: '.app.has-sidebar>.sidebar-slot,.app.has-sidebar aside.next-sidebar{width:{sidebar}!important;min-width:{sidebar}!important}.app.has-sidebar>.main{margin-left:{sidebar}!important}',
        sidebar: '.app.has-sidebar aside.next-sidebar',
        clutter: '.chat-bottom .legal-footer,a.membership-plan{display:none!important}',
        // .main keeps a left margin equal to the sidebar width.
        focus: '.sidebar-slot,aside.next-sidebar,.layout-header{display:none!important}.app.has-sidebar>.main{margin-left:0!important}'
      }
    },
    // Messages checked live on the chat page and on public share pages (/s/<id>), which use the same components; code on chat
    // pages is a read-only Monaco editor inside pre, on share pages plain code inside pre.
    qwen: {
      thread: '#chat-message-container,.share-layout-messages,main',
      messages: [
        {selector: '.qwen-chat-message-user', role: 'user', body: '.user-message-content'},
        {selector: '.qwen-chat-message-assistant', role: 'assistant', id: el => el.querySelector('.chat-response-message')?.id.replace(/^chat-response-message-/, '') || null, body: ['.response-message-content.phase-answer .qwen-markdown', '.qwen-markdown']}
      ],
      // The code header (language, copy, download) sits inside pre as a sticky row; thinking phases are not the answer.
      exclude: '.sr-only,.qwen-markdown-code-header-wrapper,.phase-think',
      codeLang: pre => text(pre.querySelector('.qwen-markdown-code-header > div:first-child')) || null,
      layout: {
        width: '.qwen-chat-message{max-width:{width}!important}',
        // Only the open desktop sidebar: the collapsed rail (.sidebar-collapse, 60px) and the mobile drawer are left alone.
        compactSidebar: 'html:not(.mobile) .sidebar-wrapper .sidebar:not(.sidebar-collapse):not(.sidebar-floating-collapse),html:not(.mobile) .sidebar-wrapper .sidebar:not(.sidebar-collapse):not(.sidebar-floating-collapse) .sidebar-side{width:{sidebar}!important;max-width:{sidebar}!important}',
        sidebar: 'html:not(.mobile) .sidebar-wrapper .sidebar:not(.sidebar-collapse):not(.sidebar-floating-collapse)',
        clutter: '.chat-container-statement{display:none!important}',
        focus: '.sidebar-wrapper,header.header-desktop{display:none!important}'
      }
    },
    zai: {
      thread: '#messages-container,main',
      messages: [{
        selector: 'div[id^="message-"]:not([id$="-start"])', id: el => el.id.slice(8), body: '.markdown-prose',
        role: el => el.classList.contains('user-message') || el.querySelector('.chat-user') ? 'user' : el.querySelector('.chat-assistant') ? 'assistant' : null
      }],
      layout: {
        width: '#messages-container [class*="max-w-[808px]"]{max-width:{width}!important}',
        // Two nested Tailwind w-[238px] boxes fix the width; a collapsed sidebar (data-collapsed=true) is left alone.
        compactSidebar: '#sidebar[data-collapsed="false"] [class*="w-[238px]"]{width:{sidebar}!important}',
        sidebar: '#sidebar[data-collapsed="false"]',
        clutter: '',
        focus: '#sidebar,#chat-container nav.sticky.top-0{display:none!important}'
      }
    }
  };
  function get(id) {
    const spec = sites[id];
    if (!spec) return null;
    const merged = {...generic, ...spec, layout: {...generic.layout, ...spec.layout}};
    // Question and answer text without the site chrome inside the body; only bodies that hold such chrome pay for a copy.
    // Our own code-tool gutters and chips sit inside answers too; they never belong to the text.
    const skip = '[data-cs-owned]' + (merged.exclude ? ',' + merged.exclude : '');
    const readable = body => {
      if (!body?.querySelector(skip)) return text(body);
      const copy = body.cloneNode(true); copy.querySelectorAll(skip).forEach(node => node.remove());
      return (copy.textContent || '').replace(/\s+/g, ' ').trim();
    };
    return {
      id, lazy: !!merged.lazy, layout: merged.layout, exclude: merged.exclude,
      thread() { for (const selector of merged.thread.split(',')) { const el = [...document.querySelectorAll(selector)].find(node => node.getClientRects().length); if (el) return el; } return document.querySelector('main') || document.body; },
      // [{el, role, id, body, text}] for rendered messages, oldest first; {text:false} skips the layout-forcing text read.
      messages(root = this.thread(), {text: withText = true} = {}) { const found = collect(merged.messages, root, merged.order); return withText ? found.map(item => ({...item, text: readable(item.body)})) : found; },
      scroller(root = this.thread()) { const first = root.querySelector(merged.messages.map(spec => spec.selector).join(',')); return scrollerOf(first || root); },
      codeBlocks(root = this.thread()) { return codeBlocks(root, merged.codeLang); }
    };
  }
  // Layout features a site really offers: an option with no CSS for that site is reported as unsupported.
  function layoutSupport(id) { const layout = {...generic.layout, ...sites[id]?.layout}; return {chatWidth: !!layout.width, compactSidebar: !!(layout.compactSidebar && layout.sidebar), hideClutter: !!layout.clutter, focusMode: !!layout.focus}; }
  return {get, sites, generic, collect, scrollerOf, codeBlocks, text, layoutSupport};
})();
