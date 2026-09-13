/* Shared pure selection logic. No network or browser credentials. */
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
  return {chatId, select};
})();
