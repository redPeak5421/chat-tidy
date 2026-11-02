/* Bookmarks, tags and notes for chats and single answers. Stored locally only, under one storage key. */
globalThis.ChatTidyLibrary = (() => {
  const KEY = 'library', JUMP = 'readerJump';
  const MAX_TAGS = 20, MAX_TAG = 32, MAX_NOTE = 2000, MAX_TEXT = 300;
  const storage = () => globalThis.chrome?.storage?.local;
  function clip(value, max = MAX_TEXT) { const text = String(value ?? '').replace(/\s+/g, ' ').trim(); return text.length > max ? text.slice(0, max - 1) + '…' : text; }
  // FNV-1a over the normalized question: a turn keeps its key when the site rerenders or reloads it.
  function hash(value) {
    let h = 0x811c9dc5;
    for (const ch of String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  function chatKey(site, chatId) { return site + ':' + chatId; }
  // A turn reference prefers the site's own message ID, then the question text; the index only breaks ties.
  function turnRef(turn) { return turn?.id ? 'id:' + turn.id : 'q:' + (turn?.hash || hash(turn?.question)) + ':' + (turn?.index ?? 0); }
  function answerKey(site, chatId, turn) { return chatKey(site, chatId) + '#' + turnRef(turn); }
  function tags(list) {
    const seen = new Set(), result = [];
    for (const raw of Array.isArray(list) ? list : String(list ?? '').split(/[,，]/)) {
      const tag = String(raw ?? '').replace(/\s+/g, ' ').trim().replace(/^#+\s*/, '').slice(0, MAX_TAG).trim();
      if (!tag || seen.has(tag.toLowerCase())) continue;
      seen.add(tag.toLowerCase()); result.push(tag);
      if (result.length >= MAX_TAGS) break;
    }
    return result;
  }
  // Normalizes one stored item; unknown fields are dropped so a damaged entry cannot grow the store.
  function normalize(item, now = Date.now()) {
    const type = item?.type === 'answer' ? 'answer' : 'chat';
    if (!item?.site || !item?.chatId) return null;
    const turn = type === 'answer' ? {id: item.turn?.id ? String(item.turn.id) : null, index: Number(item.turn?.index) || 0, hash: item.turn?.hash || hash(item.question)} : undefined;
    const key = type === 'answer' ? answerKey(item.site, item.chatId, turn) : chatKey(item.site, item.chatId);
    const result = {key, type, site: String(item.site), chatId: String(item.chatId), url: String(item.url || ''), title: clip(item.title), tags: tags(item.tags), note: String(item.note ?? '').slice(0, MAX_NOTE), savedAt: Number(item.savedAt) || now, updatedAt: now};
    if (type === 'answer') Object.assign(result, {turn, question: clip(item.question), excerpt: clip(item.excerpt)});
    return result;
  }
  async function load() { const data = await storage().get({[KEY]: {}}); const items = data[KEY]; return items && typeof items === 'object' && !Array.isArray(items) ? items : {}; }
  // Read-modify-write of the whole map; mutate receives a copy and returns nothing. Writes from one page or the popup run one
  // after another, so two quick bookmarks never read the same old map; separate contexts would need to write within the same
  // few milliseconds to overlap.
  let queue = Promise.resolve();
  function update(mutate) {
    const run = queue.then(async () => { const items = {...await load()}; mutate(items); await storage().set({[KEY]: items}); return items; });
    queue = run.catch(() => {});
    return run;
  }
  async function put(item) { const next = normalize(item); if (!next) return null; await update(items => { const old = items[next.key]; items[next.key] = old ? {...next, savedAt: old.savedAt} : next; }); return next; }
  async function remove(key) { return update(items => { delete items[key]; }); }
  function search(items, query = '', {type = 'all', tag = ''} = {}) {
    const needle = String(query).trim().toLocaleLowerCase();
    return Object.values(items || {}).filter(item => (type === 'all' || item.type === type) && (!tag || item.tags?.some(t => t.toLowerCase() === tag.toLowerCase())) &&
      (!needle || [item.title, item.question, item.excerpt, item.note, ...(item.tags || [])].some(text => String(text || '').toLocaleLowerCase().includes(needle))))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  function tagCounts(items) {
    const counts = new Map();
    for (const item of Object.values(items || {})) for (const tag of item.tags || []) { const k = tag.toLowerCase(); const entry = counts.get(k) || {tag, count: 0}; entry.count++; counts.set(k, entry); }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }
  function onChange(listener) {
    const handler = (changes, area) => { if (area === 'local' && changes[KEY]) listener(changes[KEY].newValue || {}); };
    globalThis.chrome?.storage?.onChanged?.addListener(handler);
    return () => globalThis.chrome?.storage?.onChanged?.removeListener?.(handler);
  }
  // Opening a saved answer from the popup: the page that loads this chat scrolls to the turn once, within two minutes.
  async function requestJump(item) { await storage().set({[JUMP]: {key: item.key, site: item.site, chatId: item.chatId, turn: item.turn || null, at: Date.now()}}); }
  async function takeJump(site, chatId, now = Date.now()) {
    const {[JUMP]: jump} = await storage().get({[JUMP]: null});
    if (!jump || jump.site !== site || jump.chatId !== chatId || now - jump.at > 120000) return null;
    await storage().remove?.(JUMP); return jump;
  }
  return {KEY, hash, clip, chatKey, turnRef, answerKey, tags, normalize, load, update, put, remove, search, tagCounts, onChange, requestJump, takeJump};
})();
