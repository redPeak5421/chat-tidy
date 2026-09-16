/* Archived-chat management for ChatGPT and Qwen. Data and credentials remain in page memory. */
globalThis.ChatTidyArchive = (() => {
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  async function request(path,token){
    const response=await fetch(path,{credentials:'same-origin',mode:'same-origin',redirect:'error',headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error(response.status===429?'rate-limit':response.status===401?'login':'http-'+response.status);
    return response.json();
  }
  const adapters={
    chatgpt:{
      origin:'https://chatgpt.com',nativeSelector:'[data-testid="modal-archived-conversations"]',nativeUrl:'/#settings/DataControls/ArchivedChats',link:id=>'/c/'+id,
      valid:id=>!!ChatTidyCore.chatId('/c/'+id,'https://chatgpt.com'),
      async session(){const s=await request('/api/auth/session');if(!s?.accessToken||!s.user?.id)throw Error('login');return {token:s.accessToken,account:s.user.id};},
      async page(offset,token){
        const data=await request('/backend-api/conversations?offset='+offset+'&limit=30&order=updated&is_archived=true',token);
        if(!Array.isArray(data.items)||!Number.isFinite(data.total)||!Number.isFinite(data.offset)||!Number.isFinite(data.limit)||data.limit<1)throw Error('unexpected-response');
        return {items:data.items.map(item=>({id:item.id,title:item.title})),offset:data.offset+data.limit,total:data.total};
      }
    },
    qwen:{
      // The website returns the whole archived list at once and toggles the flag per chat.
      origin:'https://chat.qwen.ai',nativeSelector:null,nativeUrl:null,link:id=>'/c/'+id,
      valid:id=>UUID.test(id),
      async session(){return {token:null,account:await ChatTidyQwen.session()};},
      async page(){const items=await ChatTidyQwen.api.archived();return {items:items.map(item=>({id:item.id,title:item.title})),offset:items.length,total:items.length};}
    }
  };
  function create({t,site='chatgpt',canRun=()=>true,onCompleted=()=>{}}){
    const adapter=adapters[typeof site==='string'?site:site.id];
    if(!adapter)return null;
    const nativeSelector=adapter.nativeSelector;
    let dialog=null,loading=false,busy=false,alive=true,epoch=0,offset=0,total=0,account=null,nativeRoot=null,identityReady=null;
    const entries=new Map(),selection=new Map(),removed=new Set();
    const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
    const own=n=>{n.dataset.csOwned='true';return n;};
    const valid=()=>alive&&canRun()&&location.origin===adapter.origin;
    async function session(){
      const generation=epoch;const s=await adapter.session();
      if(!valid()||generation!==epoch)throw Error('context-changed');
      if(account&&account!==s.account){entries.clear();selection.clear();removed.clear();throw Error('account-changed');}
      account=s.account;return s.token;
    }
    function nativeRoots(){return nativeSelector?[...document.querySelectorAll(nativeSelector)]:[];}
    function roots(){return [dialog,...nativeRoots()].filter(Boolean);}
    function status(text){for(const root of roots()){const n=root.querySelector('.cs-archive-status');if(n)n.textContent=text;}}
    function sync(){for(const root of roots()){
      root.querySelectorAll('.cs-archive-checkbox').forEach(box=>{box.checked=selection.has(box.dataset.id);box.disabled=busy;});
      root.querySelectorAll('[data-archive-action]').forEach(b=>b.disabled=busy||(['delete','restore','clear'].includes(b.dataset.archiveAction)&&!selection.size));
      const count=root.querySelector('.cs-archive-count');if(count)count.textContent=t('selected',{n:selection.size});
      const more=root.querySelector('.cs-archive-more');if(more){more.hidden=offset>=total;more.disabled=loading||busy;}
      const stop=root.querySelector('.cs-archive-stop');if(stop)stop.hidden=!busy;
    }}
    function checkbox(id,title){const box=own(el('input','cs-archive-checkbox'));box.type='checkbox';box.dataset.id=id;box.setAttribute('aria-label',t('selectChat',{title}));box.onclick=e=>e.stopPropagation();box.onchange=()=>{if(busy)return;box.checked?selection.set(id,title):selection.delete(id);sync();};return box;}
    function controls(root){
      const bar=own(el('section','cs-archive-tools'));bar.setAttribute('aria-label',t('archiveManager'));
      bar.append(el('span','cs-archive-count'));
      for(const action of ['all','clear','restore','delete']){const b=el('button','cs-button',t(action));b.type='button';b.dataset.archiveAction=action;b.onclick=()=>{
        if(!valid()||busy)return;
        if(action==='all'){root.querySelectorAll('tr:not(.cs-archive-removed) .cs-archive-checkbox').forEach(box=>selection.set(box.dataset.id,entries.get(box.dataset.id)?.title||box.closest('tr')?.querySelector('a')?.textContent||''));sync();}
        else if(action==='clear'){selection.clear();sync();}
        else if(action==='delete')confirmDelete(root);
        else void run('restore');
      };bar.append(b);}
      const stop=el('button','cs-button cs-archive-stop',t('stop'));stop.hidden=true;stop.onclick=()=>ChatTidyBatch.cancel();bar.append(stop);
      bar.append(el('p','cs-archive-status'));return bar;
    }
    function confirmDelete(root){
      if(!selection.size||root.querySelector('.cs-archive-confirm'))return;
      const snapshot=[...selection];const confirm=own(el('dialog','cs-confirm cs-archive-confirm'));
      confirm.append(el('h2','',t('confirmTitle')),el('p','',t('warning',{n:snapshot.length,site:typeof site==='string'?'ChatGPT':site.name})));
      const list=el('ul','cs-review');snapshot.forEach(([,title])=>list.append(el('li','',title)));confirm.append(list);
      const cancel=el('button','cs-button',t('cancel')),yes=el('button','cs-button cs-danger',t('confirm',{n:snapshot.length}));
      cancel.dataset.archiveCancel='true';yes.dataset.archiveConfirm='true';const close=()=>{confirm.close();confirm.remove();};cancel.onclick=close;confirm.oncancel=e=>{e.preventDefault();close();};yes.onclick=()=>{close();void run('delete',snapshot);};confirm.append(cancel,yes);root.append(confirm);confirm.showModal();cancel.focus();
    }
    async function run(action,snapshot=[...selection]){
      if(!valid()||busy||!snapshot.length)return;
      busy=true;sync();const generation=epoch;
      try{
        if(identityReady)await identityReady;await session();if(!valid()||generation!==epoch)return;
        const allowed=new Set(snapshot.map(([id])=>id));
        const update=ids=>{if(!valid()||generation!==epoch)return;for(const id of ids||[])if(allowed.has(id)){removed.add(id);entries.delete(id);selection.delete(id);for(const root of roots())root.querySelectorAll('.cs-archive-checkbox').forEach(box=>{if(box.dataset.id===id){const row=box.closest('tr');if(nativeSelector&&row?.closest(nativeSelector))row.classList.add('cs-archive-removed');else row?.remove();}});}status(t('progress',{done:ids.length,total:snapshot.length}));sync();};
        const result=await ChatTidyBatch.run({ids:[...allowed],action,expectedUserId:account,canRun:()=>valid()&&generation===epoch,onProgress:update});
        if(!valid()||generation!==epoch)return;
        update(result.completed||[]);onCompleted(result.completed||[],action);
        status(result.error?t('apiError')+' ('+result.error+')':t(result.cancelled?'stopped':'done',{n:result.completed?.length||0}));
        // Restart server pagination after removals, retaining unfinished rows and the result message.
        if(dialog&&result.completed?.length){offset=0;total=0;}
      }catch(error){if(valid()&&generation===epoch)status(t('apiError')+' ('+error.message+')');}
      finally{busy=false;sync();if(dialog&&offset===0)await load({preserveStatus:generation===epoch});}
    }
    async function load({preserveStatus=false}={}){
      if(!valid()||loading||busy||!dialog)return;loading=true;sync();const generation=epoch;
      try{
        const token=await session();if(!valid()||generation!==epoch)return;
        const data=await adapter.page(offset,token);
        if(!valid()||generation!==epoch)return;
        for(const item of data.items){if(typeof item.id!=='string'||removed.has(item.id)||!adapter.valid(item.id))continue;entries.set(item.id,{id:item.id,title:item.title||t('archiveUntitled')});}
        offset=data.offset;total=data.total;render();if(!preserveStatus)status(entries.size?'':t('archiveEmpty'));
      }catch(error){if(valid()&&generation===epoch)status(t('apiError')+' ('+error.message+')');}
      finally{if(generation===epoch){loading=false;sync();}}
    }
    function render(){if(!dialog)return;const body=dialog.querySelector('tbody');body.replaceChildren();for(const item of entries.values()){
      const row=el('tr'),cell=el('td'),link=el('a','',item.title);link.href=adapter.link(item.id);link.target='_blank';link.rel='noopener';cell.append(checkbox(item.id,item.title),link);row.append(cell);body.append(row);
    }sync();}
    async function open(){
      if(!valid())return;if(dialog){dialog.focus();return;}removed.clear();
      dialog=own(el('dialog','cs-confirm cs-archive-manager'));dialog.setAttribute('aria-label',t('archiveManager'));
      const heading=el('h2','',t('archiveManager')),close=el('button','cs-button cs-archive-close','×');close.setAttribute('aria-label',t('close'));close.title=t('close');
      const dismiss=()=>{if(busy)ChatTidyBatch.cancel();epoch++;dialog?.remove();dialog=null;entries.clear();selection.clear();offset=total=0;loading=false;account=null;};
      close.onclick=dismiss;dialog.oncancel=e=>{e.preventDefault();dismiss();};const header=el('header','cs-archive-header');header.append(heading,close);dialog.append(header,controls(dialog));
      const table=el('table');table.append(el('tbody'));dialog.append(table);
      const more=el('button','cs-button cs-archive-more',t('loadMore'));more.onclick=load;
      const footer=el('footer','cs-archive-footer');footer.append(more);
      if(adapter.nativeUrl){const native=el('a','cs-button',t('archiveNative'));native.href=adapter.nativeUrl;native.onclick=e=>{e.preventDefault();dismiss();location.replace(native.href);location.reload();};footer.append(native);}
      dialog.append(footer);document.body.append(dialog);dialog.showModal();await load();
    }
    function nativeClose(event){if(!nativeSelector||!valid()||!location.hash.startsWith('#settings/DataControls/ArchivedChats'))return;const root=document.querySelector(nativeSelector);if(!root)return;const button=event.target.closest?.('button');const closing=event.type==='keydown'?event.key==='Escape'&&!dialog:button&&root.contains(button)&&!button.closest('table,[data-cs-owned]')&&(button.querySelector('svg')&&!button.textContent.trim()||/^(close|关闭|關閉|fermer|閉じる|закрыть)$/i.test(button.getAttribute('aria-label')||button.textContent.trim()));if(!closing)return;event.preventDefault();event.stopImmediatePropagation();location.replace('/#settings/DataControls');location.reload();}
    if(nativeSelector){document.addEventListener('click',nativeClose,true);document.addEventListener('keydown',nativeClose,true);}
    function scan(){if(!nativeSelector||!valid())return;
      const current=document.querySelector(nativeSelector);
      if(current!==nativeRoot){
        if(nativeRoot&&!dialog){epoch++;selection.clear();account=null;identityReady=null;ChatTidyBatch.cancel();}
        nativeRoot=current;if(current)removed.clear();
        if(current&&!dialog){identityReady=session();identityReady.catch(()=>{});}
      }
      for(const root of nativeRoots()){
      const table=root.querySelector('table');if(table&&!root.querySelector('.cs-archive-tools'))table.before(controls(root));
      for(const link of root.querySelectorAll('tbody a[href]')){const id=ChatTidyCore.chatId(link.getAttribute('href'),adapter.origin),row=link.closest('tr');if(!id||!row)continue;
        row.classList.toggle('cs-archive-removed',removed.has(id));if(!row.querySelector('.cs-archive-checkbox'))link.before(checkbox(id,link.textContent.trim()));
      }
    }sync();}
    function destroy(){if(nativeSelector){document.removeEventListener('click',nativeClose,true);document.removeEventListener('keydown',nativeClose,true);}alive=false;epoch++;ChatTidyBatch.cancel();dialog?.remove();dialog=null;document.querySelectorAll('.cs-archive-tools,.cs-archive-checkbox,.cs-archive-confirm').forEach(n=>n.remove());document.querySelectorAll('.cs-archive-removed').forEach(n=>n.classList.remove('cs-archive-removed'));entries.clear();selection.clear();removed.clear();account=null;}
    return {open,scan,destroy};
  }
  return {create,adapters};
})();
