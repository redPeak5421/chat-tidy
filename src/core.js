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
    'https://chat.qwen.ai': Object.freeze({id:'qwen',name:'Qwen',origin:'https://chat.qwen.ai',route:'/c/',roots:'#sidebar .session-list'}),
    // Z.ai rows are href-less buttons in .AgentChatList; src/zai.js maps them. The root is the "Recent" panel holding label and list.
    'https://chat.z.ai': Object.freeze({id:'zai',name:'Z.ai',origin:'https://chat.z.ai',route:'/c/',roots:'#sidebar div:has(>div>.AgentChatList),#sidebar .AgentChatList'})
  });
  // One schema for every stored preference. Language is absent: its default follows the browser through ChatTidyI18n.
  const settings = Object.freeze({enabled:true,theme:'system',checkboxMode:'dynamic',concurrency:5,hideSupport:false,grokShowAll:false,grokHideBots:false,grokCollapseBots:false});
  // The only accepted requests-in-flight values; anything else stored (such as the old default 2) means the default.
  const concurrencyOptions = Object.freeze([1,3,5,10,15]);
  // Native features per site. Claude archives only Cowork tasks; the archived-chats manager also restores. Kimi, Gemini, Grok and Z.ai only delete.
  const features = Object.freeze({archive:['chatgpt','claude','qwen'],manager:['chatgpt','qwen'],move:['chatgpt','claude','qwen']});
  function supports(site, feature) { return !!features[feature]?.includes(typeof site === 'string' ? site : site?.id); }
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
  // Case-insensitive substring match on titles; an empty query matches nothing.
  function match(items, query) {
    const needle = String(query || '').trim().toLocaleLowerCase();
    if (!needle) return [];
    return items.filter(item => String(item.title || '').toLocaleLowerCase().includes(needle));
  }
  // Retry-After as delay-seconds or an HTTP date, in milliseconds; undefined when absent or unreadable.
  function retryAfterMs(value, now = Date.now()) {
    const text = String(value ?? '').trim();
    if (!text) return undefined;
    if (/^\d+(\.\d+)?$/.test(text)) return Number(text) * 1000;
    const date = /[a-z]/i.test(text) ? Date.parse(text) : NaN;
    return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
  }
  // The error batch requests and the Gemini, Kimi, Qwen and Z.ai clients throw for a non-2xx answer. A 429 carries the server's own window (retryAfter)
  // and the cooldown written when a batch stops (retryAt, never under a minute).
  function httpError(response) {
    const status = response.status;
    const error = Error(status === 401 ? 'login' : status === 403 ? 'forbidden' : status === 429 ? 'rate-limit' : 'http-' + status);
    if (status === 429) {
      const ms = retryAfterMs(response.headers?.get('Retry-After'));
      if (ms !== undefined) error.retryAfter = ms;
      error.retryAt = Date.now() + Math.max(60000, error.retryAfter || 0);
    }
    return error;
  }
  return {chatId, select, match, siteForUrl, isCoworkId, settings, concurrencyOptions, supports, retryAfterMs, httpError};
})();
