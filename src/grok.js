/* Grok's native paginated history, kept only for the lifetime of this page.
   The current sidebar (checked live 2026-11-13) renders each chat as a button. The conversation id
   sits on page internals the content script cannot see, so buttons are paired with
   /rest/app-chat/conversations in list order (titles must match; a repeated title is left unmapped).
   Older markup still uses /c/<id> anchors. */
function grokHistoryPeriod(value,now=new Date()){
  if(!value)return null;
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
  const day=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
  const days=Math.round((day(now)-day(date))/86400000);
  if(days<=0)return 'Today';if(days===1)return 'Yesterday';if(days<=7)return 'Week';
  return date.getFullYear()===now.getFullYear()?'Year':'Older';
}
globalThis.ChatTidyGrok={period:grokHistoryPeriod,create({changed,error,t=key=>key}){
  let enabled=false,controller=null,loaded=false,coverToken='',coverDone=false,coverBusy=null;
  const chats=new Map();
  // History order, shared by the id pairing and by "show all". A chat is appended once.
  const listed=[];
  let mapped=new WeakMap();
  const legacyViewAll=/^(查看全部|檢視全部|View all|See all|Tout afficher|すべて表示|Показать все)$/i;
  // "展开" replaced "View all": it loads another page into the chat section. The same control in Bots is left alone.
  const showMore=/^(查看全部|檢視全部|View all|See all|Tout afficher|すべて表示|Показать все|展开|展開|Show more|See more|Afficher plus|もっと表示|Показать ещё|Показать еще)$/i;
  function conversationFrom(node){
    const key=node&&Object.keys(node).find(name=>name.startsWith('__reactFiber$')||name.startsWith('__reactInternalInstance$'));
    if(!key)return null;
    let fiber=node[key];const seen=new Set();
    for(let i=0;fiber&&i<30;i++,fiber=fiber.return){
      if(seen.has(fiber))break;seen.add(fiber);
      const conversation=fiber.memoizedProps?.conversation;
      if(conversation&&typeof conversation.conversationId==='string')return conversation;
    }
    return null;
  }
  function titleOf(button){return (button.innerText||button.textContent||'').replace(/\s+/g,' ').trim();}
  const sectionLabels=/^(聊天|聊天记录|聊天記錄|Chats|Recents|Recent|Discussions|Vos discussions|チャット|Чаты)$/i;
  // Title buttons in the chat section, document order. The header, row menus and "show more" are not rows.
  function titleButtons(){
    const sidebar=document.querySelector('#app-sidebar,[data-sidebar="sidebar"]');if(!sidebar)return [];
    // data-reorder-item names each sidebar section (live 2026-11-13); the heading text is the fallback.
    const header=[...sidebar.querySelectorAll('button[aria-expanded]')].find(button=>sectionLabels.test(titleOf(button)));
    const section=sidebar.querySelector('[data-reorder-item="recent"]')||header?.parentElement?.parentElement;if(!section)return [];
    const list=[...section.querySelectorAll('div')].find(el=>[...el.children].some(child=>child.tagName==='BUTTON'&&showMore.test(titleOf(child))));
    if(!list)return [];
    return [...list.children].filter(el=>el.tagName==='DIV').map(row=>[...row.querySelectorAll('button')].find(button=>!button.getAttribute('aria-haspopup')&&!button.getAttribute('aria-expanded')&&titleOf(button)&&!showMore.test(titleOf(button)))).filter(Boolean);
  }
  // Pair a prefix of the visible rows with the history list. The first title mismatch stops the prefix,
  // and a title that occurs twice in that prefix is not paired: position alone would swap those two ids.
  function mapRows(){
    const buttons=titleButtons();const next=new WeakMap();
    let count=0;while(count<buttons.length&&count<listed.length&&titleOf(buttons[count])===listed[count].title)count++;
    const seen=new Map();for(let i=0;i<count;i++)seen.set(listed[i].title,(seen.get(listed[i].title)||0)+1);
    for(let i=0;i<count;i++)if(seen.get(listed[i].title)===1)next.set(buttons[i],listed[i].id);
    mapped=next;
  }
  function remember(chat){
    const id=ChatTidyCore.chatId('/c/'+chat.conversationId,'https://grok.com');
    if(!id||typeof chat.title!=='string')return;
    const title=chat.title.replace(/\s+/g,' ').trim();
    chats.set(id,{title,time:chat.modifyTime||chat.createTime});
    if(!listed.some(item=>item.id===id))listed.push({id,title});
  }
  // Title buttons only. The row menu shares the same conversation, and section headers have none.
  function idOf(node){
    if(!node||node.tagName!=='BUTTON'||node.closest('[data-cs-owned]'))return null;
    const label=node.getAttribute('aria-label')||'';
    if(node.getAttribute('aria-haspopup')||/操作$|actions$/i.test(label))return null;
    if(!titleOf(node))return null;
    const conversation=conversationFrom(node);
    const direct=conversation&&ChatTidyCore.chatId('/c/'+conversation.conversationId,'https://grok.com');
    return direct||mapped.get(node)||null;
  }
  // The chat list is the box whose children are the conversation rows plus the optional "show more" button.
  function listOf(button){
    const sidebar=button.closest('#app-sidebar,[data-sidebar="sidebar"]');
    let el=button.parentElement;
    while(el&&el!==sidebar){
      const rows=[...el.children].filter(child=>child.tagName==='DIV'&&child.querySelector('button'));
      const more=[...el.children].some(child=>child.tagName==='BUTTON');
      if(rows.some(row=>row.contains(button))&&(rows.length>=2||more))return el;
      el=el.parentElement;
    }
    return null;
  }
  function restore(){
    document.querySelectorAll('[data-cs-extra],.cs-grok-period,.cs-grok-open').forEach(n=>n.remove());
    document.querySelectorAll('.cs-grok-view-all').forEach(n=>n.classList.remove('cs-grok-view-all'));
  }
  function shell(node){const copy=document.createElement(node.tagName);copy.className=[...node.classList].filter(c=>!c.startsWith('cs-')).join(' ');if(node.dataset.sidebar)copy.dataset.sidebar=node.dataset.sidebar;return copy;}
  function openButton(sidebar,viewAll){
    const bar=sidebar.querySelector('.cs-toolbar:not(.cs-search-toolbar)');
    if(bar&&viewAll&&!bar.querySelector('.cs-grok-open')){
      const open=document.createElement('button');open.type='button';open.className='cs-button cs-grok-open';open.dataset.csOwned='true';open.title=t('grokOpenHistory');open.setAttribute('aria-label',open.title);
      const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
      const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','M14 4h6v6 M20 4l-9 9 M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5');icon.append(path);open.append(icon);
      open.onclick=event=>{event.preventDefault();event.stopPropagation();(sidebar.querySelector('.cs-grok-view-all')||viewAll).click();};bar.prepend(open);
    }
  }
  function groupRows(list,idOfRow){
    let previous=null;const keep=new Set();
    for(const row of [...list.children]){
      if(row.classList.contains('cs-grok-period')||row.hidden||row.style.display==='none')continue;
      const id=idOfRow(row);if(!id){previous=null;continue;}
      const group=grokHistoryPeriod(chats.get(id)?.time);if(!group){previous=null;continue;}
      if(group!==previous){
        let label=row.previousElementSibling;
        if(!label?.classList.contains('cs-grok-period')){label=document.createElement(list.tagName==='UL'||list.tagName==='OL'?'li':'div');label.className='cs-grok-period';label.dataset.csOwned='true';row.before(label);}
        const text=t('grokPeriod'+group);if(label.textContent!==text)label.textContent=text;
        keep.add(label);
      }
      previous=group;
    }
    for(const label of list.querySelectorAll('.cs-grok-period'))if(!keep.has(label))label.remove();
  }
  function renderLegacy(sidebar){
    const first=[...sidebar.querySelectorAll('a[href]:not([data-cs-extra-link])')].find(a=>ChatTidyCore.chatId(a.getAttribute('href'),'https://grok.com'));
    const list=first?.closest('ul');if(!list||!first.closest('li'))return;
    const native=new Set([...sidebar.querySelectorAll('a[href]:not([data-cs-extra-link])')].map(a=>ChatTidyCore.chatId(a.getAttribute('href'),'https://grok.com')));
    for(const row of list.querySelectorAll('[data-cs-extra]'))if(native.has(row.dataset.csExtra))row.remove();
    const existing=new Set([...list.querySelectorAll('[data-cs-extra]')].map(n=>n.dataset.csExtra));
    for(const [id,chat] of chats){
      const {title}=chat;
      if(native.has(id)||existing.has(id))continue;
      const nativeRow=first.closest('li');
      const row=shell(nativeRow);row.dataset.csOwned='true';row.dataset.csExtra=id;
      let parent=row;
      const ancestors=[];for(let node=first.parentElement;node!==nativeRow;node=node.parentElement)ancestors.unshift(node);
      for(const node of ancestors){const copy=shell(node);parent.append(copy);parent=copy;}
      const link=shell(first);link.href='/c/'+id;link.dataset.csExtraLink='true';link.classList.add('cs-grok-extra-link');link.title=title;
      const text=document.createElement('span');text.textContent=title;link.append(text);parent.append(link);list.append(row);
    }
    const viewAll=[...sidebar.querySelectorAll('button:not(.cs-grok-open)')].find(button=>legacyViewAll.test(button.textContent.trim()));
    if(loaded)viewAll?.classList.add('cs-grok-view-all');
    openButton(sidebar,viewAll);
    groupRows(list,row=>{const link=row.querySelector('a[href]');return link&&ChatTidyCore.chatId(link.getAttribute('href'),'https://grok.com');});
  }
  function renderCurrent(sidebar){
    const first=[...sidebar.querySelectorAll('button')].find(idOf);
    const list=first&&listOf(first);if(!list)return;
    const nativeRow=[...list.children].find(child=>child.tagName==='DIV'&&child.contains(first));if(!nativeRow)return;
    const native=new Set([...sidebar.querySelectorAll('button')].map(idOf));
    for(const row of list.querySelectorAll('[data-cs-extra]'))if(native.has(row.dataset.csExtra))row.remove();
    const existing=new Set([...list.querySelectorAll('[data-cs-extra]')].map(n=>n.dataset.csExtra));
    const more=[...list.children].find(child=>child.tagName==='BUTTON'&&showMore.test(child.textContent.trim()));
    for(const [id,chat] of chats){
      const {title}=chat;
      if(native.has(id)||existing.has(id))continue;
      const row=shell(nativeRow);row.dataset.csOwned='true';row.dataset.csExtra=id;
      let parent=row;
      const ancestors=[];for(let node=first.parentElement;node&&node!==nativeRow;node=node.parentElement)ancestors.unshift(node);
      for(const node of ancestors){const copy=shell(node);parent.append(copy);parent=copy;}
      const link=document.createElement('a');link.className=[...first.classList].filter(c=>!c.startsWith('cs-')).join(' ');
      link.href='/c/'+id;link.dataset.csExtraLink='true';link.classList.add('cs-grok-extra-link');link.title=title;
      const text=document.createElement('span');text.textContent=title;link.append(text);parent.append(link);
      if(more)more.before(row);else list.append(row);
    }
    if(loaded)more?.classList.add('cs-grok-view-all');
    openButton(sidebar,more);
    groupRows(list,row=>{
      const link=row.querySelector('a[href]');
      if(link)return ChatTidyCore.chatId(link.getAttribute('href'),'https://grok.com');
      const button=[...row.querySelectorAll('button')].find(idOf);
      return button?idOf(button):null;
    });
  }
  function render(){
    if(!enabled)return;
    mapRows();
    const sidebar=document.querySelector('#app-sidebar,[data-sidebar="sidebar"]');if(!sidebar)return;
    const nativeLink=[...sidebar.querySelectorAll('a[href]:not([data-cs-extra-link])')].find(a=>ChatTidyCore.chatId(a.getAttribute('href'),'https://grok.com'));
    if(nativeLink?.closest('ul'))renderLegacy(sidebar);else renderCurrent(sidebar);
  }
  async function setEnabled(value){
    if(!value){enabled=false;controller?.abort();controller=null;loaded=false;chats.clear();restore();return;}
    if(enabled){render();return;}enabled=true;
    const current=new AbortController();controller=current;
    let token='';const seen=new Set();
    try{
      do{
        const params=new URLSearchParams({pageSize:'100'});if(token)params.set('pageToken',token);
        let response;const timeout=setTimeout(()=>current.abort('timeout'),20000);
        try{response=await fetch('/rest/app-chat/conversations?'+params,{credentials:'same-origin',mode:'same-origin',redirect:'error',signal:current.signal});}finally{clearTimeout(timeout);}
        if(!response.ok)throw Error('http-'+response.status);
        const body=await response.json();if(!Array.isArray(body?.conversations))throw Error('unexpected-response');
        if(current.signal.aborted)return;
        for(const chat of body.conversations)remember(chat);
        token=body.nextPageToken||'';if(typeof token!=='string'||(token&&seen.has(token)))throw Error('invalid-pagination');if(token)seen.add(token);
        coverToken=token;coverDone=!token;
        loaded=!token;render();changed();
        if(token)await new Promise(resolve=>setTimeout(resolve,300));
      }while(token&&!current.signal.aborted);
    }catch(err){if(!current.signal.aborted||current.signal.reason==='timeout')error(current.signal.reason==='timeout'?'timeout':err.message);}
    finally{if(controller===current)controller=null;}
  }
  // Ids for the rows on screen. "Show all" has its own pager; this one stops once those rows are covered.
  async function cover(){
    if(coverBusy||coverDone||enabled)return;
    if(listed.length>=titleButtons().length)return;
    const current=new AbortController();coverBusy=current;
    try{
      const params=new URLSearchParams({pageSize:'100'});if(coverToken)params.set('pageToken',coverToken);
      let response;const timeout=setTimeout(()=>current.abort('timeout'),20000);
      try{response=await fetch('/rest/app-chat/conversations?'+params,{credentials:'same-origin',mode:'same-origin',redirect:'error',signal:current.signal});}finally{clearTimeout(timeout);}
      if(!response.ok)throw Error('http-'+response.status);
      const body=await response.json();if(!Array.isArray(body?.conversations))throw Error('unexpected-response');
      if(current.signal.aborted)return;
      for(const chat of body.conversations)remember(chat);
      const token=body.nextPageToken||'';if(typeof token!=='string'||(token&&token===coverToken))throw Error('invalid-pagination');
      coverToken=token;coverDone=!token;mapRows();changed();
    }catch{if(!current.signal.aborted)coverDone=true;}
    finally{if(coverBusy===current)coverBusy=null;}
  }
  function sync(full){
    mapRows();
    if(full||enabled||coverDone||coverBusy)return;
    if(listed.length>=titleButtons().length)return;
    void cover();
  }
  return {setEnabled,render,sync,idOf,listOf};
}};
