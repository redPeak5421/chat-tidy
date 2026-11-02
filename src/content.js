(() => {
  'use strict';
  if (globalThis.__chatTidyInstalled) return;
  globalThis.__chatTidyInstalled = true;
  const core = ChatTidyCore, i18n = ChatTidyI18n;
  const site=core.siteForUrl(location.href);
  if(!site)return;
  let settings = {...core.settings,language:i18n.browserLanguage()};
  function organizationId(){
    if(site.id!=='claude')return null;
    const value=document.cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith('lastActiveOrg='))?.slice(14);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'')?value:null;
  }
  let selectionOrganization=organizationId();
  const selected = new Map();
  // The row element each chat was ticked on. Mapped sites (Qwen, Z.ai) only act when that very element still carries the ID.
  const pickedRows = new Map();
  function sameWorkspace(){
    const current=organizationId();
    if(current===selectionOrganization)return true;
    selectionOrganization=current;selected.clear();deleted.clear();
    document.querySelectorAll('.cs-deleted-row').forEach(row=>row.classList.remove('cs-deleted-row'));
    return false;
  }
  let expired=false;
  let busy = false, scheduled = false, observer;
  const t = (key,vars) => i18n.t(settings.language,key,vars);
  const own = node => node?.nodeType === 1 && (node.matches('[data-cs-owned]') || node.closest('[data-cs-owned]'));
  function el(tag,className,text) { const node=document.createElement(tag); if(className)node.className=className; if(text!==undefined)node.textContent=text; return node; }
  const icons={
    manage:'M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-6 4V5a1 1 0 0 1 1-1Z M7 9l1.5 1.5L11 8 M13 9h4 M7 13h10',
    search:'M11 4a7 7 0 1 1 0 14a7 7 0 1 1 0-14Z M16.5 16.5 20 20',
    all:'M5 5h14v14H5Z M8.5 12l2.5 2.5 4.5-5',
    invert:'M4 8h13 M14 5l3 3-3 3 M20 16H7 M10 13l-3 3 3 3',
    clear:'M7 7l10 10 M17 7 7 17',
    archive:'M4 5h16v4H4Z M5 9v10h14V9 M10 13h4',
    move:'M3 6h6l2 2h10v11H3Z M10 13.5h7 M14 10.5l3 3-3 3',
    delete:'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6'
  };
  function svgIcon(name){
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',icons[name]);icon.append(path);return icon;
  }
  function visible(node) { return node?.isConnected && !node.closest('[hidden],[aria-hidden="true"],.cs-deleted-row') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'; }
  const searchSelector='[role="dialog"] [cmdk-list]';
  // Sites whose sidebar sits inside <main> declare precise roots; the others exclude main content wholesale.
  const scopedRoots=['gemini','kimi','qwen'].includes(site.id);
  const canArchive=core.supports(site,'archive');
  const hasManager=core.supports(site,'manager');
  function rootSelector(){return site.id==='grok'?site.roots+','+searchSelector:site.roots;}
  function roots() { return [...document.querySelectorAll(rootSelector())].filter(node=>visible(node)&&(scopedRoots||!node.closest('main'))); }
  // Qwen and Z.ai rows carry no href: the site module maps them to IDs from the website's own list.
  const qwenRows=site.id==='qwen'&&globalThis.ChatTidyQwen?ChatTidyQwen.create({changed:()=>schedule()}):null;
  const zaiRows=site.id==='zai'&&globalThis.ChatTidyZai?ChatTidyZai.create({changed:()=>schedule()}):null;
  const siteRows=qwenRows||zaiRows,siteApi=qwenRows?ChatTidyQwen:zaiRows?ChatTidyZai:null;
  const chatgptRow='[data-sidebar-chatgpt-conversation-key]';
  function rowId(link){
    const row=site.id==='chatgpt'&&link.closest(chatgptRow);
    if(row){
      const key=row.getAttribute('data-sidebar-chatgpt-conversation-key');
      const id=key?.match(/^chatgpt:conversation:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1];
      return id?.toLowerCase()||null;
    }
    return siteRows?siteRows.idOf(link):core.chatId(link.getAttribute('href'),site.origin);
  }
  function rowNodes(root){
    const links=[...root.querySelectorAll('a[href]')];
    if(site.id!=='chatgpt')return links;
    // New app-shell rows navigate through a role=button; only the surrounding conversation key is authoritative.
    return [...links.filter(link=>!link.closest(chatgptRow)),...root.querySelectorAll(chatgptRow)].map(node=>node.matches(chatgptRow)?node.querySelector('[role="button"][aria-label],a[href]'):node).filter(Boolean);
  }
  function items(rootList) {
    const result=[],seen=new Set();
    if(siteRows){
      for(const row of siteRows.scan()){if(!visible(row.link))continue;result.push({id:row.id,title:row.title,link:row.link,root:row.link.closest(site.roots)||document.body});}
      return result;
    }
    for(const root of rootList||roots()) for(const link of rowNodes(root)) {
      // The ID is a cheap attribute read; style and layout checks only run for real chat rows.
      if(seen.has(link))continue;const id=rowId(link);if(!id){seen.add(link);continue;}
      if(!visible(link))continue;seen.add(link);
      // Our checkbox has no text, so cloning is only needed when native buttons or other owned nodes sit inside the row.
      let text=link.getAttribute('aria-label');
      if(!text){if(link.querySelector('button,[data-cs-owned]:not(input)')){const clone=link.cloneNode(true);clone.querySelectorAll('[data-cs-owned],button').forEach(n=>n.remove());text=clone.textContent;}else text=link.textContent;}
      const title=(text||link.getAttribute('title')||'').trim();
      if(title)result.push({id,title,link,root});
    }
    return result;
  }
  function contextAlive(){
    if(expired)return false;
    try{if(chrome.runtime.id)return true;}catch{}
    expired=true;ChatTidyBatch.cancel();observer?.disconnect();selected.clear();settings.enabled=false;
    for(const module of readers)module.destroy();
    void grokHistory?.setEnabled(false);cleanup();
    const notice=el('section','cs-status cs-context-expired',t('refresh'));notice.dataset.csOwned='true';
    const close=el('button','cs-button',t('close'));close.onclick=()=>notice.remove();notice.append(close);document.body.append(notice);
    return false;
  }
  // Returns true/false for an opaque enough background, or null when the color is transparent or unknown.
  function darkColor(value){
    const m=/^(rgba?|oklch|oklab|lch|lab|color)\((.*)\)$/.exec(String(value).trim());if(!m)return null;
    let [channels,alpha='1']=m[2].split('/');let parts=channels.trim().split(/[\s,]+/);
    if(m[1]==='color'){if(parts.shift()!=='srgb')return null;parts=parts.map(v=>parseFloat(v)*255);}
    if(m[1].startsWith('rgb')&&parts.length>3)alpha=parts[3];
    const num=v=>String(v).endsWith('%')?parseFloat(v)/100:parseFloat(v);
    if(num(alpha)<.5)return null;
    if(m[1].startsWith('rgb')||m[1]==='color'){const [r,g,b]=parts.map(v=>String(v).endsWith('%')?parseFloat(v)*2.55:parseFloat(v));return (.2126*r+.7152*g+.0722*b)/255<.5;}
    const l=num(parts[0]);return m[1].startsWith('ok')?l<.6:(String(parts[0]).endsWith('%')?l:l/100)<.5;
  }
  // "System" follows the site's rendered theme; the OS preference is only a fallback because sites have their own switch.
  function pageTheme(){
    for(let node=document.querySelector('.cs-toolbar')?.parentElement||document.body;node;node=node.parentElement){
      const dark=darkColor(getComputedStyle(node).backgroundColor);if(dark!==null)return dark?'dark':'light';
    }
    return getComputedStyle(document.documentElement).colorScheme==='dark'?'dark':'system';
  }
  function applyTheme(){
    if(!settings.enabled){delete document.documentElement.dataset.csTheme;return;}
    const theme=['light','dark'].includes(settings.theme)?settings.theme:pageTheme();
    if(document.documentElement.dataset.csTheme!==theme)document.documentElement.dataset.csTheme=theme;
  }
  function coworkState(){const ids=[...selected.keys()];return {coworkOnly:site.id==='claude'&&ids.length>0&&ids.every(id=>core.isCoworkId(id)),mixed:site.id==='claude'&&ids.some(id=>core.isCoworkId(id))};}
  // Title filter state for the open menu; matches are recomputed on every scan while a query is active.
  let filterQuery='',matches=[],filterTimer=0;
  // Titles from the last scan, so a checkbox click never re-reads the whole sidebar.
  let titles=new Map();
  function applyFilter(query){
    filterQuery=query;const found=filterQuery.trim()?items():[];
    matches=core.match(found,filterQuery);
    const ids=new Set(matches.map(item=>item.id));
    document.querySelectorAll('.cs-match').forEach(link=>{if(!ids.has(rowId(link)))link.classList.remove('cs-match');});
    for(const item of matches)item.link.classList.add('cs-match');
  }
  function closeMenus(){
    clearTimeout(filterTimer);
    document.querySelectorAll('.cs-actions').forEach(n=>{if(n.hasAttribute('popover'))n.hidePopover?.();n.hidden=true;});
    document.querySelectorAll('.cs-toggle').forEach(n=>n.setAttribute('aria-expanded','false'));
    document.querySelectorAll('.cs-filter-input').forEach(input=>input.value='');
    if(filterQuery)applyFilter('');
    sync();
  }
  function sync() {
    const count=t('selected',{n:selected.size});
    document.querySelectorAll('.cs-toolbar').forEach(bar=>{
      bar.classList.toggle('cs-has-selection',selected.size>0);bar.classList.toggle('cs-always',settings.checkboxMode==='always');
      // The rail entry stays visible in every checkbox mode: hidden checkboxes must not hide the one-click select-all menu.
      bar.hidden=false;
    });
    document.querySelectorAll('.cs-count').forEach(node=>{if(node.textContent!==count)node.textContent=count;});
    renderResults();
    document.querySelectorAll('.cs-checkbox').forEach(box=>{box.checked=selected.has(box.dataset.csId);box.disabled=busy;box.closest('.cs-chat-link')?.classList.toggle('cs-selected',box.checked);});
    const {coworkOnly,mixed}=coworkState();
    document.querySelectorAll('[data-cs-action]').forEach(button=>{const action=button.dataset.csAction;
      button.disabled=busy || (action==='archive'&&site.id==='claude'&&!coworkOnly) || (action==='move'&&mixed) || (['clear','delete','archive','move'].includes(action)&&!selected.size) || (action==='matches'&&!matches.length);
      if(action==='matches'){const text=t('selectMatches',{n:matches.length});if(button.textContent!==text)button.textContent=text;button.hidden=!filterQuery.trim();}
      // Ordinary Claude chats have no native archive, and Cowork tasks cannot be moved into a group.
      if(action==='archive'&&site.id==='claude')button.hidden=!coworkOnly;
      if(action==='move'&&site.id==='claude')button.hidden=mixed;});
  }
  // The panel lists the matches itself: on narrow layouts it covers the very rows the filter highlights.
  // The list is rebuilt only when the matches change; every sync just mirrors the selection onto its checkboxes.
  function renderResults(){
    // A chat shown in two sections (pinned and recents) is one entry.
    const query=filterQuery.trim(),shown=[...new Map(matches.map(item=>[item.id,item])).values()];
    const key=query&&query+'\n'+shown.map(item=>item.id+'\t'+item.title).join('\n');
    document.querySelectorAll('.cs-results').forEach(list=>{
      if(list.dataset.csKey!==key){
        // A rescan can rename or add a match while the user is in the list; keep focus and scroll across the rebuild.
        const focused=list.contains(document.activeElement)?document.activeElement.dataset.csResult:null,top=list.scrollTop;
        list.dataset.csKey=key;list.replaceChildren();list.hidden=!query;
        if(query&&!shown.length)list.append(el('li','cs-results-empty',t('noMatches')));
        for(const {id,title} of shown){
          const entry=el('li'),label=el('label','cs-result'),box=el('input');box.type='checkbox';box.dataset.csResult=id;
          box.addEventListener('change',()=>{
            if(busy)return;
            // Resolve the row at tick time: sites re-render rows before the next scan, and a mapped site (Qwen, Z.ai)
            // only acts on the very element that still carries this ID. Otherwise the tick waits for a fresh scan.
            const row=[...document.querySelectorAll('.cs-checkbox')].find(n=>n.dataset.csId===id)?.parentElement||matches.find(item=>item.id===id)?.link;
            if(box.checked&&row?.isConnected&&(!siteRows||siteRows.idOf(row)===id)){selected.set(id,title);pickedRows.set(id,row);}
            else{selected.delete(id);if(box.checked)schedule();}
            sync();
          });
          label.append(box,el('span','',title));label.title=title;entry.append(label);list.append(entry);
        }
        list.scrollTop=top;if(focused)list.querySelector(`[data-cs-result="${focused}"]`)?.focus();
        placeMenu(list.closest('.cs-toolbar'));
      }
      list.querySelectorAll('input').forEach(box=>{box.checked=selected.has(box.dataset.csResult);box.disabled=busy;});
    });
  }
  // Beside the sidebar when the window has room, so the panel never hides the rows the filter highlights; otherwise under the icon.
  function placeMenu(bar){
    const toggle=bar?.querySelector('.cs-toggle'),actions=bar?.querySelector('.cs-actions');if(!toggle||!actions||actions.hidden)return;
    const rect=toggle.getBoundingClientRect(),panel=actions.getBoundingClientRect().width||300,rtl=getComputedStyle(toggle).direction==='rtl';
    let side=bar.classList.contains('cs-chatgpt-rail-toolbar')?rect:null;
    if(!side){
      let sidebar=null;for(let node=bar.parentElement;node;node=node.parentElement)if(node.matches(rootSelector()+',#sidebar'))sidebar=node;
      const box=sidebar?.getBoundingClientRect();
      if(box&&box.width>0&&box.width<window.innerWidth*.6&&(rtl?box.left-panel-16>=0:box.right+panel+16<=window.innerWidth))side=box;
    }
    const left=side?(rtl?side.left-panel-8:side.right+8):rect.right-panel;
    actions.style.top=Math.max(8,Math.min(side?rect.top:rect.bottom+6,window.innerHeight-(actions.offsetHeight||160)-8))+'px';
    actions.style.left=Math.max(8,Math.min(left,window.innerWidth-panel-8))+'px';
  }
  // An icon button shows a short label (label overrides the key's text) and keeps the full name as its tooltip.
  function button(key,action,icon,label) {
    const b=el('button','cs-button');b.type='button';b.dataset.csAction=action;
    if(!icon)b.textContent=t(key);
    else{b.append(svgIcon(icon));b.title=t(key);b.append(el('span','',t(label||key)));}
    b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();act(action);});return b;
  }
  function act(action) {
    if(!contextAlive()||busy)return;
    sameWorkspace();
    // Selecting matches keeps the panel open so the chosen action is one click away.
    if(action==='matches'){for(const item of matches){selected.set(item.id,item.title);pickedRows.set(item.id,item.link);}sync();return;}
    if(action==='archiveManager'){void archiveManager?.open();return;}
    const {coworkOnly,mixed}=coworkState();
    if(action==='move'){
      if(!mover||!selected.size||mixed)return;
      void mover.open([...selected].map(([id,title])=>({id,title})));return;
    }
    if(action==='archive'&&site.id==='claude'&&!coworkOnly)return;
    if(action==='delete'||(action==='archive'&&canArchive))return confirmDelete(action);
    const found=items(),before=new Set(selected.keys());core.select(selected,found,action);
    for(const item of found)if(selected.has(item.id)&&!before.has(item.id))pickedRows.set(item.id,item.link);sync();
  }
  function toolbar(root,found) {
    const existing=root.querySelector('.cs-toolbar')||(site.id==='chatgpt'?document.querySelector('.cs-chatgpt-rail-toolbar'):null);
    if(existing){if(['chatgpt','claude'].includes(site.id))placeToolbar(root,existing,found);return;}
    if(root.previousElementSibling?.classList.contains('cs-search-toolbar'))return;
    if(site.id==='grok'&&root.matches('[cmdk-list]')){
      const bar=el('div','cs-toolbar cs-search-toolbar');bar.dataset.csOwned='true';bar.setAttribute('role','group');bar.setAttribute('aria-label',t('manage'));
      bar.append(el('span','cs-count'));for(const key of ['clear','invert','all','delete'])bar.append(button(key,key));root.before(bar);return;
    }
    const bar=el('div','cs-toolbar');bar.dataset.csOwned='true';
    bar.setAttribute('role','group');bar.setAttribute('aria-label',t('manage'));
    const count=el('span','cs-count');count.setAttribute('aria-live','polite');
    const actions=el('div','cs-actions');
    // Native sidebar rows have isolated stacking contexts. Render the menu in the top layer above them.
    if(typeof actions.showPopover==='function')actions.setAttribute('popover','manual');
    // Compact panel: filter row, selection row, then action row; new features fill rows instead of lengthening a list.
    const filterRow=el('div','cs-filter-row'),field=el('label','cs-filter'),input=el('input','cs-filter-input');
    input.type='text';input.placeholder=t('filterPlaceholder');input.setAttribute('aria-label',t('filterPlaceholder'));input.autocomplete='off';input.spellcheck=false;
    input.addEventListener('input',()=>{clearTimeout(filterTimer);filterTimer=setTimeout(()=>{applyFilter(input.value);sync();},120);});
    // Keep typing away from site shortcuts such as ChatGPT's type-to-focus composer.
    for(const type of ['keydown','keyup','keypress'])input.addEventListener(type,event=>{
      event.stopPropagation();if(type!=='keydown')return;
      if(event.key==='Enter'){event.preventDefault();clearTimeout(filterTimer);applyFilter(input.value);act('matches');}
      if(event.key==='Escape'){event.preventDefault();closeMenus();bar.querySelector('.cs-toggle')?.focus();}
    });
    const pick=el('button','cs-button cs-pick');pick.type='button';pick.dataset.csAction='matches';pick.hidden=true;
    pick.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();act('matches');});
    field.append(svgIcon('search'),input);filterRow.append(field,pick);
    const results=el('ul','cs-results');results.hidden=true;results.setAttribute('aria-label',t('filterPlaceholder'));
    // Space and arrows on the result checkboxes must not reach site shortcuts; Escape still closes the panel.
    for(const type of ['keydown','keyup','keypress'])results.addEventListener(type,event=>{if(event.key!=='Escape')event.stopPropagation();});
    // Count on its own line, then three labelled, equal-width selection buttons.
    const selectRow=el('div','cs-select-row'),choices=el('div','cs-select-buttons');
    for(const key of ['all','invert','clear'])choices.append(button(key,key,key));
    selectRow.append(count,choices);
    const runRow=el('div','cs-run-row');
    for(const key of [...(canArchive?['archive']:[]),...(mover?['move']:[]),'delete']){
      const control=button(key==='move'?mover.label:key,key,key,key==='move'?'moveShort':undefined);
      if(key==='archive'&&site.id==='claude'){control.title=t('coworkArchiveOnly');control.hidden=true;}
      runRow.append(control);
    }
    actions.append(filterRow,results,selectRow,runRow);
    // The top layer keeps DOM ancestry: on Qwen the toolbar sits inside the "All chats" folder button, so panel clicks
    // (labels, result rows) must not bubble into native header handlers. Outside-click closing ignores the panel anyway.
    actions.addEventListener('click',event=>event.stopPropagation());
    if(hasManager){const section=el('div','cs-manager-section');section.append(button('archiveManager','archiveManager'));actions.append(section);}
    actions.hidden=true;const toggle=el('button','cs-button cs-toggle');
    toggle.append(svgIcon('manage'));toggle.type='button';toggle.title=t('manage');toggle.setAttribute('aria-label',t('manage'));toggle.setAttribute('aria-expanded','false');
    toggle.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();
      if(!actions.hidden){closeMenus();return;}
      closeMenus();applyTheme();actions.hidden=false;toggle.setAttribute('aria-expanded','true');
      if(actions.hasAttribute('popover'))actions.showPopover?.();
      placeMenu(bar);input.focus();});
    bar.append(toggle,actions);
    placeToolbar(root,bar,found);
  }
  function placeToolbar(root,bar,found){
    const rail=site.id==='chatgpt'?[...document.querySelectorAll('[data-app-navigation-rail]')].find(visible):null;
    let host=rail?.querySelector('[data-sidebar-destination]')?.parentElement;
    if(host){while(host.parentElement&&host.parentElement!==rail)host=host.parentElement;}
    if(host&&host!==rail){
      if(!bar.classList.contains('cs-chatgpt-rail-toolbar')){
        bar.previousElementSibling?.classList.remove('cs-heading-hover');bar.parentElement?.classList.remove('cs-chatgpt-heading');
        bar.classList.remove('cs-at-heading');bar.classList.add('cs-chatgpt-rail-toolbar');
        // The native scroll group uses a fade mask; the top layer keeps the menu outside that clipping area.
        bar.querySelector('.cs-actions').setAttribute('popover','manual');
      }
      if(bar.parentElement!==host)host.append(bar);
      return;
    }
    if(bar.classList.contains('cs-chatgpt-rail-toolbar')){
      closeMenus();bar.classList.remove('cs-chatgpt-rail-toolbar');bar.hidden=false;
    }
    const headings=[...root.querySelectorAll('h2,h3,[role="heading"],button')].filter(node=> /^(聊天|聊天記錄|聊天记录|最近|最近使用|最近的聊天|Recent|Recent chats|Chats|Chats and tasks|Recents|Your chats|Discussions|Vos discussions|チャット|チャット履歴|Чаты|Ваши чаты|历史会话|歷史會話|Chat History|История чатов|Historique des discussions|对话|對話|Conversations|All chats|全部对话|全部聊天|所有对话|所有對話|Tous les chats|すべてのチャット|Все чаты)$/i.test((node.querySelector('[data-group-name]')?.textContent||node.textContent).trim()));
    // Kimi's section header keeps its title (a collapse button or a plain div) beside a "view all" action.
    // Qwen's "All chats" section header is div.list-folder > … > div.folder-button holding .folder-name and the chevron
    // (the React prop id="finsh" never reaches the DOM); the icon goes right after the name, on that row.
    const qwenHeader=site.id==='qwen'?root.querySelector('.list-folder .folder-button'):null;
    // Z.ai's panel starts with a plain "Recent" label div followed by a (usually hidden) group tab button; the icon goes inside the label row.
    const zaiLabel=site.id==='zai'?[...root.children].find(node=>node.id.startsWith('chat-group-tab-'))?.previousElementSibling:null;
    const zaiHeader=zaiLabel?.tagName==='DIV'&&!zaiLabel.querySelector('.AgentChatList')&&visible(zaiLabel)?zaiLabel:null;
    const chatgptHeading=site.id==='chatgpt'?root.querySelector('[data-app-action-sidebar-section-heading="Recents"] [data-app-action-sidebar-section-toggle]'):null;
    // Claude may group recents by date. Prefer its first recent label, leaving the pinned header alone.
    const claudeHeading=site.id==='claude'?(headings.find(node=>!own(node))||root.querySelector('[data-row-key^="label:"] [data-group-toggle]')||root.querySelector('[data-group-toggle]')):null;
    const heading=chatgptHeading||claudeHeading||(site.id==='gemini'?root.querySelector('[aria-controls="sidenav-section-content-chats"]'):site.id==='kimi'?(root.querySelector('.next-sidebar-section:has(.next-sidebar-history-list) .next-sidebar-section__title')||headings.find(node=>!own(node))):site.id==='qwen'?(qwenHeader||headings.find(node=>!own(node))):headings.find(node=>!own(node)));
    if(zaiHeader){zaiHeader.classList.add('cs-heading-row','cs-zai-heading');if(bar.parentElement!==zaiHeader)zaiHeader.append(bar);bar.classList.add('cs-at-heading');}
    else if(heading&&site.id==='qwen'&&heading===qwenHeader){heading.classList.add('cs-heading-hover','cs-heading-row');const name=heading.querySelector('.folder-name');if(name)name.insertAdjacentElement('afterend',bar);else heading.append(bar);bar.classList.add('cs-at-heading');}
    else if(heading) { const host=heading.closest('button,a')||heading;host.classList.add('cs-heading-hover');if(site.id==='gemini')host.parentElement.classList.add('cs-gemini-heading');if(site.id==='kimi')host.parentElement.classList.add('cs-heading-row');if(chatgptHeading)host.parentElement.classList.add('cs-chatgpt-heading');if(site.id==='claude'&&(host.matches('[data-group-toggle]')||host.querySelector('[data-group-toggle]')))host.parentElement.classList.add('cs-claude-heading');if(host.nextElementSibling!==bar)host.insertAdjacentElement('afterend',bar);bar.classList.add('cs-at-heading'); }
    else { const first=found.find(item=>root.contains(item.link)&&!item.link.closest('.cs-deleted-row'));if(first){let container=first.link.closest('ol,ul');if(!container||!root.contains(container))container=first.link.parentElement;container.before(bar);}else root.prepend(bar); }
  }
  function scan() {
    if(!contextAlive()||!settings.enabled||busy)return;
    observer?.disconnect();
    sameWorkspace();
    grokHistory?.render();
    botsController?.update(settings);
    archiveManager?.scan();
    if(site.id==='chatgpt'){
      // Virtualized listitems can be reused for an unrelated conversation or work task.
      document.querySelectorAll(chatgptRow+'.cs-deleted-row').forEach(row=>{if(!deleted.has(rowId(row)))row.classList.remove('cs-deleted-row');});
      for(const box of document.querySelectorAll(chatgptRow+' .cs-checkbox'))if(rowId(box.parentElement)!==box.dataset.csId){
        const row=box.parentElement;row.classList.remove('cs-chat-link','cs-chatgpt-row','cs-dynamic','cs-selected','cs-wave-active','cs-match');row.style.removeProperty('--cs-wave');box.remove();
      }
    }
    // Row identities are resolved by items(); hide afterwards so freshly rendered Qwen rows are recognized.
    const rootList=roots(),found=items(rootList);titles=new Map(found.map(item=>[item.id,item.title]));
    // Mapped rows (Qwen, Z.ai) can be reused for another chat or lose their mapping: a checkbox never outlives the ID of its row.
    if(siteRows){const live=new Set(found.map(item=>item.link));for(const box of document.querySelectorAll('.cs-checkbox[data-cs-id]')){const row=box.parentElement;if(live.has(row)&&siteRows.idOf(row)===box.dataset.csId)continue;row.classList.remove('cs-chat-link','cs-dynamic','cs-selected','cs-wave-active','cs-match');row.style.removeProperty('--cs-wave');box.remove();}
      // A selection never follows its ID to another row element: the user ticked a row, not a position in the website's list.
      for(const item of found){const row=pickedRows.get(item.id);if(selected.has(item.id)&&row&&row!==item.link){selected.delete(item.id);pickedRows.delete(item.id);}}
      // Nor does it stay on a row that now carries another chat's ID.
      for(const id of [...selected.keys()]){const other=pickedRows.get(id)&&siteRows.idOf(pickedRows.get(id));if(other&&other!==id){selected.delete(id);pickedRows.delete(id);}}}
    hideDeleted();
    for(const item of found) {
      // Put the checkbox inside the row link, using capture to prevent link navigation.
      let box=item.link.querySelector('.cs-checkbox');
      if(box&&box.dataset.csId!==item.id){box.remove();box=null;}
      if(!box){box=el('input','cs-checkbox');box.type='checkbox';box.dataset.csOwned='true';box.dataset.csId=item.id;
        box.addEventListener('click',event=>{event.stopPropagation();});
        box.addEventListener('change',()=>{if(busy)return;if(box.checked){selected.set(item.id,item.title);pickedRows.set(item.id,item.link);}else selected.delete(item.id);sync();});
        item.link.prepend(box);
      }
      item.link.classList.add('cs-chat-link');
      item.link.classList.toggle('cs-starred',!!saved[site.id+':'+item.id]);
      item.link.classList.toggle('cs-chatgpt-row',site.id==='chatgpt'&&!!item.link.closest(chatgptRow));
      const search=site.id==='grok'&&!!item.link.closest('[cmdk-list]');
      item.link.classList.toggle('cs-grok-search-link',search);
      if(search)item.link.closest('[cmdk-item]')?.classList.add('cs-grok-result');
      item.link.classList.toggle('cs-dynamic',!search&&settings.checkboxMode!=='always');
      box.setAttribute('aria-label',t('selectChat',{title:item.title}));
    }
    // One toolbar for each top-level visible sidebar; nested history containers do not duplicate it.
    // hideDeleted may have hidden a whole root; only then do the roots need another visibility pass.
    const parents=(deleted.size?roots():rootList).filter(root=>found.some(item=>root.contains(item.link)));
    for(const root of parents.filter(root=>!parents.some(other=>other!==root&&other.contains(root))))toolbar(root,found);
    grokHistory?.render();
    if(filterQuery.trim())applyFilter(filterQuery);
    sync();applyTheme();watch();band=null;queueWave();
  }
  function schedule(){if(expired||scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;scan();},80);}
  function watch(){if(expired)return;observer?.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href','hidden','aria-hidden','aria-expanded','class','data-sidebar-chatgpt-conversation-key','aria-label']});}
  function cleanup(){clearTimeout(filterTimer);filterQuery='';matches=[];document.querySelectorAll('.cs-match').forEach(n=>n.classList.remove('cs-match'));document.querySelectorAll('.cs-gemini-heading,.cs-heading-row,.cs-chatgpt-heading,.cs-claude-heading,.cs-zai-heading').forEach(n=>n.classList.remove('cs-gemini-heading','cs-heading-row','cs-chatgpt-heading','cs-claude-heading','cs-zai-heading'));document.querySelectorAll('.cs-grok-result').forEach(n=>n.classList.remove('cs-grok-result'));document.querySelectorAll('.cs-grok-search-link').forEach(n=>n.classList.remove('cs-grok-search-link'));document.querySelectorAll('.cs-heading-hover').forEach(node=>node.classList.remove('cs-heading-hover'));document.querySelectorAll('[data-cs-owned]').forEach(node=>node.remove());document.querySelectorAll('.cs-chat-link').forEach(node=>{node.classList.remove('cs-chat-link','cs-chatgpt-row','cs-dynamic','cs-selected','cs-wave-active','cs-starred');node.style.removeProperty('--cs-wave');});}
  function confirmDelete(action='delete'){
    if(!contextAlive())return;
    if(!selected.size||document.querySelector('.cs-confirm'))return;
    if(!sameWorkspace()){sync();return;}
    const approvedOrganization=selectionOrganization;
    const snapshot=[...selected].map(([id,title])=>({id,title}));
    const dialog=el('dialog','cs-confirm');dialog.dataset.csOwned='true';
    const title=el('h2','',t(action==='archive'?'archiveTitle':'confirmTitle'));title.id='cs-confirm-title';dialog.setAttribute('aria-labelledby',title.id);
    const warning=action==='archive'?(site.id==='claude'?'coworkArchiveWarning':site.id==='qwen'?'qwenArchiveWarning':'archiveWarning'):'warning';
    dialog.append(title,el('p','',t(warning,{n:snapshot.length,site:site.name})));
    const list=el('ul','cs-review');for(const item of snapshot)list.append(el('li','',item.title));dialog.append(list);
    const footer=el('div','cs-footer'),cancel=el('button','cs-button',t('cancel')),confirm=el('button','cs-button cs-danger',t(action==='archive'?'archiveConfirm':'confirm',{n:snapshot.length}));
    cancel.dataset.csCancel='true';confirm.dataset.csConfirm='true';cancel.type=confirm.type='button';
    const opener=document.activeElement;const close=()=>{dialog.close();dialog.remove();opener?.focus();};
    cancel.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    confirm.onclick=()=>{close();if(!sameWorkspace()){sync();return;}void runBatch(snapshot,approvedOrganization,action);};footer.append(cancel,confirm);dialog.append(footer);(site.id==='grok'?document.querySelector('[role="dialog"]:has([cmdk-list])')||document.body:document.body).append(dialog);dialog.showModal();cancel.focus();
  }
  const deleted = new Set();
  // A Z.ai row wrapper is hidden only when it holds this one row; otherwise only the row button is.
  function zaiWrapper(link){const wrap=link.closest('.AgentChatList>div');return wrap&&wrap.querySelectorAll('button[data-selected]').length===1?wrap:null;}
  function hideDeleted() {
    if(!deleted.size)return;
    const links=qwenRows?[...document.querySelectorAll(site.roots+' a.chat-item-drag-link')]:zaiRows?[...document.querySelectorAll('#sidebar .AgentChatList button[data-selected]')]:[...new Set([...document.querySelectorAll(rootSelector())].flatMap(rowNodes))];
    for(const link of links) {
      if(!deleted.has(rowId(link)))continue;
      let row=(site.id==='chatgpt'?link.closest(chatgptRow):null)||link.closest('.cs-grok-result')||(qwenRows?link.closest('.chat-item-drag'):null)||(zaiRows?zaiWrapper(link):null)||link;
      const parent=link.parentElement;
      if(row===link&&parent && !parent.matches('nav,aside,ul,ol,#history') && parent.querySelectorAll('a[href]').length===1 && !parent.querySelector('.cs-toolbar')) row=parent;
      row.classList.add('cs-deleted-row');
    }
  }
  // The account that was signed in when the rows were selected; a run under another account stops.
  let siteUser=null;
  function refreshSiteUser(){if(!siteApi)return;siteApi.session().then(id=>{siteUser=id;}).catch(()=>{siteUser=null;});}
  function notice(text){const box=el('section','cs-status',text);box.dataset.csOwned='true';const close=el('button','cs-button',t('close'));close.onclick=()=>box.remove();box.append(close);document.body.append(box);}
  async function runBatch(snapshot,approvedOrganization,action='delete',target){
    if(!contextAlive()||busy)return;busy=true;sync();
    if(siteRows){
      // Rows are mapped by structure. The website's list is read again first; then every approved ID must still be mapped
      // to the very row element the user ticked, with the reviewed title, or nothing runs.
      const current=new Map((await siteRows.reload()).filter(row=>row.link.isConnected).map(row=>[row.id,row]));
      if(snapshot.some(item=>{const row=current.get(item.id);return !row||row.title!==item.title||row.link!==pickedRows.get(item.id);})){busy=false;sync();notice(t('apiError')+' (rows-changed)');schedule();return;}
      try{const user=await siteApi.session();if(siteUser&&user!==siteUser)throw Error('account-changed');siteUser=user;}catch(error){if(error.message!=='account-changed')siteUser=null;busy=false;sync();notice(t('apiError')+' ('+error.message+')');return;}
      if(!snapshot.length){busy=false;sync();notice(t('apiError')+' (rows-changed)');return;}
    }
    const allowed=new Set(snapshot.map(item=>item.id)), completed=new Set();
    // Moved ChatGPT and Qwen chats leave the main list; Claude keeps grouped chats in its recents.
    const hide=action!=='move'||site.id!=='claude';
    const status=el('section','cs-status');status.dataset.csOwned='true';status.setAttribute('aria-label',t('manage'));
    const message=el('p','',t('progress',{done:0,total:snapshot.length}));message.setAttribute('role','status');
    const hint=el('p','cs-hint',t(action==='archive'?'archiveWorking':action==='move'?'moveWorking':'working')),stop=el('button','cs-button',t('stop'));stop.type='button';
    stop.onclick=()=>{stop.disabled=true;ChatTidyBatch.cancel();};
    status.append(message,hint,stop);(site.id==='grok'?document.querySelector('[role="dialog"]:has([cmdk-list])')||document.body:document.body).append(status);
    // Acknowledgements are recorded at once; the sidebar pass (hide rows, checkboxes, count) runs at most once per frame.
    let frame=0;
    const paint=()=>{frame=0;hideDeleted();message.textContent=t('progress',{done:completed.size,total:snapshot.length});sync();};
    const update=(ids,final)=>{
      if(!status.isConnected)document.body.append(status);
      const done=[];
      for(const id of ids||[])if(allowed.has(id)&&!completed.has(id)){completed.add(id);selected.delete(id);if(hide)deleted.add(id);done.push(id);}
      siteRows?.forget(done);
      if(final){cancelAnimationFrame(frame);paint();}else if(!frame)frame=requestAnimationFrame(paint);
    };
    let result;
    try {
      result=await ChatTidyBatch.run({action,target,ids:[...allowed],organizationId:approvedOrganization,expectedUserId:siteRows?siteUser:undefined,onProgress:ids=>update(ids),
        canRun:()=>!expired&&contextAlive()&&organizationId()===approvedOrganization});
      update(result.completed,true);
    } catch { result={error:'connection-lost'}; }
    finally { busy=false;if(frame){cancelAnimationFrame(frame);frame=0;} }
    if(!contextAlive())return;
    const finished=result.cancelled?(action==='archive'?'archiveStopped':action==='move'?'moveStopped':'stopped'):result.error?'failed':action==='move'?'moveDone':'done';
    message.textContent=t(finished,{n:completed.size});
    hint.textContent=result.retryAt ? t('cooldown',{time:new Date(result.retryAt).toLocaleTimeString(i18n.normalize(settings.language))}) : result.error ? t('apiError')+' ('+result.error+')' : '';if(!result.error)hint.remove();
    stop.disabled=false;stop.textContent=t('close');stop.onclick=()=>status.remove();
    if(!settings.enabled){selected.clear();document.querySelectorAll('.cs-checkbox,.cs-toolbar').forEach(node=>node.remove());}
    else scan();sync();void grokHistory?.setEnabled(settings.enabled&&settings.grokShowAll);
  }
  window.addEventListener('pagehide',()=>{ChatTidyBatch.cancel();});
  // Measure unshifted row bounds so moving titles never move the trigger zone.
  // band is the x-range where an anchor can exist; while the pointer stays outside it and no row is lit, frames read no layout at all.
  let pointer=null,waveFrame=0,band=null,waving=false;
  function paintWave(){
    waveFrame=0;
    if(!waving&&(!pointer||band&&(pointer.x<band[0]||pointer.x>band[1])))return;
    const links=[...document.querySelectorAll('.cs-chat-link.cs-dynamic')];
    const rects=links.map(link=>link.getBoundingClientRect());
    band=[Infinity,-Infinity];for(const r of rects){if(r.left<band[0])band[0]=r.left;if(r.left>band[1])band[1]=r.left;}band[0]-=8;band[1]+=56;waving=false;
    const anchor=pointer && rects.find((r,i)=>pointer.x>=r.left-8 && pointer.x<=r.left+56 && pointer.y>=r.top && pointer.y<=r.bottom && visible(links[i]));
    links.forEach((link,i)=>{
      const r=rects[i],distance=pointer?Math.abs(pointer.y-(r.top+r.height/2)):Infinity;
      const radius=Math.max(1,r.height)*3.2;
      const strength=anchor && Math.abs(r.left-anchor.left)<24 && distance<radius ? Math.pow(Math.cos(distance/radius*Math.PI/2),2) : 0;
      const next=strength.toFixed(3);if(strength>0)waving=true;
      if(link.style.getPropertyValue('--cs-wave')!==next)link.style.setProperty('--cs-wave',next);
      if(link.classList.contains('cs-wave-active')!==(strength>.08))link.classList.toggle('cs-wave-active',strength>.08);
    });
  }
  function queueWave(){if(!waveFrame){waveFrame=requestAnimationFrame(paintWave);}}
  document.addEventListener('pointermove',event=>{if(event.pointerType==='touch')return;pointer={x:event.clientX,y:event.clientY};queueWave();},{passive:true,capture:true});
  document.addEventListener('pointerleave',()=>{pointer=null;queueWave();});
  window.addEventListener('blur',()=>{pointer=null;queueWave();});
  document.addEventListener('scroll',()=>{queueWave();},true);
  // Rows can shift sideways without a scan (sidebar resize or slide-in); entering a row or resizing re-measures the band.
  document.addEventListener('pointerover',event=>{if(event.target.closest?.('.cs-chat-link'))band=null;},{passive:true,capture:true});
  window.addEventListener('resize',()=>{band=null;document.querySelectorAll('.cs-toolbar').forEach(placeMenu);});
  document.addEventListener('click',event=>{if(event.target.closest?.('.cs-toolbar,.cs-confirm,.cs-move,.cs-archive-manager'))return;closeMenus();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const open=document.querySelector('.cs-toggle[aria-expanded="true"]');closeMenus();open?.focus();} });
  // Prevent parent React link handlers, while preserving the checkbox's native toggle.
  document.addEventListener('click',event=>{if(event.target.matches?.('.cs-checkbox')){event.stopPropagation();const box=event.target;if(!busy){if(box.checked){selected.set(box.dataset.csId,titles.get(box.dataset.csId)||'');pickedRows.set(box.dataset.csId,box.parentElement);}else selected.delete(box.dataset.csId);sync();}}},true);
  const botsController=site.id==='grok'&&globalThis.ChatTidyBots?ChatTidyBots.create():null;
  const grokHistory=site.id==='grok'&&globalThis.ChatTidyGrok?ChatTidyGrok.create({t,changed:schedule,error:code=>notice(t('grokLoadError')+' ('+code+')')}):null;
  const mover=globalThis.ChatTidyProjects?ChatTidyProjects.create({t,site,organizationId:()=>selectionOrganization,onRun:(snapshot,target)=>{
    if(!contextAlive())return;
    const approved=selectionOrganization;
    // A new destination may already exist at this point; say so instead of failing silently.
    if(busy){notice(t('apiError')+' (busy)');return;}
    if(!sameWorkspace()){sync();notice(t('apiError')+' (workspace-changed)');return;}
    void runBatch(snapshot,approved,'move',target);}}):null;
  // Reading tools work in the chat area with their own observers; the sidebar scan above never looks inside <main>.
  const library=globalThis.ChatTidyLibrary||null;
  const readerAdapter=globalThis.ChatTidyReaderSites?.get(site.id)||null;
  const readerOptions={t,site,adapter:readerAdapter,library,titleOf:id=>titles.get(id)||''};
  // Outline and code tools run only where the site's chat structure was verified (core.supports); layout options degrade per option.
  const readers=readerAdapter?[[globalThis.ChatTidyLayout,true],[globalThis.ChatTidyCode,core.supports(site,'codeTools')],[globalThis.ChatTidyReader,core.supports(site,'outline')]].filter(([module,on])=>module&&on).map(([module])=>module.create(readerOptions)).filter(Boolean):[];
  function updateReaders(){if(!expired)for(const module of readers)module.update({...settings});}
  // Bookmarked chats are marked in the sidebar. The sidebar filter stays title-only: its matches can be selected for deletion,
  // so a chat must never match on hidden tags or notes; finding by tag lives in the popup's bookmarks page.
  let saved={};
  function restoreRows(ids){for(const id of ids)deleted.delete(id);siteRows?.unforget(ids);document.querySelectorAll('.cs-deleted-row').forEach(row=>{const link=row.matches('a,'+chatgptRow)?row:row.querySelector('a');const id=link&&rowId(link);if(id&&!deleted.has(id))row.classList.remove('cs-deleted-row');});schedule();}
  const managerOptions=()=>({t,site,canRun:()=>!expired&&settings.enabled,onCompleted:(ids,action)=>{if(action==='restore')restoreRows(ids);}});
  let archiveManager=hasManager&&globalThis.ChatTidyArchive?ChatTidyArchive.create(managerOptions()):null;
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{if(message?.type==='cs-site'&&sender.id===chrome.runtime.id){reply({site:site.id});}if(message?.type==='cs-open-archive'&&sender.id===chrome.runtime.id&&archiveManager){void archiveManager.open();reply({ok:true});}return false;});
  document.addEventListener('pointerdown',event=>{if(event.target.matches?.('.cs-checkbox'))event.stopPropagation();},true);
  document.addEventListener('keydown',event=>{if(event.target.matches?.('.cs-checkbox'))event.stopPropagation();},true);
  chrome.storage.local.get(settings).then(stored=>{
    settings={...settings,...stored};applyTheme();
    // Sites switch themes by toggling attributes on <html>/<body> or following the OS. pageTheme() walks computed
    // styles, so bursts of attribute writes collapse into one check per frame.
    let themeFrame=0;const queueTheme=()=>{if(!themeFrame)themeFrame=requestAnimationFrame(()=>{themeFrame=0;applyTheme();});};
    const themeWatch=new MutationObserver(queueTheme),themeAttributes={attributes:true,attributeFilter:['class','style','data-theme','data-mode','data-color-mode','theme']};
    themeWatch.observe(document.documentElement,themeAttributes);if(document.body)themeWatch.observe(document.body,themeAttributes);
    globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>setTimeout(applyTheme,50));
    observer=new MutationObserver(records=>{
      if(records.some(record=>{
        const node=record.target;
        if(record.type==='attributes'&&record.attributeName==='class'){
          // Our wave/selection class writes arrive here on every hover frame: decide on the row itself before any
          // ancestor walk, and repair only missing row markers.
          const box=node.matches?.('a,[role="button"]')&&node.querySelector('.cs-checkbox');
          if(!box || node.classList.contains('cs-chat-link') &&
            node.classList.contains('cs-dynamic')===(!node.classList.contains('cs-grok-search-link')&&settings.checkboxMode!=='always') &&
            node.classList.contains('cs-selected')===selected.has(box.dataset.csId))return false;
        }
        if(own(node) || (node.closest?.('main')&&!node.closest?.('[data-testid="modal-archived-conversations"]')&&!(scopedRoots&&node.closest?.(site.roots))))return false;
        if(record.type==='attributes')return true;
        return [...record.addedNodes,...record.removedNodes].some(node=>!own(node));
      }))schedule();
    });if(settings.enabled)refreshSiteUser();scan();watch();void grokHistory?.setEnabled(settings.enabled&&settings.grokShowAll);
    updateReaders();
    if(library){library.load().then(items=>{saved=items;schedule();}).catch(()=>{});library.onChange(items=>{saved=items;schedule();});}
  }).catch(()=>{ /* Invalidated extension: refreshing the page re-injects it. */ });
  chrome.storage.onChanged.addListener((changes,area)=>{
    const keys=Object.keys(settings).filter(key=>changes[key]&&!['concurrency','hideSupport'].includes(key));
    if(area!=='local'||!keys.length)return;
    for(const key of keys)settings[key]=changes[key].newValue;
    applyTheme();botsController?.update(settings);updateReaders();
    if(!['enabled','language','checkboxMode','grokShowAll'].some(key=>changes[key]))return;
    if(busy)return;
    archiveManager?.destroy();archiveManager=hasManager&&settings.enabled&&globalThis.ChatTidyArchive?ChatTidyArchive.create(managerOptions()):null;
    mover?.close();
    cleanup();void grokHistory?.setEnabled(settings.enabled&&settings.grokShowAll);if(!settings.enabled)selected.clear();else{refreshSiteUser();scan();}
    // cleanup() removed every owned node, reading tools included; they rebuild in the new language or stay off.
    updateReaders();
  });
})();
