/* Shared pure selection logic. No network or browser credentials. */
globalThis.ChatTidyCore = (() => {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const sites = Object.freeze({
    'https://gemini.google.com': Object.freeze({id:'gemini',name:'Gemini',origin:'https://gemini.google.com',route:'/app/',roots:'side-navigation-content'}),
    'https://chatgpt.com': Object.freeze({id:'chatgpt',name:'ChatGPT',origin:'https://chatgpt.com',route:'(?:/g/[^/]+)?/c/',roots:'nav,aside,[data-testid="history"],#history,[data-testid="sidebar"]'}),
    'https://claude.ai': Object.freeze({id:'claude',name:'Claude',origin:'https://claude.ai',route:'/chat/',roots:'[data-testid="sidebar"]'}),
    'https://grok.com': Object.freeze({id:'grok',name:'Grok',origin:'https://grok.com',route:'/c/',roots:'[data-sidebar="sidebar"]'}),
    // Kimi renders history and pinned rows as RouterLink anchors inside the "next-sidebar" sections.
    'https://www.kimi.com': Object.freeze({id:'kimi',name:'Kimi',origin:'https://www.kimi.com',route:'/chat/',roots:'[class*="next-sidebar"]:has(.next-sidebar-history-list),.next-sidebar-history-list,.next-sidebar-pinned-list'}),
    // Qwen sidebar rows carry no href; src/qwen.js maps them to chat IDs before selection runs.
    'https://chat.qwen.ai': Object.freeze({id:'qwen',name:'Qwen',origin:'https://chat.qwen.ai',route:'/c/',roots:'#sidebar .session-list'})
  });
  function siteForUrl(value) {
    try { return sites[new URL(value).origin] || null; } catch { return null; }
  }
  function isCoworkId(value){return typeof value==='string'&&/^cse_[0-9]{2}[1-9A-HJ-NP-Za-km-z]{22}$/.test(value);}
  function chatId(href, origin = 'https://chatgpt.com') {
    try {
      const site=siteForUrl(origin); if(!site)return null;
      const url=new URL(href,site.origin);if(url.origin!==site.origin)return null;
      if(site.id==='gemini')return url.pathname.match(/^\/(?:u\/\d+\/)?app\/([0-9a-f]{1,16})\/?$/i)?.[1].toLowerCase()||null;
      const task=url.pathname.match(/^\/cowork\/([^/]+)\/?$/)?.[1];
      if(site.id==='claude'&&isCoworkId(task))return task;
      // Kimi IDs are UUID-shaped but not RFC-versioned; the query string only carries entry telemetry.
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
