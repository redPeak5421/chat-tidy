/* Grok's native paginated history, kept only for the lifetime of this page. */
globalThis.ChatTidyGrok={create({changed,error}){
  let enabled=false,controller=null,loaded=false;
  const chats=new Map();
  function restore(){
    document.querySelectorAll('[data-cs-extra]').forEach(n=>n.remove());
    document.querySelectorAll('.cs-grok-view-all').forEach(n=>n.classList.remove('cs-grok-view-all'));
  }
  function render(){
    if(!enabled)return;
    const sidebar=document.querySelector('[data-sidebar="sidebar"]');
    const first=[...sidebar?.querySelectorAll('a[href]')||[]].find(a=>ChatTidyCore.chatId(a.getAttribute('href'),'https://grok.com'));
    const list=first?.closest('ul');if(!list)return;
    const native=new Set([...sidebar.querySelectorAll('a[href]:not([data-cs-extra-link])')].map(a=>ChatTidyCore.chatId(a.getAttribute('href'),'https://grok.com')));
    for(const row of list.querySelectorAll('[data-cs-extra]'))if(native.has(row.dataset.csExtra))row.remove();
    const existing=new Set([...list.querySelectorAll('[data-cs-extra]')].map(n=>n.dataset.csExtra));
    for(const [id,title] of chats){
      if(native.has(id)||existing.has(id))continue;
      const row=document.createElement('li');row.dataset.csOwned='true';row.dataset.csExtra=id;
      const link=document.createElement('a');link.href='/c/'+id;link.dataset.csExtraLink='true';link.className='cs-grok-extra-link';link.title=title;
      const text=document.createElement('span');text.textContent=title;link.append(text);row.append(link);list.append(row);
    }
    if(loaded)for(const button of sidebar.querySelectorAll('button'))if(/^(查看全部|檢視全部|View all|See all|Tout afficher|すべて表示|Показать все)$/i.test(button.textContent.trim()))button.classList.add('cs-grok-view-all');
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
        for(const chat of body.conversations){const id=ChatTidyCore.chatId('/c/'+chat.conversationId,'https://grok.com');if(id&&typeof chat.title==='string')chats.set(id,chat.title);}
        token=body.nextPageToken||'';if(typeof token!=='string'||(token&&seen.has(token)))throw Error('invalid-pagination');if(token)seen.add(token);
        loaded=!token;render();changed();
        if(token)await new Promise(resolve=>setTimeout(resolve,300));
      }while(token&&!current.signal.aborted);
    }catch(err){if(!current.signal.aborted||current.signal.reason==='timeout')error(current.signal.reason==='timeout'?'timeout':err.message);}
    finally{if(controller===current)controller=null;}
  }
  return {setEnabled,render};
}};
