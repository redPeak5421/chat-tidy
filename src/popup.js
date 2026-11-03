(async () => {
  document.getElementById('extension-version').textContent=chrome.runtime?.getManifest?.().version || '';
  const api=ChatTidyI18n,core=ChatTidyCore,library=globalThis.ChatTidyLibrary||null;
  const defaults={...core.settings,language:api.browserLanguage()};
  // Every preference with a control on this page; the Safari build ships without the support toggle.
  const fields=Object.keys(defaults).filter(key=>document.getElementById(key));
  let settings={...defaults,...await chrome.storage.local.get(defaults)};
  // A stored value that is no longer offered (such as the old default 2) shows the default the deletion will use.
  if(!core.concurrencyOptions.includes(settings.concurrency))settings.concurrency=defaults.concurrency;
  if(!core.chatWidths.includes(settings.chatWidth))settings.chatWidth=defaults.chatWidth;
  // Reading tools and layout controls; the code sub-options only act while code tools are on.
  const reading=['outline','codeTools','codeLineNumbers','codeFold','codeDanger','chatWidth','compactSidebar','hideClutter','focusMode'],codeOptions=['codeLineNumbers','codeFold','codeDanger'];
  let site=null;
  function render(){
    document.documentElement.lang=settings.language;
    document.documentElement.dataset.theme=['light','dark'].includes(settings.theme)?settings.theme:'system';
    document.getElementById('theme').value=document.documentElement.dataset.theme;
    for(const key of ['grokHideBots','grokCollapseBots','hideSupport']){const field=document.getElementById(key);if(field)field.checked=!!settings[key];}
    const support=document.querySelector('.support-section');if(support)support.hidden=!!settings.hideSupport;
    const gear=document.getElementById('open-settings');gear.title=api.t(settings.language,'settings');gear.setAttribute('aria-label',gear.title);
    const repository=document.querySelector('.repository-link');
    repository.title=api.t(settings.language,'repository');
    repository.setAttribute('aria-label',repository.title);
    document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=api.t(settings.language,node.dataset.i18n));
    document.getElementById('enabled').checked=settings.enabled;document.getElementById('grokShowAll').checked=settings.grokShowAll;
    document.getElementById('language').value=settings.language;
    for(const key of ['checkboxMode','concurrency'])document.querySelectorAll('input[name="'+key+'"]').forEach(input=>input.checked=input.value===String(settings[key]));
    for(const key of reading){const field=document.getElementById(key);if(!field)continue;if(field.type==='checkbox')field.checked=!!settings[key];else field.value=settings[key];}
    // A disabled switch reads as off, so it never looks like it is working; the stored choice returns once it is usable again.
    for(const key of codeOptions){const field=document.getElementById(key);if(field){field.disabled=!settings.codeTools;field.checked=!!settings[key]&&settings.codeTools;}}
    document.getElementById('code-options')?.toggleAttribute('data-off',!settings.codeTools);
    // Settings are global; a site without the feature still shows the row, saying so in place of its hint.
    // Its control is disabled there too, so a switch cannot be turned on to no effect; only a lock set here is released here.
    document.querySelectorAll('[data-hint]').forEach(node=>{const row=node.closest('[data-feature]'),off=!!site&&!!row&&!core.supports(site,row.dataset.feature);row?.classList.toggle('unsupported',off);node.textContent=off?api.t(settings.language,'siteUnsupported'):node.dataset.hint?api.t(settings.language,node.dataset.hint):'';
      const control=row?.querySelector('input,select');if(!control)return;if(off){control.disabled=true;control.dataset.siteOff='';if(control.type==='checkbox')control.checked=false;}else if('siteOff' in control.dataset){control.disabled=false;delete control.dataset.siteOff;}});
    placeHelp();renderLibrary();
  }
  const help=document.getElementById('concurrency-help'),note=document.getElementById('concurrency-note');
  function placeHelp(){
    if(!help||!note)return;
    help.setAttribute('aria-label',note.textContent);
    let open=false;try{open=note.matches(':popover-open');}catch{open=false;}
    help.setAttribute('aria-expanded',open?'true':'false');
    if(!open)return;
    const anchor=(help.closest('.setting-item')||help).getBoundingClientRect(),width=Math.min(300,document.documentElement.clientWidth-24);
    note.style.width=width+'px';
    note.style.left=Math.max(12,Math.min(anchor.left,document.documentElement.clientWidth-width-12))+'px';
    note.style.top=(anchor.bottom+6)+'px';
  }
  note?.addEventListener('toggle',placeHelp);
  // Library page: quick find over bookmarked chats and answers, newest first.
  const $=id=>document.getElementById(id);
  const glyphs={chat:'<path d="M3 4.4c0-.9.7-1.6 1.6-1.6h6.8c.9 0 1.6.7 1.6 1.6v4.9c0 .9-.7 1.6-1.6 1.6H7.3l-2.9 2.3v-2.3h0A1.6 1.6 0 0 1 3 9.3Z"/>',answer:'<path d="M3.2 3v10M6.2 4.2h6.6M6.2 8h6.6M6.2 11.8h4.2"/>'};
  let items={},query='',type='all',tag='';
  function svg(name){const node=document.createElementNS('http://www.w3.org/2000/svg','svg');node.setAttribute('viewBox','0 0 16 16');node.setAttribute('aria-hidden','true');node.innerHTML=glyphs[name];return node;}
  function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  // Matches are wrapped in <mark> built from text nodes; saved titles never pass through innerHTML.
  function marked(tagName,className,text){
    const node=el(tagName,className),needle=query.trim().toLocaleLowerCase(),lower=String(text).toLocaleLowerCase();let at=0;
    if(needle)for(let i=lower.indexOf(needle);i>=0;i=lower.indexOf(needle,at)){node.append(text.slice(at,i),el('mark','',text.slice(i,i+needle.length)));at=i+needle.length;}
    node.append(text.slice(at));return node;
  }
  function when(time){
    const lang=settings.language,diff=Date.now()-time,minute=60000,hour=60*minute,day=24*hour;
    try{
      const relative=new Intl.RelativeTimeFormat(lang,{numeric:'auto',style:'short'});
      if(diff<minute)return relative.format(0,'second');if(diff<hour)return relative.format(-Math.floor(diff/minute),'minute');
      if(diff<day)return relative.format(-Math.floor(diff/hour),'hour');if(diff<7*day)return relative.format(-Math.floor(diff/day),'day');
      return new Intl.DateTimeFormat(lang,new Date(time).getFullYear()===new Date().getFullYear()?{month:'short',day:'numeric'}:{year:'numeric',month:'short',day:'numeric'}).format(time);
    }catch{return new Date(time).toLocaleDateString();}
  }
  function row(item){
    const t=key=>api.t(settings.language,key),li=el('li','library-item'),open=el('button','item-open'),body=el('span','item-body'),line=el('span','item-line'),date=el('time','item-date',when(item.updatedAt||item.savedAt));
    li.dataset.type=item.type;li.dataset.key=item.key;open.type='button';open.disabled=!item.url;
    date.dateTime=new Date(item.updatedAt||item.savedAt).toISOString();date.title=new Date(item.updatedAt||item.savedAt).toLocaleString(settings.language);
    const icon=el('span','item-icon');icon.append(svg(item.type));line.append(marked('span','item-title',item.title||t('archiveUntitled')),date);body.append(line);
    if(item.type==='answer'&&item.question)body.append(marked('span','item-question',item.question));
    if(item.note)body.append(marked('span','item-note',item.note));
    const meta=el('span','item-meta');meta.append(el('span','item-site',core.siteForUrl(item.url)?.name||item.site));for(const name of item.tags||[])meta.append(marked('span','item-tag',name));body.append(meta);
    open.append(icon,body);open.onclick=()=>openItem(item);
    const remove=el('button','item-remove');remove.type='button';remove.title=t('libraryRemove');remove.setAttribute('aria-label',t('libraryRemove')+': '+(item.title||t('archiveUntitled')));remove.onclick=()=>removeItem(item);
    li.append(open,remove);return li;
  }
  function renderLibrary(){
    const button=$('open-library');if(!button)return;button.hidden=!library;if(!library)return;
    const t=key=>api.t(settings.language,key),all=Object.values(items).length,tags=library.tagCounts(items);
    $('library-count').textContent=all||'';
    if(tag&&!tags.some(entry=>entry.tag.toLowerCase()===tag.toLowerCase()))tag='';
    const search=$('library-search');search.placeholder=t('librarySearch');search.setAttribute('aria-label',t('librarySearch'));
    const tagLabel=t('libraryTagFilter');$('library-tags').setAttribute('aria-label',tagLabel==='libraryTagFilter'?t('library'):tagLabel);
    for(const node of document.querySelectorAll('[data-count]'))node.textContent=library.search(items,query,{type:node.dataset.count,tag}).length;
    document.querySelectorAll('input[name="libraryType"]').forEach(input=>input.checked=input.value===type);
    // The busiest tags plus the active one; a long tail of rare tags stays reachable through the search field.
    const shown=tags.filter((entry,index)=>index<12||entry.tag.toLowerCase()===tag.toLowerCase());
    // Rows and chips are rebuilt on every change; focus follows the same row or chip into the new nodes.
    const active=document.activeElement,chipFocus=active?.matches?.('.tag-chip')?active.dataset.tag:null,rowFocus=active?.closest?.('.library-item')?.dataset.key,part=active?.className;
    $('library-tags').replaceChildren(...shown.map(entry=>{const chip=el('button','tag-chip'),on=entry.tag.toLowerCase()===tag.toLowerCase();chip.type='button';chip.dataset.tag=entry.tag;chip.setAttribute('aria-pressed',String(on));chip.append(el('span','',entry.tag),el('small','',entry.count));chip.onclick=()=>{tag=on?'':entry.tag;renderLibrary();};return chip;}));
    const list=library.search(items,query,{type,tag});
    $('library-list').replaceChildren(...list.map(row));
    if(chipFocus!=null)[...$('library-tags').children].find(chip=>chip.dataset.tag===chipFocus)?.focus();
    if(rowFocus)[...$('library-list').children].find(node=>node.dataset.key===rowFocus)?.querySelector('.'+part)?.focus();
    $('library-tools').hidden=$('library-tags').hidden=!all;
    const empty=$('library-empty');empty.hidden=!!list.length;empty.dataset.state=all?'no-match':'empty';empty.textContent=t(all?'libraryNoMatch':'libraryEmpty');
  }
  async function openItem(item){
    try{if(item.type==='answer')await library.requestJump(item);await chrome.tabs.create({url:item.url,active:true});}
    catch{$('saved').textContent=api.t(settings.language,'supportOpenError');}
  }
  async function removeItem(item){
    const rows=[...$('library-list').children],index=rows.findIndex(node=>node.dataset.key===item.key);
    try{items=await library.remove(item.key);}catch{return;}
    renderLibrary();
    // Keep the keyboard in the list: the next row, else the previous one, else the search field.
    const next=$('library-list').children[Math.min(index,$('library-list').children.length-1)];(next?.querySelector('.item-remove')||(Object.keys(items).length?$('library-search'):$('back-library'))).focus();
  }
  function show(page,focus){for(const id of ['main-page','settings-page','enhance-page','library-page'])$(id).hidden=id!==page;document.querySelector('.popup-shell').scrollTop=0;focus.focus();}
  // The gear works from every page: settings replaces whatever page is open, and back returns to that page.
  let beforeSettings='main-page';
  document.getElementById('open-settings').onclick=()=>{const open=['main-page','enhance-page','library-page'].find(id=>!$(id).hidden);if(open)beforeSettings=open;show('settings-page',$('back-settings'));};
  document.getElementById('back-settings').onclick=()=>show(beforeSettings,$('open-settings'));
  // Chat enhancements: one entry on the home page; the library opens from there and returns there.
  $('open-enhance').onclick=()=>show('enhance-page',$('back-enhance'));
  $('back-enhance').onclick=()=>show('main-page',$('open-enhance'));
  $('open-library').onclick=()=>show('library-page',Object.keys(items).length?$('library-search'):$('back-library'));
  $('back-library').onclick=()=>show('enhance-page',$('open-library'));
  $('library-search').addEventListener('input',event=>{query=event.target.value;renderLibrary();});
  $('library-search').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){const first=$('library-list').querySelector('.item-open:not(:disabled)');if(first){event.preventDefault();first.click();}}});
  document.querySelectorAll('input[name="libraryType"]').forEach(input=>input.addEventListener('change',()=>{type=input.value;renderLibrary();}));
  // Chrome caps the popup at 600px: bring the expanded guide into view instead of leaving it clipped below the fold.
  document.querySelectorAll('#main-page details').forEach(section=>section.addEventListener('toggle',()=>{if(section.open)section.scrollIntoView?.({block:'nearest'});}));
  if(library){try{items=await library.load();}catch{items={};}library.onChange(next=>{items=next;renderLibrary();});}
  render();
  document.getElementById('open-archive').onclick=async()=>{try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const result=await chrome.tabs.sendMessage(tab.id,{type:'cs-open-archive'});if(result?.ok)window.close();else document.getElementById('saved').textContent=api.t(settings.language,'refresh');}catch{document.getElementById('saved').textContent=api.t(settings.language,'refresh');}};
  document.querySelectorAll('[data-support]').forEach(link=>link.addEventListener('click',async event=>{
    if(!chrome.tabs?.create)return;
    event.preventDefault();
    if(link.dataset.opening)return;
    link.dataset.opening='true';
    try{
      const url=link.dataset.support==='kofi'?chrome.runtime.getURL('src/support.html'):link.href;
      await chrome.tabs.create({url,active:true});
    }catch{
      document.getElementById('saved').textContent=api.t(settings.language,'supportOpenError');
    }finally{delete link.dataset.opening;}
  }));
  // A tab opened before the extension was (re)loaded has no content script to answer; its URL still names the site.
  if(chrome.tabs){try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id){const result=await chrome.tabs.sendMessage(tab.id,{type:'cs-site'}).catch(()=>({site:core.siteForUrl(tab.url)?.id}));document.getElementById('open-archive').hidden=!core.supports(result?.site,'manager');document.getElementById('grok-options').hidden=result?.site!=='grok';document.getElementById('grok-bots-options').hidden=result?.site!=='grok';if(result?.site){site=result.site;render();}}}catch{}}
  for(const key of fields)document.getElementById(key).addEventListener('change',async event=>{
    const value=typeof defaults[key]==='boolean'?event.target.checked:typeof defaults[key]==='number'?Number(event.target.value):event.target.value;
    settings[key]=value;render();
    await chrome.storage.local.set({[key]:value});
    document.getElementById('saved').textContent=api.t(settings.language,'saved');
  });
})();
