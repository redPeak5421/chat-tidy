/* Outline rail and panel, in-chat search and chat/answer bookmarks for the open chat (features 1, 6, 8).
   Reads the conversation only through the ChatTidyReaderSites adapter; search hits are painted with the CSS Custom
   Highlight API, so the site's own DOM is never rewritten. */
globalThis.ChatTidyReader = (() => {
  const SVG = 'http://www.w3.org/2000/svg';
  const icons = {
    outline: 'M9.5 6.5H19 M9.5 12H19 M9.5 17.5H19 M5 6.5h.01 M5 12h.01 M5 17.5h.01',
    star: 'M12 3.8l2.5 5.1 5.6.8-4.05 3.95.96 5.6L12 16.6l-5.01 2.65.96-5.6L3.9 9.7l5.6-.8Z',
    tag: 'M3.75 12.25V4.75a1 1 0 0 1 1-1h7.5l8 8a1 1 0 0 1 0 1.42l-7.08 7.08a1 1 0 0 1-1.42 0Z M8.25 8.25h.01',
    focus: 'M4 9V5a1 1 0 0 1 1-1h4 M15 4h4a1 1 0 0 1 1 1v4 M20 15v4a1 1 0 0 1-1 1h-4 M9 20H5a1 1 0 0 1-1-1v-4',
    hide: 'M10 7l5 5-5 5',
    search: 'M11 4a7 7 0 1 1 0 14a7 7 0 1 1 0-14Z M16.5 16.5 20 20',
    prev: 'M7 14.5l5-5 5 5',
    next: 'M7 9.5l5 5 5-5',
    bookmark: 'M7.5 4h9a1 1 0 0 1 1 1v15l-5.5-3.8L6.5 20V5a1 1 0 0 1 1-1Z',
    clear: 'M8 8l8 8 M16 8l-8 8'
  };
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  // Each user message starts a turn; the assistant messages after it, up to the next question, are its answer.
  function turns(messages, hash = globalThis.ChatTidyLibrary?.hash || clean) {
    const list = [];
    for (const message of messages || []) {
      if (message.role === 'user') { const question = clean(message.text); list.push({index: list.length, id: message.id || null, question, hash: hash(question), userEl: message.el, userBody: message.body || message.el, answerEls: [], answerBodies: [], answer: ''}); }
      else if (message.role === 'assistant' && list.length) {
        const turn = list[list.length - 1];
        if (!turn.answerEls.length && !turn.id) turn.id = message.id || null;
        turn.answerEls.push(message.el); turn.answerBodies.push(message.body || message.el); turn.answer = clean(turn.answer + ' ' + (message.text || ''));
      }
    }
    return list;
  }
  // Case folding one code point at a time keeps every offset in the folded text valid in the original text.
  function fold(text) {
    const value = String(text ?? ''), low = value.toLowerCase();
    if (low.length === value.length) return low;
    let out = ''; for (const ch of value) { const l = ch.toLowerCase(); out += l.length === ch.length ? l : ch; } return out;
  }
  // Start offsets of the non-overlapping, case-insensitive occurrences of query in text.
  function findMatches(text, query) {
    const needle = fold(String(query ?? '').trim()), result = [];
    if (!needle) return result;
    const hay = fold(text);
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) result.push(i);
    return result;
  }
  // A saved turn is found by the site's message ID, then by its question (nearest position wins). The position alone is only
  // trusted for a reference that has neither: windowed sites mount a partial list, so list[index] may be another turn.
  function resolveTurn(list, ref, late = true) {
    if (!ref || !list?.length) return null;
    if (ref.id) { const hit = list.find(turn => turn.id === ref.id); if (hit) return hit; }
    const same = ref.hash ? list.filter(turn => turn.hash === ref.hash) : [];
    const index = Number(ref.index) || 0;
    if (same.length) return same.reduce((a, b) => Math.abs(b.index - index) < Math.abs(a.index - index) ? b : a);
    return late && !ref.id && !ref.hash ? list[index] || null : null;
  }
  // Rail density: one tick per turn up to 12px apart; below 3px apart, neighbouring turns share a tick.
  function ticks(count, span) {
    if (!count) return {step: 1, n: 0, gap: 0};
    let step = 1;
    while (Math.ceil(count / step) > 1 && span / (Math.ceil(count / step) - 1) < 3) step++;
    const n = Math.ceil(count / step);
    return {step, n, gap: n > 1 ? Math.min(12, span / (n - 1)) : 0};
  }
  function cleanTitle(title, name) {
    const text = clean(title), esc = clean(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!esc) return text;
    const stripped = text.replace(new RegExp(`\\s*[-–—|·:]\\s*${esc}\\s*$|^${esc}\\s*[-–—|·:]\\s*`, 'i'), '').trim();
    return new RegExp(`^${esc}$`, 'i').test(stripped) ? '' : stripped;
  }

  function create({t, site, adapter, library = null, titleOf = () => ''} = {}) {
    if (!site || !adapter) return {update() {}, destroy() {}};
    const local = () => { try { return globalThis.chrome?.storage?.local || null; } catch { return null; } };
    const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const registry = () => globalThis.CSS?.highlights && typeof globalThis.Highlight === 'function' ? globalThis.CSS.highlights : null;
    const whole = node => !node || node === document.scrollingElement || node === document.documentElement || node === document.body;
    let settings = {}, running = false, dead = false, lang = null, open = false;
    let chat = null, list = [], owners = new WeakMap(), signature = '', items = {}, unsubscribe = null;
    let thread = null, scroller = null, observer = null, sizer = null, poll = 0, timer = 0, probeTimer = 0, probeSince = 0, settle = 0, placeFrame = 0, followFrame = 0, opened = 0;
    let ui = null, current = 0, hover = -1, layout = {step: 1, n: 0, gap: 0, key: ''}, listKey = '';
    let query = '', hits = [], at = -1, searchTimer = 0, jump = null, pop = null;
    const flashes = new Map();
    // Message text by body element; a mutation inside a message drops only that message's entry.
    let texts = new WeakMap(), known = [];

    function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
    function icon(name) { const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); const path = document.createElementNS(SVG, 'path'); path.setAttribute('d', icons[name]); svg.append(path); return svg; }
    function label(node, text) { node.title = text; node.setAttribute('aria-label', text); }
    function iconButton(name, text, className = '') { const b = el('button', ('cs-reader-icon ' + className).trim()); b.type = 'button'; b.append(icon(name)); label(b, text); return b; }
    function press(button, on, key) { if (!button) return; button.setAttribute('aria-pressed', String(on)); label(button, t(key)); }
    // A string the catalogs do not carry yet falls back to a close match instead of showing its key.
    const say = (key, fallback) => { const text = t(key); return text === key ? t(fallback) : text; };
    const title = () => clean(titleOf(chat)) || cleanTitle(document.title, site.name);
    const chatKey = () => library.chatKey(site.id, chat);
    const answerKey = turn => library.answerKey(site.id, chat, turn);

    function update(next = {}) {
      if (dead) return;
      settings = {...next};
      if (!settings.enabled || !settings.outline) { stop(); return; }
      if (!running) start();
      if (ui && (lang !== settings.language || !ui.root.isConnected)) build(); else { header(); queuePlace(); }
      check();
    }
    function destroy() { stop(); dead = true; }
    function start() {
      running = true;
      addEventListener('popstate', check); addEventListener('resize', queuePlace);
      document.addEventListener('scroll', queueFollow, {capture: true, passive: true});
      document.addEventListener('pointerdown', outside, true);
      poll = setInterval(check, 800);
      if (library) try {
        // The listener's argument is not relied on: the storage layout behind the library may change; load() is the contract.
        unsubscribe = library.onChange(() => { library.load().then(next => { if (running) { items = next || {}; marks(); popSync(); } }).catch(() => {}); });
        library.load().then(next => { if (running) { items = next; marks(); } }).catch(() => {});
      } catch {}
      try { local()?.get({readerPanelOpen: false}).then(value => { if (running && !!value?.readerPanelOpen !== open) setOpen(!!value.readerPanelOpen, false); }).catch(() => {}); } catch {}
    }
    function stop() {
      if (!running) return;
      running = false; leave();
      removeEventListener('popstate', check); removeEventListener('resize', queuePlace);
      document.removeEventListener('scroll', queueFollow, true); document.removeEventListener('pointerdown', outside, true);
      clearInterval(poll); poll = 0;
      try { unsubscribe?.(); } catch {}
      unsubscribe = null;
    }
    // Tears down everything that belongs to the open chat: DOM, observers, timers, highlights and flash marks.
    function leave() {
      closePop();
      for (const id of [timer, probeTimer, searchTimer, settle]) clearTimeout(id);
      timer = probeTimer = probeSince = searchTimer = settle = 0;
      cancelAnimationFrame(placeFrame); cancelAnimationFrame(followFrame); placeFrame = followFrame = 0;
      observer?.disconnect(); sizer?.disconnect(); observer = sizer = thread = scroller = null;
      query = ''; hits = []; at = -1; jump = null; list = []; known = []; texts = new WeakMap(); owners = new WeakMap(); signature = listKey = layout.key = ''; current = 0; hover = -1;
      unpaint();
      for (const [node, id] of flashes) { clearTimeout(id); node.removeAttribute('data-cs-flash'); }
      flashes.clear();
      ui?.root.remove(); ui = null; chat = null;
    }
    // SPA navigation has no event in the isolated world: the URL is polled, plus popstate.
    function check() {
      if (!running) return;
      const id = globalThis.ChatTidyCore?.chatId(location.href, site.origin) || null;
      if (id !== chat) { leave(); if (id) enter(id); return; }
      if (!chat) return;
      if (!ui?.root.isConnected) build();
      if (adapter.thread() !== thread) { watch(); schedule(0); }
      else if (jump) schedule(0);
    }
    function enter(id) {
      chat = id; opened = Date.now(); build(); watch(); refresh();
      if (library) library.takeJump(site.id, id).then(ref => { if (ref?.turn && running && chat === id) { jump = {ref: ref.turn, since: Date.now(), until: Date.now() + 8000, pulled: false}; refresh(); } }).catch(() => {});
    }
    function watch() {
      thread = adapter.thread();
      observer?.disconnect();
      observer = observer || new MutationObserver(mutated);
      if (thread) observer.observe(thread, {subtree: true, childList: true, characterData: true});
    }
    // The thread usually holds the composer and streaming answers, which mutate on every keystroke and frame. Composer and
    // owned changes are dropped; a change inside a message only drops that message's text (and reruns an active search);
    // anything else only makes a cheap element-level probe for added or removed messages.
    function mutated(records) {
      let edited = false, streamed = false, other = false;
      for (const record of records) {
        const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!node || node.closest('form,[contenteditable]:not([contenteditable="false"]),textarea,[data-cs-owned]')) continue;
        if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(n => n.nodeType === 1 && n.matches('[data-cs-owned]'))) continue;
        let owner = null;
        for (let n = node; n && n !== thread; n = n.parentElement) { owner = owners.get(n); if (owner) break; }
        if (!owner) { other = true; continue; }
        texts.delete(owner.body);
        if (owner.answer) streamed = true; else edited = true;
      }
      if (edited) schedule(200);
      else if (streamed && query.trim()) schedule(500);
      if (other) later();
    }
    function schedule(delay) { if (!timer && running) timer = setTimeout(() => refresh(), delay); }
    // Trailing debounce (250 ms, at most 1 s apart under constant churn) for changes outside every known message.
    function later() {
      if (!probeSince) probeSince = Date.now();
      clearTimeout(probeTimer);
      probeTimer = setTimeout(probe, Math.max(0, Math.min(250, probeSince + 1000 - Date.now())));
    }
    function probe() {
      probeTimer = probeSince = 0;
      if (!running || !chat) return;
      const found = adapter.messages(thread, {text: false});
      if (found.length !== known.length || found.some((m, i) => m.el !== known[i].el || m.body !== known[i].body)) schedule(0);
    }
    function readText(body) {
      const skip = '[data-cs-owned]' + (adapter.exclude ? ',' + adapter.exclude : '');
      if (!body.querySelector(skip)) return clean(body.innerText ?? body.textContent);
      const copy = body.cloneNode(true); copy.querySelectorAll(skip).forEach(node => node.remove());
      return clean(copy.textContent);
    }
    function textOf(body) { let value = texts.get(body); if (value === undefined) { value = readText(body); texts.set(body, value); } return value; }
    function refresh(move = false) {
      clearTimeout(timer); timer = 0;
      if (!running || !chat) return;
      if (adapter.thread() !== thread) watch();
      const messages = adapter.messages(thread, {text: false}).map(m => ({...m, body: m.body || m.el, text: textOf(m.body || m.el)}));
      known = messages;
      list = turns(messages, library?.hash);
      owners = new WeakMap();
      for (const turn of list) {
        owners.set(turn.userEl, {index: turn.index, answer: false, body: turn.userBody});
        turn.answerEls.forEach((node, i) => owners.set(node, {index: turn.index, answer: true, body: turn.answerBodies[i]}));
      }
      const next = adapter.scroller(thread);
      if (next !== scroller) {
        sizer?.disconnect(); scroller = next;
        if (typeof ResizeObserver === 'function' && scroller) { sizer = sizer || new ResizeObserver(() => queuePlace()); sizer.observe(scroller); }
        queuePlace();
      }
      const sig = list.map(turn => (turn.id || '') + ':' + turn.hash).join('|');
      if (sig !== signature) { signature = sig; queuePlace(); }
      search(messages, move); hint(); queueFollow(); attempt();
    }

    // Search over the text nodes of every loaded message; one Range per hit, never across messages.
    function search(messages, move) {
      const needle = query.trim(), keep = hits[at];
      hits = [];
      if (needle) {
        const seen = new Map();
        const readable = node => {
          if (!node) return false;
          let ok = seen.get(node);
          // display:contents wrappers have no boxes of their own; their text is as visible as their parent.
          // adapter.exclude names site chrome inside a message body: screen-reader labels, code action bars, reasoning panes.
          if (ok === undefined) { ok = !node.closest('[data-cs-owned],script,style,noscript,template,[hidden],[aria-hidden="true"]' + (adapter.exclude ? ',' + adapter.exclude : '')) && (node.getClientRects().length > 0 || getComputedStyle(node).display === 'contents' && readable(node.parentElement)); seen.set(node, ok); }
          return ok;
        };
        // Text in different blocks (paragraphs, list items, cells) or across a <br> is joined with a newline, which no query
        // contains, so a match never spans two paragraphs; ranges still map through each text node's own start offset.
        const blocks = new Map();
        const block = (node, root) => {
          let found = blocks.get(node);
          if (found === undefined) { const display = getComputedStyle(node).display; found = node === root || !node.parentElement || !(!display || display.startsWith('inline') || display === 'contents') ? node : block(node.parentElement, root); blocks.set(node, found); }
          return found;
        };
        for (const message of messages) {
          const owner = owners.get(message.el); if (!owner) continue;
          const root = message.body || message.el, nodes = [], starts = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
          let text = '', last = null, broken = false;
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.nodeType === 1) { if (node.tagName === 'BR') broken = true; continue; }
            if (!node.data || !readable(node.parentElement)) continue;
            const where = block(node.parentElement, root);
            if (last && (broken || where !== last)) text += '\n';
            last = where; broken = false; nodes.push(node); starts.push(text.length); text += node.data;
          }
          for (const start of findMatches(text, needle)) hits.push({turn: owner.index, el: message.el, start, range: span(nodes, starts, start, start + needle.length)});
        }
      }
      if (!hits.length) at = -1;
      else if (keep && !move) {
        // A rerun keeps the user on the same hit when that message is still rendered.
        let best = -1;
        hits.forEach((hit, i) => { if (hit.el === keep.el && (best < 0 || Math.abs(hit.start - keep.start) < Math.abs(hits[best].start - keep.start))) best = i; });
        at = best >= 0 ? best : Math.min(Math.max(at, 0), hits.length - 1);
      } else { at = hits.findIndex(hit => hit.turn >= current); if (at < 0) at = 0; }
      paint(); status(); renderList();
      if (move && at >= 0) reveal(hits[at]);
    }
    function span(nodes, starts, start, end) {
      const find = offset => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; } return lo; };
      const a = find(start), b = find(end - 1), range = document.createRange();
      range.setStart(nodes[a], start - starts[a]); range.setEnd(nodes[b], end - starts[b]);
      return range;
    }
    function paint() {
      const highlights = registry(); if (!highlights) return;
      if (!hits.length) { unpaint(); return; }
      const all = new Highlight(), now = new Highlight(hits[at].range);
      for (const hit of hits) all.add(hit.range);
      now.priority = 1; highlights.set('cs-search', all); highlights.set('cs-search-current', now);
    }
    function unpaint() { try { globalThis.CSS?.highlights?.delete('cs-search'); globalThis.CSS?.highlights?.delete('cs-search-current'); } catch {} }
    function status() {
      if (!ui) return;
      const text = hits.length ? t('searchCount', {current: at + 1, total: hits.length}) : '';
      if (ui.count.textContent !== text) ui.count.textContent = text;
      ui.prev.disabled = ui.next.disabled = !hits.length; ui.clear.hidden = !query;
    }
    function step(dir) { if (!hits.length) return; at = (at + dir + hits.length) % hits.length; paint(); status(); reveal(hits[at]); }
    function reveal(hit) {
      const behavior = reduced() ? 'auto' : 'smooth', rect = hit.range.getBoundingClientRect?.();
      if (rect && (rect.width || rect.height)) {
        const box = viewBox(), delta = rect.top + rect.height / 2 - (box.top + box.bottom) / 2, target = whole(scroller) ? globalThis : scroller;
        target.scrollBy?.({top: delta, behavior});
      } else hit.el.scrollIntoView?.({block: 'center', behavior});
      // Without highlight paint the match itself is invisible: ring its element instead.
      if (!registry()) flash(hit.range.startContainer.parentElement || hit.el);
      current = hit.turn; markCurrent();
    }
    function clearSearch() { query = ''; clearTimeout(searchTimer); searchTimer = 0; if (ui) ui.input.value = ''; hits = []; at = -1; unpaint(); status(); renderList(); }
    function flash(node) {
      if (!node?.isConnected) return;
      clearTimeout(flashes.get(node)); node.removeAttribute('data-cs-flash'); void node.offsetWidth; node.setAttribute('data-cs-flash', '');
      flashes.set(node, setTimeout(() => { node.removeAttribute('data-cs-flash'); flashes.delete(node); }, 1300));
    }
    function goTo(index, behavior = reduced() ? 'auto' : 'smooth') {
      if (list[index] && !list[index].userEl.isConnected) refresh();
      const turn = list[index]; if (!turn?.userEl.isConnected) return;
      turn.userEl.scrollIntoView?.({block: 'start', behavior}); flash(turn.userBody);
      current = index; markCurrent();
    }
    function choose(index) {
      const first = query.trim() ? hits.findIndex(hit => hit.turn === index) : -1;
      if (first >= 0) { at = first; paint(); status(); reveal(hits[at]); } else goTo(index);
    }
    // Jump on load (from the library page): messages render late, so every refresh (and the poll) retries for ~8 s.
    // A saved turn that is still missing after 2.5 s is probably older history the site has not mounted: scroll the
    // thread to the top once so it loads, keep looking, and give up silently rather than land on another turn.
    function attempt() {
      if (!jump) return;
      // A turn that never appears (edited or deleted since it was saved) puts the reader back where they were; the distance
      // from the bottom survives older history loading above. A reader who scrolled away meanwhile is left alone.
      if (Date.now() > jump.until) { const back = jump.pulled; jump = null; if (back && back.el.isConnected && back.el.scrollTop < 40) back.el.scrollTop = back.el.scrollHeight - back.fromBottom; return; }
      const turn = resolveTurn(list, jump.ref, Date.now() - opened > 2500);
      if (!turn) {
        if (!jump.pulled && Date.now() - jump.since > 2500) { const el = whole(scroller) ? document.scrollingElement || document.documentElement : scroller; jump.pulled = {el, fromBottom: el.scrollHeight - el.scrollTop}; el.scrollTop = 0; }
        return;
      }
      jump = null; const node = turn.userEl;
      goTo(turn.index, 'auto');
      // Sites scroll to the newest message once history renders; settle on the saved turn again if that moved it away.
      clearTimeout(settle);
      settle = setTimeout(() => { settle = 0; if (!running || !node.isConnected) return; const r = node.getBoundingClientRect(), box = viewBox(); if (r.bottom < box.top || r.top > box.bottom) node.scrollIntoView({block: 'start'}); }, 700);
    }

    function viewBox() {
      const width = document.documentElement.clientWidth || innerWidth, height = innerHeight, full = {top: 0, left: 0, right: width, bottom: height};
      if (whole(scroller) || !scroller.isConnected) return {...full, outer: innerWidth};
      const r = scroller.getBoundingClientRect(), bar = Math.max(0, scroller.offsetWidth - scroller.clientWidth);
      const box = {top: Math.max(0, r.top), left: Math.max(0, r.left), right: Math.min(width, r.right - bar), bottom: Math.min(height, r.bottom), outer: Math.min(innerWidth, r.right)};
      return box.bottom - box.top < 120 || box.right - box.left < 120 ? {...full, outer: innerWidth} : box;
    }
    function queuePlace() { if (!placeFrame && ui) placeFrame = requestAnimationFrame(place); }
    // The rail hugs the right edge of the scroller's visible box; the panel opens from it and keeps a fixed top while filtering.
    function place() {
      placeFrame = 0; if (!ui) return;
      const box = viewBox(), height = box.bottom - box.top, mid = box.top + height / 2;
      const room = Math.max(24, Math.min(innerHeight * .6, height - 64) - 40);
      const next = ticks(list.length, room), key = next.n + ':' + next.step + ':' + signature;
      if (key !== layout.key) { layout = {...next, key}; drawTicks(); }
      layout.gap = next.gap;
      const lines = Math.max(0, layout.n - 1) * layout.gap, railHeight = 24 + 8 + lines + 16, right = box.right - 10;
      const top = Math.max(box.top + 8, mid - railHeight / 2);
      // Wide layouts (full chat width) bring message content up to the edge: then the rail moves into the scroller's
      // right padding or scrollbar gutter rather than cover code-block buttons.
      let edge = 0;
      for (const m of known) if (m.body.isConnected) { const r = m.body.getBoundingClientRect(); if (r.width) edge = Math.max(edge, r.right); }
      const railLeft = edge > right - 24 - 4 ? Math.max(right - 24, Math.min(edge + 4, box.outer - 24)) : right - 24;
      Object.assign(ui.rail.style, {left: railLeft + 'px', top: top + 'px', height: railHeight + 'px'});
      ui.track.style.height = lines + 16 + 'px';
      const size = Math.max(3, Math.min(12, layout.gap || 12));
      ui.ticks.forEach((tick, i) => { tick.style.top = 8 + i * layout.gap - size / 2 + 'px'; tick.style.height = size + 'px'; });
      const width = Math.min(288, innerWidth - 16), max = Math.max(160, Math.min(innerHeight * .7, 640, height - 24));
      const panelTop = Math.max(8, Math.min(Math.max(box.top + 12, mid - max / 2), box.bottom - 12 - max));
      Object.assign(ui.panel.style, {width: width + 'px', maxHeight: max + 'px', left: Math.max(8, right - width) + 'px', top: panelTop + 'px', transformOrigin: `right ${Math.round(top + railHeight / 2 - panelTop)}px`});
      if (pop) placePop();
    }
    function queueFollow(event) {
      if (event?.target?.nodeType === 1 && ui?.root.contains(event.target)) return;
      if (!followFrame && ui) followFrame = requestAnimationFrame(follow);
    }
    // Current turn: the last question whose top has passed 35% of the visible chat.
    function follow() {
      followFrame = 0; if (!ui || !list.length) return;
      const box = viewBox(), line = box.top + (box.bottom - box.top) * .35;
      let next = 0;
      for (const turn of list) { if (!turn.userEl.isConnected) continue; if (turn.userEl.getBoundingClientRect().top > line) break; next = turn.index; }
      if (next !== current) { current = next; markCurrent(); }
    }
    function hint() {
      if (!ui) return;
      let show = !!adapter.lazy;
      // Content far above the first rendered question means older history is not loaded on this page.
      if (!show && list[0]?.userEl.isConnected) {
        const box = viewBox(), above = list[0].userEl.getBoundingClientRect().top - box.top + (whole(scroller) ? (document.scrollingElement || document.documentElement).scrollTop : scroller.scrollTop);
        show = above > Math.max(240, (box.bottom - box.top) * .5);
      }
      ui.hint.hidden = !show;
    }

    function drawTicks() {
      if (!ui) return;
      hover = -1; ui.label.removeAttribute('data-show');
      ui.ticks = [];
      for (let i = 0; i < layout.n; i++) {
        const index = i * layout.step, tick = el('button', 'cs-reader-tick');
        tick.type = 'button'; tick.tabIndex = -1; tick.dataset.index = index;
        tick.setAttribute('aria-label', index + 1 + '. ' + (list[index]?.question || '').slice(0, 140));
        ui.ticks.push(tick);
      }
      ui.track.replaceChildren(...ui.ticks);
      ui.root.toggleAttribute('data-empty', !list.length);
      markCurrent(); marks(); markHits();
    }
    function tickAt(y) {
      if (!ui?.ticks.length) return -1;
      const r = ui.track.getBoundingClientRect();
      if (y < r.top - 6 || y > r.bottom + 6) return -1;
      return layout.gap ? Math.max(0, Math.min(ui.ticks.length - 1, Math.round((y - r.top - 8) / layout.gap))) : 0;
    }
    function hoverAt(i) {
      if (!ui || i === hover) return;
      ui.ticks[hover]?.removeAttribute('data-hover'); hover = i;
      const tick = ui.ticks[i];
      if (!tick) { ui.label.removeAttribute('data-show'); return; }
      tick.setAttribute('data-hover', '');
      const index = +tick.dataset.index, r = tick.getBoundingClientRect(), rail = ui.rail.getBoundingClientRect();
      ui.label.replaceChildren(el('span', 'cs-reader-rail-num', String(index + 1)), el('span', 'cs-reader-rail-text', list[index]?.question || '…'));
      Object.assign(ui.label.style, {right: document.documentElement.clientWidth - rail.left + 2 + 'px', top: r.top + r.height / 2 + 'px'});
      ui.label.setAttribute('data-show', '');
    }
    function focusTick(i) { const tick = ui?.ticks[i]; if (!tick) return; for (const other of ui.ticks) other.tabIndex = other === tick ? 0 : -1; tick.focus(); }
    function markCurrent() {
      if (!ui) return;
      const now = Math.floor(current / layout.step), roving = !ui.track.contains(document.activeElement);
      ui.ticks.forEach((tick, i) => { tick.setAttribute('aria-current', String(i === now)); if (roving) tick.tabIndex = i === now ? 0 : -1; });
      for (const row of ui.list.children) if (row.dataset.index) row.setAttribute('aria-current', String(+row.dataset.index === current));
    }
    function markHits() {
      if (!ui) return;
      const found = new Set(hits.map(hit => Math.floor(hit.turn / layout.step)));
      ui.ticks.forEach((tick, i) => tick.toggleAttribute('data-hit', found.has(i)));
    }
    function marks() {
      if (!ui || !library || !chat) return;
      const item = items[chatKey()];
      press(ui.star, !!item, item ? 'unstarChat' : 'starChat');
      ui.tags.toggleAttribute('data-filled', !!(item?.tags?.length || item?.note));
      const marked = new Set(list.filter(turn => items[answerKey(turn)]).map(turn => turn.index));
      for (const row of ui.list.children) if (row.dataset.index) {
        const turn = list[+row.dataset.index], saved = turn && items[answerKey(turn)], tags = row.querySelector('.cs-reader-outline-tag');
        press(row.querySelector('.cs-reader-outline-mark'), !!saved, saved ? 'removeAnswerBookmark' : 'bookmarkAnswer');
        tags.toggleAttribute('data-filled', !!(saved?.tags?.length || saved?.note));
        tags.title = saved?.tags?.length ? t('tagsNote') + ': ' + saved.tags.join(', ') : t('tagsNote');
      }
      ui.ticks.forEach(tick => tick.toggleAttribute('data-marked', marked.has(+tick.dataset.index)));
    }
    function renderList() {
      if (!ui) return;
      const counts = new Map(), filtering = !!query.trim();
      for (const hit of hits) counts.set(hit.turn, (counts.get(hit.turn) || 0) + 1);
      const key = signature + '\n' + filtering + '\n' + [...counts].join(';') + '\n' + list.map(turn => turn.question).join('\n');
      markHits();
      if (key === listKey) return;
      listKey = key;
      const active = document.activeElement, kinds = ['cs-reader-outline-mark', 'cs-reader-outline-tag', 'cs-reader-outline-go'];
      const focus = ui.list.contains(active) ? {index: active.closest('[data-index]')?.dataset.index, kind: kinds.find(kind => active.closest('.' + kind))} : null;
      const shown = filtering ? list.filter(turn => counts.has(turn.index)) : list;
      const rows = shown.map(turn => {
        const row = el('li', 'cs-reader-outline-row'), go = el('button', 'cs-reader-outline-go'), mark = iconButton('bookmark', t('bookmarkAnswer'), 'cs-reader-outline-mark cs-reader-fill'), tags = iconButton('tag', t('tagsNote'), 'cs-reader-outline-tag');
        tags.setAttribute('aria-haspopup', 'dialog'); tags.setAttribute('aria-expanded', 'false');
        row.dataset.index = turn.index; go.type = 'button'; go.title = turn.question;
        go.append(el('span', 'cs-reader-outline-num', String(turn.index + 1)), el('span', 'cs-reader-outline-text', turn.question || '…'));
        if (filtering) go.append(el('span', 'cs-reader-outline-count', String(counts.get(turn.index))));
        if (!library) mark.hidden = tags.hidden = true;
        row.append(go, tags, mark); return row;
      });
      if (!rows.length) { const empty = el('li', 'cs-reader-outline-empty', t(filtering ? 'searchNone' : 'outlineEmpty')); if (filtering) empty.setAttribute('role', 'status'); rows.push(empty); }
      ui.list.replaceChildren(...rows);
      ui.total.textContent = list.length ? String(list.length) : '';
      if (focus?.index && focus.kind) ui.list.querySelector(`[data-index="${focus.index}"] .${focus.kind}`)?.focus();
      marks(); markCurrent();
      // A popover anchored to a row follows the rebuilt row, or closes when the row is filtered out.
      if (pop?.index >= 0 && !pop.anchor.isConnected) {
        const next = ui.list.querySelector(`[data-index="${pop.index}"] .cs-reader-outline-tag`);
        if (next) { pop.anchor = next; next.setAttribute('aria-expanded', 'true'); placePop(); } else closePop();
      }
    }
    function header() {
      if (!ui) return;
      const on = !!settings.focusMode;
      ui.focus.setAttribute('aria-pressed', String(on)); label(ui.focus, t(on ? 'focusExit' : 'focusMode'));
    }
    function setOpen(value, persist = true) {
      open = value;
      if (ui) { ui.root.classList.toggle('cs-reader-open', open); ui.panel.toggleAttribute('inert', !open); ui.rail.toggleAttribute('inert', open); ui.show.setAttribute('aria-expanded', String(open)); }
      if (!open) { closePop(); hoverAt(-1); }
      if (persist) try { local()?.set({readerPanelOpen: open})?.catch?.(() => {}); } catch {}
      queuePlace();
    }

    // The turn at index after a fresh scan, or null when the list moved under the user's click.
    function freshTurn(index) { const before = list[index]?.hash; refresh(); const turn = list[index]; return turn && turn.hash === before ? turn : null; }
    function chatItem(extra) { const old = items[chatKey()]; return {type: 'chat', site: site.id, chatId: chat, url: location.href, title: title() || old?.title || '', tags: old?.tags || [], note: old?.note || '', ...extra}; }
    function answerItem(turn, extra) {
      const old = items[answerKey(turn)];
      return {type: 'answer', site: site.id, chatId: chat, url: location.href, title: title() || old?.title || '', turn: {id: turn.id, index: turn.index, hash: turn.hash}, question: turn.question, excerpt: turn.answer.slice(0, 300), tags: old?.tags || [], note: old?.note || '', ...extra};
    }
    async function toggleAnswer(index) {
      if (!library || !chat) return;
      const turn = freshTurn(index); if (!turn) return;
      const key = answerKey(turn);
      try { if (items[key]) await library.remove(key); else await library.put(answerItem(turn)); items = await library.load(); marks(); } catch {}
    }
    async function toggleStar() {
      if (!library || !chat) return;
      const key = chatKey();
      try { if (items[key]) await library.remove(key); else await library.put(chatItem()); items = await library.load(); marks(); popSync(); } catch {}
    }

    // Tags and note popover for the chat (header button) or for one answer (row button). Editing implies bookmarking:
    // the first real change creates the item; opening, leaving or pressing Enter without a change writes nothing.
    function openPop(anchor, index = -1) {
      const again = pop?.anchor === anchor;
      if (pop) closePop(again);
      if (again || !ui || !library || !chat || !anchor) return;
      let key = chatKey(), make = extra => chatItem(extra);
      if (index >= 0) {
        const turn = freshTurn(index); if (!turn) return;
        key = answerKey(turn); make = extra => answerItem(turn, extra);
        if (!anchor.isConnected) anchor = ui.list.querySelector(`[data-index="${index}"] .cs-reader-outline-tag`); if (!anchor) return;
      }
      const item = items[key];
      const box = el('div', 'cs-reader-tags-pop'), field = el('div', 'cs-reader-tags-field'), chips = el('span', 'cs-reader-chips'), input = el('input', 'cs-reader-tags-input');
      const suggest = el('div', 'cs-reader-suggest'), note = el('textarea', 'cs-reader-note'), state = el('div', 'cs-reader-pop-status');
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', t('tagsNote'));
      input.type = 'text'; input.placeholder = t('addTag'); input.setAttribute('aria-label', t('addTag')); input.autocomplete = 'off'; input.spellcheck = false;
      note.placeholder = t('notePlaceholder'); note.setAttribute('aria-label', t('notePlaceholder')); note.rows = 3; note.value = item?.note || '';
      state.setAttribute('aria-live', 'polite');
      field.append(chips, input); box.append(field, suggest, note, state);
      const p = pop = {box, chips, input, suggest, note, state, key, make, anchor, index, tags: [...(item?.tags || [])], timer: 0, fade: 0, dirty: false};
      const add = text => { const next = library.tags([...p.tags, ...String(text).split(/[,，]/)]); input.value = ''; if (next.length !== p.tags.length) { p.tags = next; drawChips(); save(); } };
      field.addEventListener('click', event => { if (event.target === field || event.target === chips) input.focus(); });
      input.addEventListener('keydown', event => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') { event.preventDefault(); add(input.value); save(true); }
        else if (event.key === ',' || event.key === '，') { event.preventDefault(); add(input.value); }
        else if (event.key === 'Backspace' && !input.value && p.tags.length) { event.preventDefault(); p.tags = p.tags.slice(0, -1); drawChips(); save(); }
      });
      input.addEventListener('input', () => { if (/[,，]/.test(input.value)) add(input.value); });
      input.addEventListener('blur', () => { if (input.value.trim()) add(input.value); save(true); });
      note.addEventListener('input', () => save());
      note.addEventListener('blur', () => save(true));
      box.addEventListener('click', event => {
        const remove = event.target.closest('.cs-reader-chip-x'), pick = event.target.closest('.cs-reader-suggest-tag');
        if (remove) { p.tags = p.tags.filter(tag => tag !== remove.dataset.tag); drawChips(); save(); input.focus(); }
        if (pick) { add(pick.dataset.tag); input.focus(); }
      });
      box.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closePop(true); } });
      ui.root.append(box); anchor.setAttribute('aria-expanded', 'true'); drawChips(); placePop(); input.focus();
    }
    function drawChips() {
      if (!pop) return;
      pop.chips.replaceChildren(...pop.tags.map(tag => { const chip = el('span', 'cs-reader-chip'), x = iconButton('clear', t('removeTag', {tag}), 'cs-reader-chip-x'); x.dataset.tag = tag; chip.append(el('span', 'cs-reader-chip-name', tag), x); return chip; }));
      const have = new Set(pop.tags.map(tag => tag.toLowerCase()));
      const options = library.tagCounts(items).filter(entry => !have.has(entry.tag.toLowerCase())).slice(0, 6);
      pop.suggest.replaceChildren(...options.map(entry => { const b = el('button', 'cs-reader-suggest-tag', entry.tag); b.type = 'button'; b.dataset.tag = entry.tag; return b; }));
      pop.suggest.hidden = !options.length;
      pop.input.placeholder = pop.tags.length ? '' : t('addTag');
      if (ui) placePop();
    }
    function save(now = false) { const p = pop; if (!p) return; p.dirty = true; clearTimeout(p.timer); if (now) commit(p); else p.timer = setTimeout(() => commit(p), 400); }
    function commit(p) {
      if (!p?.dirty || !library || !chat) return;
      clearTimeout(p.timer); p.dirty = false;
      const tags = library.tags(p.tags), note = p.note.value, old = items[p.key], had = old?.tags || [];
      // Blur, Enter or switching tabs is not an edit: only a difference from the stored item (or a first tag or note) is written.
      if (old ? tags.length === had.length && tags.every((tag, i) => tag === had[i]) && note === (old.note || '') : !tags.length && !note.trim()) return;
      library.put(p.make({tags, note})).then(saved => {
        if (!saved || !running) return;
        items = {...items, [saved.key]: saved}; marks();
        if (pop === p) { p.state.textContent = t('saved'); clearTimeout(p.fade); p.fade = setTimeout(() => { if (pop === p) p.state.textContent = ''; }, 1400); }
      }).catch(() => {});
    }
    function closePop(back = false) {
      const p = pop; if (!p) return;
      pop = null;
      if (p.input.value.trim()) { p.tags = library.tags([...p.tags, ...p.input.value.split(/[,，]/)]); p.dirty = true; }
      commit(p); clearTimeout(p.fade); p.box.remove();
      p.anchor.setAttribute('aria-expanded', 'false'); if (back && p.anchor.isConnected) p.anchor.focus();
    }
    // Another tab or the popup edited the library: follow it unless this popover holds unsaved edits.
    function popSync() {
      if (!pop || pop.dirty || !chat) return;
      const item = items[pop.key];
      pop.tags = [...(item?.tags || [])];
      if (document.activeElement !== pop.note) pop.note.value = item?.note || '';
      drawChips();
    }
    // Aligned with the panel's inner edges, under its anchor, or above it when the anchor sits low in the panel.
    function placePop() {
      if (!pop || !ui) return;
      const panel = ui.panel.getBoundingClientRect(), anchor = pop.anchor.getBoundingClientRect(), width = Math.min(272, innerWidth - 16), height = pop.box.offsetHeight || 220;
      pop.box.style.width = width + 'px';
      pop.box.style.left = Math.max(8, Math.min((panel.width ? panel.right - 8 : anchor.right) - width, innerWidth - width - 8)) + 'px';
      pop.box.style.top = Math.max(8, anchor.bottom + 6 + height <= innerHeight - 8 ? anchor.bottom + 6 : anchor.top - 6 - height) + 'px';
    }
    function outside(event) { if (pop && !pop.box.contains(event.target) && !pop.anchor.contains(event.target)) closePop(); }

    function build() {
      closePop(); ui?.root.remove();
      lang = settings.language;
      const root = el('div', 'cs-reader'); root.dataset.csOwned = 'true';
      // Plain divs with roles: sites style and hide bare nav/section elements (ChatGPT's focus layout hides every nav).
      const rail = el('div', 'cs-reader-rail'), show = iconButton('outline', t('outlineShow'), 'cs-reader-rail-open'), track = el('div', 'cs-reader-rail-ticks'), tip = el('div', 'cs-reader-rail-label');
      rail.setAttribute('role', 'navigation'); rail.setAttribute('aria-label', t('outlineTitle')); tip.setAttribute('aria-hidden', 'true'); show.setAttribute('aria-expanded', 'false');
      rail.append(show, track);
      const panel = el('div', 'cs-reader-panel'), head = el('div', 'cs-reader-panel-head'), heading = el('h2', 'cs-reader-panel-title', t('outlineTitle')), total = el('span', 'cs-reader-panel-total');
      panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', t('outlineTitle'));
      const star = iconButton('star', t('starChat'), 'cs-reader-fill'), tags = iconButton('tag', t('tagsNote'), 'cs-reader-tags-button'), focus = iconButton('focus', t('focusMode')), hide = iconButton('hide', t('outlineHide'));
      tags.setAttribute('aria-haspopup', 'dialog'); tags.setAttribute('aria-expanded', 'false');
      if (!library) star.hidden = tags.hidden = true;
      if (!globalThis.ChatTidyCore?.supports(site, 'focusMode')) focus.hidden = true;
      heading.append(total); head.append(heading, star, tags, focus, hide);
      const row = el('div', 'cs-reader-search'), field = el('label', 'cs-reader-field'), input = el('input', 'cs-reader-search-input'), count = el('span', 'cs-reader-count'), clear = iconButton('clear', say('clearSearch', 'close'), 'cs-reader-search-clear');
      input.type = 'search'; input.placeholder = t('searchChat'); input.setAttribute('aria-label', t('searchChat')); input.autocomplete = 'off'; input.spellcheck = false; input.value = query;
      count.setAttribute('aria-live', 'polite');
      const prev = iconButton('prev', t('searchPrev')), next = iconButton('next', t('searchNext'));
      field.append(icon('search'), input, count, clear); row.append(field, prev, next);
      const hintNode = el('p', 'cs-reader-panel-hint', t('searchLoadedOnly')), outline = el('ol', 'cs-reader-outline');
      hintNode.hidden = true; outline.setAttribute('aria-label', t('outlineTitle'));
      panel.append(head, row, hintNode, outline);
      root.append(rail, tip, panel);
      // Typing must not reach site shortcuts such as ChatGPT's type-to-focus composer; Escape still does.
      for (const type of ['keydown', 'keyup', 'keypress']) root.addEventListener(type, event => { if (event.key !== 'Escape') event.stopPropagation(); });
      show.addEventListener('click', () => { setOpen(true); input.focus(); });
      hide.addEventListener('click', () => { setOpen(false); show.focus(); });
      star.addEventListener('click', () => { void toggleStar(); });
      tags.addEventListener('click', () => openPop(tags));
      focus.addEventListener('click', () => { try { local()?.set({focusMode: !settings.focusMode})?.catch?.(() => {}); } catch {} });
      rail.addEventListener('pointermove', event => hoverAt(tickAt(event.clientY)));
      rail.addEventListener('pointerleave', () => { if (!track.contains(document.activeElement)) hoverAt(-1); });
      track.addEventListener('click', event => { const i = event.detail ? tickAt(event.clientY) : ui.ticks.indexOf(event.target.closest('.cs-reader-tick')); if (i >= 0) goTo(+ui.ticks[i].dataset.index); });
      track.addEventListener('keydown', event => {
        const from = ui.ticks.indexOf(document.activeElement), last = ui.ticks.length - 1;
        const to = {ArrowUp: from - 1, ArrowDown: from + 1, Home: 0, End: last}[event.key];
        if (to === undefined || from < 0) return;
        event.preventDefault(); focusTick(Math.max(0, Math.min(last, to)));
      });
      track.addEventListener('focusin', event => hoverAt(ui.ticks.indexOf(event.target)));
      track.addEventListener('focusout', () => hoverAt(-1));
      input.addEventListener('input', () => { query = input.value; status(); clearTimeout(searchTimer); searchTimer = setTimeout(() => { searchTimer = 0; refresh(true); }, 150); });
      input.addEventListener('keydown', event => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter') { event.preventDefault(); if (searchTimer) { clearTimeout(searchTimer); searchTimer = 0; refresh(true); } else step(event.shiftKey ? -1 : 1); }
        else if (event.key === 'Escape' && input.value) { event.preventDefault(); clearSearch(); }
      });
      clear.addEventListener('click', () => { clearSearch(); input.focus(); });
      prev.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
      outline.addEventListener('click', event => {
        const item = event.target.closest('.cs-reader-outline-row'); if (!item) return;
        const tag = event.target.closest('.cs-reader-outline-tag');
        if (tag) openPop(tag, +item.dataset.index);
        else if (event.target.closest('.cs-reader-outline-mark')) void toggleAnswer(+item.dataset.index); else if (event.target.closest('.cs-reader-outline-go')) choose(+item.dataset.index);
      });
      // A popover anchored to a row follows it while the list scrolls, and closes once the row leaves the list's view.
      outline.addEventListener('scroll', () => {
        if (!(pop?.index >= 0)) return;
        const row = pop.anchor.getBoundingClientRect(), view = outline.getBoundingClientRect();
        if (row.bottom < view.top || row.top > view.bottom) closePop(); else placePop();
      }, {passive: true});
      outline.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key) || !event.target.matches('.cs-reader-outline-go')) return;
        const all = [...outline.querySelectorAll('.cs-reader-outline-go')], i = all.indexOf(event.target) + (event.key === 'ArrowUp' ? -1 : 1);
        if (all[i]) { event.preventDefault(); all[i].focus(); }
      });
      document.body.append(root);
      ui = {root, rail, show, track, label: tip, panel, total, star, tags, focus, hide, input, count, clear, prev, next, hint: hintNode, list: outline, ticks: []};
      listKey = layout.key = ''; hover = -1;
      root.toggleAttribute('data-empty', !list.length);
      setOpen(open, false); header(); renderList(); status(); hint(); queuePlace();
    }
    return {update, destroy};
  }
  return {create, turns, findMatches, resolveTurn, ticks, cleanTitle, fold};
})();
