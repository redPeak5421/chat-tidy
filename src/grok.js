/* Grok's native paginated history, kept only for the lifetime of this page. */
function grokHistoryPeriod(value,now=new Date()){
  if(!value)return null;
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
  const day=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
  const days=Math.round((day(now)-day(date))/86400000);
  if(days<=0)return 'Today';if(days===1)return 'Yesterday';if(days<=7)return 'Week';
  return date.getFullYear()===now.getFullYear()?'Year':'Older';
}
globalThis.ChatTidyGrok={period:grokHistoryPeriod,create({changed,error,t=key=>key}){
  let enabled=false,controller=null,loaded=false;
  const chats=new Map();
  function restore(){
    document.querySelectorAll('[data-cs-extra],.cs-grok-period,.cs-grok-open').forEach(n=>n.remove());
    document.querySelectorAll('.cs-grok-view-all').forEach(n=>n.classList.remove('cs-grok-view-all'));
  }
  function render(){
    if(!enabled)return;
    const sidebar=document.querySelector('[data-sidebar="sidebar"]');
    const first=[...sidebar?.querySelectorAll('a[href]:not([data-cs-extra-link])')||[]].find(a=>ChatTidyCore.chatId(a.getAttribute('href'),'https://grok.com'));
    const list=first?.closest('ul');if(!list||!first.closest('li'))return;
    const native=new Set([...sidebar.querySelectorAll('a[href]:not([data-cs-extra-link])')].map(a=>ChatTidyCore.chatId(a.getAttribute('href'),'https://grok.com')));
    for(const row of list.querySelectorAll('[data-cs-extra]'))if(native.has(row.dataset.csExtra))row.remove();
    const existing=new Set([...list.querySelectorAll('[data-cs-extra]')].map(n=>n.dataset.csExtra));
    for(const [id,chat] of chats){
      const {title}=chat;
      if(native.has(id)||existing.has(id))continue;
      // Copy only presentation along the native row path, never its state or controls.
      const shell=node=>{const copy=document.createElement(node.tagName);copy.className=[...node.classList].filter(c=>!c.startsWith('cs-')).join(' ');if(node.dataset.sidebar)copy.dataset.sidebar=node.dataset.sidebar;return copy;};
      const nativeRow=first.closest('li');
      const row=shell(nativeRow);row.dataset.csOwned='true';row.dataset.csExtra=id;
      let parent=row;
      const ancestors=[];for(let node=first.parentElement;node!==nativeRow;node=node.parentElement)ancestors.unshift(node);
      for(const node of ancestors){const copy=shell(node);parent.append(copy);parent=copy;}
      const link=shell(first);link.href='/c/'+id;link.dataset.csExtraLink='true';link.classList.add('cs-grok-extra-link');link.title=title;
      const text=document.createElement('span');text.textContent=title;link.append(text);parent.append(link);list.append(row);
    }
    const viewAll=[...sidebar.querySelectorAll('button:not(.cs-grok-open)')].find(button=>/^(查看全部|檢視全部|View all|See all|Tout afficher|すべて表示|Показать все)$/i.test(button.textContent.trim()));
    if(loaded)viewAll?.classList.add('cs-grok-view-all');
    const bar=sidebar.querySelector('.cs-toolbar:not(.cs-search-toolbar)');
    if(bar&&viewAll&&!bar.querySelector('.cs-grok-open')){
      const open=document.createElement('button');open.type='button';open.className='cs-button cs-grok-open';open.dataset.csOwned='true';open.title=t('grokOpenHistory');open.setAttribute('aria-label',open.title);
      const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
      const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','M14 4h6v6 M20 4l-9 9 M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5');icon.append(path);open.append(icon);
      open.onclick=event=>{event.preventDefault();event.stopPropagation();(sidebar.querySelector('.cs-grok-view-all')||viewAll).click();};bar.prepend(open);
    }
    // Leave React-owned rows in place and insert only the group labels.
    let previous=null;const keep=new Set();
    for(const row of [...list.children]){
      if(row.classList.contains('cs-grok-period')||row.hidden||row.style.display==='none')continue;
      const link=row.querySelector('a[href]');if(!link)continue;
      const id=ChatTidyCore.chatId(link.getAttribute('href'),'https://grok.com');
      const group=grokHistoryPeriod(chats.get(id)?.time);if(!group){previous=null;continue;}
      if(group!==previous){
        let label=row.previousElementSibling;
        if(!label?.classList.contains('cs-grok-period')){label=document.createElement('li');label.className='cs-grok-period';label.dataset.csOwned='true';row.before(label);}
        const text=t('grokPeriod'+group);if(label.textContent!==text)label.textContent=text;
        keep.add(label);
      }
      previous=group;
    }
    for(const label of list.querySelectorAll('.cs-grok-period'))if(!keep.has(label))label.remove();
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
        for(const chat of body.conversations){const id=ChatTidyCore.chatId('/c/'+chat.conversationId,'https://grok.com');if(id&&typeof chat.title==='string')chats.set(id,{title:chat.title,time:chat.modifyTime||chat.createTime});}
        token=body.nextPageToken||'';if(typeof token!=='string'||(token&&seen.has(token)))throw Error('invalid-pagination');if(token)seen.add(token);
        loaded=!token;render();changed();
        if(token)await new Promise(resolve=>setTimeout(resolve,300));
      }while(token&&!current.signal.aborted);
    }catch(err){if(!current.signal.aborted||current.signal.reason==='timeout')error(current.signal.reason==='timeout'?'timeout':err.message);}
    finally{if(controller===current)controller=null;}
  }
  return {setEnabled,render};
}};
