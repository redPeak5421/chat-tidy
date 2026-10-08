(() => {
  'use strict';
  if (globalThis.__chatTidyInstalled) return;
  globalThis.__chatTidyInstalled = true;
  const core = ChatTidyCore, i18n = ChatTidyI18n;
  const site=core.siteForUrl(location.href);
  if(!site)return;
  let settings = {enabled:true,theme:'system',grokHideBots:false,grokCollapseBots:false,grokShowAll:false,checkboxMode:'dynamic',language:i18n.browserLanguage()};
  function organizationId(){
    if(site.id!=='claude')return null;
    const value=document.cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith('lastActiveOrg='))?.slice(14);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'')?value:null;
  }
  let selectionOrganization=organizationId();
  const selected = new Map();
  function sameWorkspace(){
    const current=organizationId();
    if(current===selectionOrganization)return true;
    selectionOrganization=current;selected.clear();deleted.clear();
    document.querySelectorAll('.cs-deleted-row').forEach(row=>row.classList.remove('cs-deleted-row'));
    return false;
  }
  let expired=false;
  let busy = false, stopped = false, scheduled = false, observer;
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
  const canArchive=['chatgpt','claude','qwen'].includes(site.id);
  const hasManager=['chatgpt','qwen'].includes(site.id);
  function rootSelector(){return site.id==='grok'?site.roots+','+searchSelector:site.roots;}
  function roots() { return [...document.querySelectorAll(rootSelector())].filter(node=>visible(node)&&(scopedRoots||!node.closest('main'))); }
  // Qwen rows carry no href: the site module maps them to IDs from the website's own list.
  const qwenRows=site.id==='qwen'&&globalThis.ChatTidyQwen?ChatTidyQwen.create({changed:()=>schedule()}):null;
  const chatgptRow='[data-sidebar-chatgpt-conversation-key]';
  function rowId(link){
    const row=site.id==='chatgpt'&&link.closest(chatgptRow);
    if(row){
      const key=row.getAttribute('data-sidebar-chatgpt-conversation-key');
      const id=key?.match(/^chatgpt:conversation:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1];
      return id?.toLowerCase()||null;
    }
    return qwenRows?qwenRows.idOf(link):core.chatId(link.getAttribute('href'),site.origin);
  }
  function rowNodes(root){
    const links=[...root.querySelectorAll('a[href]')];
    if(site.id!=='chatgpt')return links;
    // New app-shell rows navigate through a role=button; only the surrounding conversation key is authoritative.
    return [...links.filter(link=>!link.closest(chatgptRow)),...root.querySelectorAll(chatgptRow)].map(node=>node.matches(chatgptRow)?node.querySelector('[role="button"][aria-label],a[href]'):node).filter(Boolean);
  }
  function items() {
    const result=[],seen=new Set();
    if(qwenRows){
      for(const row of qwenRows.scan()){if(!visible(row.link))continue;result.push({id:row.id,title:row.title,link:row.link,root:row.link.closest(site.roots)||document.body});}
      return result;
    }
    for(const root of roots()) for(const link of rowNodes(root)) {
      if(seen.has(link)||!visible(link))continue;
      seen.add(link);const id=rowId(link);if(!id)continue;
      const clone=link.cloneNode(true);clone.querySelectorAll('[data-cs-owned],button').forEach(n=>n.remove());
      const title=(link.getAttribute('aria-label')||clone.textContent||link.getAttribute('title')||'').trim();
      if(title)result.push({id,title,link,root});
    }
    return result;
  }
  function contextAlive(){
    if(expired)return false;
    try{if(chrome.runtime.id)return true;}catch{}
    expired=true;ChatTidyBatch.cancel();observer?.disconnect();selected.clear();settings.enabled=false;
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
  function applyFilter(query){
    filterQuery=query;const found=filterQuery.trim()?items():[];matches=core.match(found,filterQuery);
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
      const open=bar.querySelector('.cs-toggle')?.getAttribute('aria-expanded')==='true';
      bar.hidden=bar.classList.contains('cs-chatgpt-rail-toolbar')&&settings.checkboxMode!=='always'&&!selected.size&&!open;
      if(bar.hidden){const menu=bar.querySelector('.cs-actions');if(menu?.hasAttribute('popover'))menu.hidePopover?.();if(menu)menu.hidden=true;bar.querySelector('.cs-toggle')?.setAttribute('aria-expanded','false');}
    });
    document.querySelectorAll('.cs-count').forEach(node=>{if(node.textContent!==count)node.textContent=count;});
    document.querySelectorAll('.cs-checkbox').forEach(box=>{box.checked=selected.has(box.dataset.csId);box.disabled=busy;box.closest('.cs-chat-link')?.classList.toggle('cs-selected',box.checked);});
    const {coworkOnly,mixed}=coworkState();
    document.querySelectorAll('[data-cs-action]').forEach(button=>{const action=button.dataset.csAction;
      button.disabled=busy || (action==='archive'&&site.id==='claude'&&!coworkOnly) || (action==='move'&&mixed) || (['clear','delete','archive','move'].includes(action)&&!selected.size) || (action==='matches'&&!matches.length);
      if(action==='matches'){const text=t('selectMatches',{n:matches.length});if(button.textContent!==text)button.textContent=text;button.hidden=!filterQuery.trim();}
      // Ordinary Claude chats have no native archive, and Cowork tasks cannot be moved into a group.
      if(action==='archive'&&site.id==='claude')button.hidden=!coworkOnly;
      if(action==='move'&&site.id==='claude')button.hidden=mixed;});
  }
  // With an icon, label=false renders an icon-only button whose name moves to the tooltip.
  function button(key,action,icon,label) {
    const b=el('button','cs-button');b.type='button';b.dataset.csAction=action;
    if(!icon)b.textContent=t(key);
    else{b.append(svgIcon(icon));b.title=t(key);if(label===false){b.classList.add('cs-icon-button');b.setAttribute('aria-label',t(key));}else b.append(el('span','',t(label||key)));}
    b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();act(action);});return b;
  }
  function act(action) {
    if(!contextAlive()||busy)return;
    sameWorkspace();
    // Selecting matches keeps the panel open so the chosen action is one click away.
    if(action==='matches'){for(const item of matches)selected.set(item.id,item.title);sync();return;}
    if(action==='archiveManager'){void archiveManager?.open();return;}
    const {coworkOnly,mixed}=coworkState();
    if(action==='move'){
      if(!mover||!selected.size||mixed)return;
      void mover.open([...selected].map(([id,title])=>({id,title})));return;
    }
    if(action==='archive'&&site.id==='claude'&&!coworkOnly)return;
    if(action==='delete'||(action==='archive'&&canArchive))return confirmDelete(action);
    core.select(selected,items(),action);sync();
  }
  function toolbar(root) {
    const existing=root.querySelector('.cs-toolbar')||(site.id==='chatgpt'?document.querySelector('.cs-chatgpt-rail-toolbar'):null);
    if(existing){if(['chatgpt','claude'].includes(site.id))placeToolbar(root,existing);return;}
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
    const selectRow=el('div','cs-select-row');selectRow.append(count);
    for(const key of ['all','invert','clear'])selectRow.append(button(key,key,key,false));
    const runRow=el('div','cs-run-row');
    for(const key of [...(canArchive?['archive']:[]),...(mover?['move']:[]),'delete']){
      const control=button(key==='move'?mover.label:key,key,key,key==='move'?'moveShort':undefined);
      if(key==='archive'&&site.id==='claude'){control.title=t('coworkArchiveOnly');control.hidden=true;}
      runRow.append(control);
    }
    actions.append(filterRow,selectRow,runRow);
    if(hasManager){const section=el('div','cs-manager-section');section.append(button('archiveManager','archiveManager'));actions.append(section);}
    {
      actions.hidden=true;const toggle=el('button','cs-button cs-toggle');
      toggle.append(svgIcon('manage'));toggle.type='button';toggle.title=t('manage');toggle.setAttribute('aria-label',t('manage'));toggle.setAttribute('aria-expanded','false');
      toggle.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();
        if(!actions.hidden){closeMenus();return;}
        closeMenus();applyTheme();actions.hidden=false;toggle.setAttribute('aria-expanded','true');
        const rail=bar.classList.contains('cs-chatgpt-rail-toolbar');if(actions.hasAttribute('popover'))actions.showPopover?.();
        const rect=toggle.getBoundingClientRect(),panel=actions.getBoundingClientRect().width||300,left=rail?(getComputedStyle(toggle).direction==='rtl'?rect.left-panel-8:rect.right+8):rect.right-panel;
        actions.style.top=Math.max(8,Math.min(rail?rect.top:rect.bottom+6,window.innerHeight-(actions.offsetHeight||160)-8))+'px';actions.style.left=Math.max(8,Math.min(left,window.innerWidth-panel-8))+'px';input.focus();});
      bar.append(toggle);
    }
    bar.append(actions);
    placeToolbar(root,bar);
  }
  function placeToolbar(root,bar){
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
    const chatgptHeading=site.id==='chatgpt'?root.querySelector('[data-app-action-sidebar-section-heading="Recents"] [data-app-action-sidebar-section-toggle]'):null;
    // Claude may group recents by date. Prefer its first recent label, leaving the pinned header alone.
    const claudeHeading=site.id==='claude'?(headings.find(node=>!own(node))||root.querySelector('[data-row-key^="label:"] [data-group-toggle]')||root.querySelector('[data-group-toggle]')):null;
    const heading=chatgptHeading||claudeHeading||(site.id==='gemini'?root.querySelector('[aria-controls="sidenav-section-content-chats"]'):site.id==='kimi'?(root.querySelector('.next-sidebar-section:has(.next-sidebar-history-list) .next-sidebar-section__title')||headings.find(node=>!own(node))):site.id==='qwen'?(qwenHeader||headings.find(node=>!own(node))):headings.find(node=>!own(node)));
    if(heading&&site.id==='qwen'&&heading===qwenHeader){heading.classList.add('cs-heading-hover','cs-heading-row');const name=heading.querySelector('.folder-name');if(name)name.insertAdjacentElement('afterend',bar);else heading.append(bar);bar.classList.add('cs-at-heading');}
    else if(heading) { const host=heading.closest('button,a')||heading;host.classList.add('cs-heading-hover');if(site.id==='gemini')host.parentElement.classList.add('cs-gemini-heading');if(site.id==='kimi')host.parentElement.classList.add('cs-heading-row');if(chatgptHeading)host.parentElement.classList.add('cs-chatgpt-heading');if(site.id==='claude'&&host.matches('[data-group-toggle]'))host.parentElement.classList.add('cs-claude-heading');if(host.nextElementSibling!==bar)host.insertAdjacentElement('afterend',bar);bar.classList.add('cs-at-heading'); }
    else { const first=items().find(item=>root.contains(item.link));if(first){let container=first.link.closest('ol,ul');if(!container||!root.contains(container))container=first.link.parentElement;container.before(bar);}else root.prepend(bar); }
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
    const found=items();
    hideDeleted();
    for(const item of found) {
      // Put the checkbox inside the row link, using capture to prevent link navigation.
      let box=item.link.querySelector('.cs-checkbox');
      if(box&&box.dataset.csId!==item.id){box.remove();box=null;}
      if(!box){box=el('input','cs-checkbox');box.type='checkbox';box.dataset.csOwned='true';box.dataset.csId=item.id;
        box.addEventListener('click',event=>{event.stopPropagation();});
        box.addEventListener('change',()=>{if(busy)return;box.checked?selected.set(item.id,item.title):selected.delete(item.id);sync();});
        item.link.prepend(box);
      }
      item.link.classList.add('cs-chat-link');
      item.link.classList.toggle('cs-chatgpt-row',site.id==='chatgpt'&&!!item.link.closest(chatgptRow));
      const search=site.id==='grok'&&!!item.link.closest('[cmdk-list]');
      item.link.classList.toggle('cs-grok-search-link',search);
      if(search)item.link.closest('[cmdk-item]')?.classList.add('cs-grok-result');
      item.link.classList.toggle('cs-dynamic',!search&&settings.checkboxMode!=='always');
      box.setAttribute('aria-label',t('selectChat',{title:item.title}));
    }
    // One toolbar for each top-level visible sidebar; nested history containers do not duplicate it.
    const parents=roots().filter(root=>found.some(item=>root.contains(item.link)));
    for(const root of parents.filter(root=>!parents.some(other=>other!==root&&other.contains(root))))toolbar(root);
    grokHistory?.render();
    if(filterQuery.trim())applyFilter(filterQuery);
    sync();applyTheme();watch();queueWave();
  }
  function schedule(){if(expired||scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;scan();},80);}
  function watch(){if(expired)return;observer?.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href','hidden','aria-hidden','aria-expanded','class','data-sidebar-chatgpt-conversation-key','aria-label']});}
  function cleanup(){clearTimeout(filterTimer);filterQuery='';matches=[];document.querySelectorAll('.cs-match').forEach(n=>n.classList.remove('cs-match'));document.querySelectorAll('.cs-gemini-heading,.cs-heading-row,.cs-chatgpt-heading,.cs-claude-heading').forEach(n=>n.classList.remove('cs-gemini-heading','cs-heading-row','cs-chatgpt-heading','cs-claude-heading'));document.querySelectorAll('.cs-grok-result').forEach(n=>n.classList.remove('cs-grok-result'));document.querySelectorAll('.cs-grok-search-link').forEach(n=>n.classList.remove('cs-grok-search-link'));document.querySelectorAll('.cs-heading-hover').forEach(node=>node.classList.remove('cs-heading-hover'));document.querySelectorAll('[data-cs-owned]').forEach(node=>node.remove());document.querySelectorAll('.cs-chat-link').forEach(node=>{node.classList.remove('cs-chat-link','cs-chatgpt-row','cs-dynamic','cs-selected','cs-wave-active');node.style.removeProperty('--cs-wave');});}
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
  function hideDeleted() {
    const links=qwenRows?[...document.querySelectorAll(site.roots+' a.chat-item-drag-link')]:[...new Set([...document.querySelectorAll(rootSelector())].flatMap(rowNodes))];
    for(const link of links) {
      if(!deleted.has(rowId(link)))continue;
      let row=(site.id==='chatgpt'?link.closest(chatgptRow):null)||link.closest('.cs-grok-result')||(qwenRows?link.closest('.chat-item-drag'):null)||link;
      const parent=link.parentElement;
      if(row===link&&parent && !parent.matches('nav,aside,ul,ol,#history') && parent.querySelectorAll('a[href]').length===1 && !parent.querySelector('.cs-toolbar')) row=parent;
      row.classList.add('cs-deleted-row');
    }
  }
  let qwenUser=null;
  function refreshQwenUser(){if(site.id!=='qwen'||!globalThis.ChatTidyQwen)return;ChatTidyQwen.session().then(id=>{qwenUser=id;}).catch(()=>{qwenUser=null;});}
  function notice(text){const box=el('section','cs-status',text);box.dataset.csOwned='true';const close=el('button','cs-button',t('close'));close.onclick=()=>box.remove();box.append(close);document.body.append(box);}
  async function runBatch(snapshot,approvedOrganization,action='delete',target){
    if(!contextAlive()||busy)return;busy=true;stopped=false;sync();
    if(qwenRows){
      // Rows are mapped by structure, so confirm each approved ID still sits on a row with the reviewed title.
      const current=new Map(qwenRows.scan().map(row=>[row.id,row.title]));
      snapshot=snapshot.filter(item=>current.get(item.id)===item.title);
      if(!qwenUser){try{qwenUser=await ChatTidyQwen.session();}catch(error){qwenUser=null;busy=false;sync();notice(t('apiError')+' ('+error.message+')');return;}}
      if(!snapshot.length){busy=false;sync();notice(t('apiError')+' (rows-changed)');return;}
    }
    const allowed=new Set(snapshot.map(item=>item.id)), completed=new Set();
    // Moved ChatGPT and Qwen chats leave the main list; Claude keeps grouped chats in its recents.
    const hide=action!=='move'||site.id!=='claude';
    const status=el('section','cs-status');status.dataset.csOwned='true';status.setAttribute('aria-label',t('manage'));
    const message=el('p','',t('progress',{done:0,total:snapshot.length}));message.setAttribute('role','status');
    const hint=el('p','cs-hint',t(action==='archive'?'archiveWorking':action==='move'?'moveWorking':'working')),stop=el('button','cs-button',t('stop'));stop.type='button';
    stop.onclick=()=>{stopped=true;stop.disabled=true;ChatTidyBatch.cancel();};
    status.append(message,hint,stop);(site.id==='grok'?document.querySelector('[role="dialog"]:has([cmdk-list])')||document.body:document.body).append(status);
    const update=ids=>{
      if(!status.isConnected)document.body.append(status);
      const done=[];
      for(const id of ids||[])if(allowed.has(id)){completed.add(id);selected.delete(id);if(hide)deleted.add(id);done.push(id);}
      qwenRows?.forget(done);
      hideDeleted();message.textContent=t('progress',{done:completed.size,total:snapshot.length});sync();
    };
    let result;
    try {
      result=await ChatTidyBatch.run({action,target,ids:[...allowed],organizationId:approvedOrganization,expectedUserId:qwenRows?qwenUser:undefined,onProgress:update,
        canRun:()=>!expired&&contextAlive()&&organizationId()===approvedOrganization});
      update(result.completed);
    } catch { result={error:'connection-lost'}; }
    finally { busy=false; }
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
  let pointer=null,waveFrame=0;
  function paintWave(){
    waveFrame=0;
    const links=[...document.querySelectorAll('.cs-chat-link.cs-dynamic')];
    const rects=links.map(link=>link.getBoundingClientRect());
    const anchor=pointer && rects.find((r,i)=>visible(links[i]) && pointer.x>=r.left-8 && pointer.x<=r.left+56 && pointer.y>=r.top && pointer.y<=r.bottom);
    links.forEach((link,i)=>{
      const r=rects[i],distance=pointer?Math.abs(pointer.y-(r.top+r.height/2)):Infinity;
      const radius=Math.max(1,r.height)*3.2;
      const strength=anchor && Math.abs(r.left-anchor.left)<24 && distance<radius ? Math.pow(Math.cos(distance/radius*Math.PI/2),2) : 0;
      const next=strength.toFixed(3);
      if(link.style.getPropertyValue('--cs-wave')!==next)link.style.setProperty('--cs-wave',next);
      if(link.classList.contains('cs-wave-active')!==(strength>.08))link.classList.toggle('cs-wave-active',strength>.08);
    });
  }
  function queueWave(){if(!waveFrame){waveFrame=requestAnimationFrame(paintWave);}}
  document.addEventListener('pointermove',event=>{if(event.pointerType==='touch')return;pointer={x:event.clientX,y:event.clientY};queueWave();},{passive:true,capture:true});
  document.addEventListener('pointerleave',()=>{pointer=null;queueWave();});
  window.addEventListener('blur',()=>{pointer=null;queueWave();});
  document.addEventListener('scroll',()=>{queueWave();},true);
  document.addEventListener('click',event=>{if(event.target.closest?.('.cs-toolbar,.cs-confirm,.cs-move,.cs-archive-manager'))return;closeMenus();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){const open=document.querySelector('.cs-toggle[aria-expanded="true"]');closeMenus();open?.focus();} });
  // Prevent parent React link handlers, while preserving the checkbox's native toggle.
  document.addEventListener('click',event=>{if(event.target.matches?.('.cs-checkbox')){event.stopPropagation();const box=event.target;if(!busy){box.checked?selected.set(box.dataset.csId,items().find(item=>item.id===box.dataset.csId)?.title||''):selected.delete(box.dataset.csId);sync();}}},true);
  const botsController=site.id==='grok'&&globalThis.ChatTidyBots?ChatTidyBots.create():null;
  const grokHistory=site.id==='grok'&&globalThis.ChatTidyGrok?ChatTidyGrok.create({t,changed:schedule,error:code=>{const notice=el('section','cs-status',t('grokLoadError')+' ('+code+')');notice.dataset.csOwned='true';const close=el('button','cs-button',t('close'));close.onclick=()=>notice.remove();notice.append(close);document.body.append(notice);}}):null;
  const mover=globalThis.ChatTidyProjects?ChatTidyProjects.create({t,site,organizationId:()=>selectionOrganization,onRun:(snapshot,target)=>{
    if(!contextAlive())return;
    const approved=selectionOrganization;
    // A new destination may already exist at this point; say so instead of failing silently.
    if(busy){notice(t('apiError')+' (busy)');return;}
    if(!sameWorkspace()){sync();notice(t('apiError')+' (workspace-changed)');return;}
    void runBatch(snapshot,approved,'move',target);}}):null;
  function restoreRows(ids){for(const id of ids)deleted.delete(id);qwenRows?.unforget(ids);document.querySelectorAll('.cs-deleted-row').forEach(row=>{const link=row.matches('a,'+chatgptRow)?row:row.querySelector('a');const id=link&&rowId(link);if(id&&!deleted.has(id))row.classList.remove('cs-deleted-row');});schedule();}
  const managerOptions=()=>({t,site,canRun:()=>!expired&&settings.enabled,onCompleted:(ids,action)=>{if(action==='restore')restoreRows(ids);}});
  let archiveManager=hasManager&&globalThis.ChatTidyArchive?ChatTidyArchive.create(managerOptions()):null;
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{if(message?.type==='cs-site'&&sender.id===chrome.runtime.id){reply({site:site.id});}if(message?.type==='cs-open-archive'&&sender.id===chrome.runtime.id&&archiveManager){void archiveManager.open();reply({ok:true});}return false;});
  document.addEventListener('pointerdown',event=>{if(event.target.matches?.('.cs-checkbox'))event.stopPropagation();},true);
  document.addEventListener('keydown',event=>{if(event.target.matches?.('.cs-checkbox'))event.stopPropagation();},true);
  chrome.storage.local.get(settings).then(saved=>{
    settings={...settings,...saved};applyTheme();
    // Sites switch themes by toggling attributes on <html>/<body> or following the OS.
    new MutationObserver(applyTheme).observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme','data-mode','data-color-mode','theme']});
    if(document.body)new MutationObserver(applyTheme).observe(document.body,{attributes:true,attributeFilter:['class','style','data-theme','data-mode','data-color-mode','theme']});
    globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>setTimeout(applyTheme,50));
    observer=new MutationObserver(records=>{
      if(records.some(record=>{
        if(own(record.target) || (record.target.closest?.('main')&&!record.target.closest?.('[data-testid="modal-archived-conversations"]')&&!(scopedRoots&&record.target.closest?.(site.roots))))return false;
        if(record.type==='attributes'){
          if(record.attributeName!=='class')return true;
          // Ignore our wave/selection class updates; repair only missing row markers.
          const link=record.target,box=link.matches?.('a,[role="button"]')&&link.querySelector('.cs-checkbox');
          return box && (!link.classList.contains('cs-chat-link') ||
            link.classList.contains('cs-dynamic')!==(!link.classList.contains('cs-grok-search-link')&&settings.checkboxMode!=='always') ||
            link.classList.contains('cs-selected')!==selected.has(box.dataset.csId));
        }
        return [...record.addedNodes,...record.removedNodes].some(node=>!own(node));
      }))schedule();
    });if(settings.enabled)refreshQwenUser();scan();watch();void grokHistory?.setEnabled(settings.enabled&&settings.grokShowAll);
  }).catch(()=>{ /* Invalidated extension: refreshing the page re-injects it. */ });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local'||!['enabled','language','checkboxMode','grokShowAll','theme','grokHideBots','grokCollapseBots'].some(key=>changes[key]))return;
    for(const key of ['enabled','language','checkboxMode','grokShowAll','theme','grokHideBots','grokCollapseBots'])if(changes[key])settings[key]=changes[key].newValue;
    applyTheme();botsController?.update(settings);
    if(!['enabled','language','checkboxMode','grokShowAll'].some(key=>changes[key]))return;
    if(busy)return;
    archiveManager?.destroy();archiveManager=hasManager&&settings.enabled&&globalThis.ChatTidyArchive?ChatTidyArchive.create(managerOptions()):null;
    mover?.close();
    cleanup();void grokHistory?.setEnabled(settings.enabled&&settings.grokShowAll);if(!settings.enabled)selected.clear();else{refreshQwenUser();scan();}
  });
})();
