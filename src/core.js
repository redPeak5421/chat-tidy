/* Shared pure selection and queue logic. No network or browser credentials. */
globalThis.ChatTidyCore = (() => {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  function chatId(href) {
    try {
      const url = new URL(href, 'https://chatgpt.com');
      if (url.origin !== 'https://chatgpt.com') return null;
      return url.pathname.match(new RegExp('^(?:/g/[^/]+)?/c/(' + uuid + ')/?$', 'i'))?.[1].toLowerCase() || null;
    } catch { return null; }
  }
  function select(selected, items, action) {
    if (action === 'clear') return selected.clear();
    const unique = new Map(items.map(item => [item.id, item.title]));
    for (const [id, title] of unique) {
      if (action === 'invert' && selected.has(id)) selected.delete(id);
      else selected.set(id, title);
    }
  }
  async function runQueue(items, remove, stopped, progress, delay = ms => new Promise(r => setTimeout(r, ms))) {
    let done = 0;
    for (const item of items) {
      if (stopped()) return {done, cancelled: true};
      try { await remove(item); }
      catch (error) { return {done, error, cancelled: stopped()}; }
      done++; progress(done, item);
      if (done < items.length) await delay(700);
    }
    return {done, cancelled: false};
  }
  return {chatId, select, runQueue};
})();
