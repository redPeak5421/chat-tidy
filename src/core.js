/* Shared pure selection logic. No network or browser credentials. */
globalThis.ChatTidyCore = (() => {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const sites = Object.freeze({
    'https://chatgpt.com': Object.freeze({id:'chatgpt',name:'ChatGPT',origin:'https://chatgpt.com',route:'(?:/g/[^/]+)?/c/',roots:'nav,aside,[data-testid="history"],#history,[data-testid="sidebar"]'}),
    'https://claude.ai': Object.freeze({id:'claude',name:'Claude',origin:'https://claude.ai',route:'/chat/',roots:'[data-testid="sidebar"]'}),
    'https://grok.com': Object.freeze({id:'grok',name:'Grok',origin:'https://grok.com',route:'/c/',roots:'[data-sidebar="sidebar"]'})
  });
  function siteForUrl(value) {
    try { return sites[new URL(value).origin] || null; } catch { return null; }
  }
  function isCoworkId(value){return typeof value==='string'&&/^cse_[0-9]{2}[1-9A-HJ-NP-Za-km-z]{22}$/.test(value);}
  function chatId(href, origin = 'https://chatgpt.com') {
    try {
      const site=siteForUrl(origin); if(!site)return null;
      const url=new URL(href,site.origin);if(url.origin!==site.origin)return null;
      const task=url.pathname.match(/^\/cowork\/([^/]+)\/?$/)?.[1];
      if(site.id==='claude'&&isCoworkId(task))return task;
      return url.pathname.match(new RegExp('^'+site.route+'('+uuid+')/?$','i'))?.[1].toLowerCase() || null;
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
  return {chatId, select, siteForUrl, isCoworkId};
})();
