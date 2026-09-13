(() => {
  'use strict';
  if (globalThis.__chatTidyInstalled) return;
  globalThis.__chatTidyInstalled = true;
  const core = ChatTidyCore, i18n = ChatTidyI18n;
  const site=core.siteForUrl(location.href);
  if(!site)return;
  let settings = {enabled:true,grokShowAll:false,checkboxMode:'dynamic',language:i18n.browserLanguage()};
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
  function visible(node) { return node?.isConnected && !node.closest('[hidden],[aria-hidden="true"],.cs-deleted-row') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'; }
  const searchSelector='[role="dialog"] [cmdk-list]';
  function rootSelector(){return site.id==='grok'?site.roots+','+searchSelector:site.roots;}
  function roots() { return [...document.querySelectorAll(rootSelector())].filter(node=>visible(node)&&!node.closest('main')); }
  function items() {
    const result=[],seen=new Set();
    for(const root of roots()) for(const link of root.querySelectorAll('a[href]')) {
      if(seen.has(link)||!visible(link))continue;
      seen.add(link);const id=core.chatId(link.getAttribute('href'),site.origin);if(!id)continue;
      const clone=link.cloneNode(true);clone.querySelectorAll('[data-cs-owned],button').forEach(n=>n.remove());
      const title=(link.getAttribute('aria-label')||clone.textContent||link.getAttribute('title')||'').trim();
      if(title)result.push({id,title,link,root});
    }
    return result;
  }
  function contextAlive(){
    if(expired)return false;
    try{if(chrome.runtime.id)return true;}catch{}
    expired=true;observer?.disconnect();selected.clear();settings.enabled=false;
    void grokHistory?.setEnabled(false);cleanup();
    const notice=el('section','cs-status cs-context-expired',t('refresh'));notice.dataset.csOwned='true';
    const close=el('button','cs-button',t('close'));close.onclick=()=>notice.remove();notice.append(close);document.body.append(notice);
    return false;
  }
  function sync() {
    const count=t('selected',{n:selected.size});
    document.querySelectorAll('.cs-toolbar').forEach(bar=>bar.classList.toggle('cs-has-selection',selected.size>0));
    document.querySelectorAll('.cs-count').forEach(node=>{if(node.textContent!==count)node.textContent=count;});
    document.querySelectorAll('.cs-checkbox').forEach(box=>{box.checked=selected.has(box.dataset.csId);box.disabled=busy;box.closest('a')?.classList.toggle('cs-selected',box.checked);});
    document.querySelectorAll('[data-cs-action]').forEach(button=>{button.disabled=busy || (button.dataset.csAction==='archive'&&site.id==='claude'&&[...selected.keys()].some(id=>!core.isCoworkId(id))) || ((button.dataset.csAction==='clear'||button.dataset.csAction==='delete'||button.dataset.csAction==='archive')&&!selected.size);});
  }
  function button(key,action) { const b=el('button','cs-button',t(key));b.type='button';b.dataset.csAction=action;b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();act(action);});return b; }
  function act(action) {
    if(!contextAlive()||busy)return;
    sameWorkspace();
    document.querySelectorAll('.cs-actions').forEach(n=>n.hidden=true);
    document.querySelectorAll('.cs-toggle').forEach(n=>n.setAttribute('aria-expanded','false'));
    if(action==='archive'&&site.id==='claude'&&[...selected.keys()].some(id=>!core.isCoworkId(id)))return;
    if(action==='delete'||(action==='archive'&&(site.id==='chatgpt'||site.id==='claude')))return confirmDelete(action);
    core.select(selected,items(),action);sync();
  }
  function toolbar(root) {
    if(root.querySelector('.cs-toolbar')||root.previousElementSibling?.classList.contains('cs-search-toolbar'))return;
    if(site.id==='grok'&&root.matches('[cmdk-list]')){
      const bar=el('div','cs-toolbar cs-search-toolbar');bar.dataset.csOwned='true';bar.setAttribute('role','group');bar.setAttribute('aria-label',t('manage'));
      bar.append(el('span','cs-count'));for(const key of ['clear','invert','all','delete'])bar.append(button(key,key));root.before(bar);return;
    }
    const bar=el('div','cs-toolbar');bar.dataset.csOwned='true';
    bar.setAttribute('role','group');bar.setAttribute('aria-label',t('manage'));
    const count=el('span','cs-count');count.setAttribute('aria-live','polite');
    const actions=el('div','cs-actions');actions.append(count);
    for(const key of ['clear','invert','all',...(site.id!=='grok'?['archive']:[]),'delete']){const control=button(key,key);if(key==='archive'&&site.id==='claude')control.title=t('coworkArchiveOnly');actions.append(control);}
    {
      actions.hidden=true;const toggle=el('button','cs-button cs-toggle');
      const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
      icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d','M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-6 4V5a1 1 0 0 1 1-1Z M7 9l1.5 1.5L11 8 M13 9h4 M7 13h10');
      icon.append(path);toggle.append(icon);toggle.type='button';toggle.title=t('manage');toggle.setAttribute('aria-label',t('manage'));toggle.setAttribute('aria-expanded','false');
      toggle.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();actions.hidden=!actions.hidden;toggle.setAttribute('aria-expanded',String(!actions.hidden));if(!actions.hidden){const rect=toggle.getBoundingClientRect();actions.style.top=Math.min(rect.bottom+6,window.innerHeight-220)+'px';actions.style.left=Math.max(8,Math.min(rect.right-220,window.innerWidth-240))+'px';actions.querySelector('button:not(:disabled)')?.focus();}});
      bar.append(toggle);
    }
    bar.append(actions);
    const headings=[...root.querySelectorAll('h2,h3,[role="heading"],button')].filter(node=> /^(聊天|聊天記錄|聊天记录|Chats|Chats and tasks|Recents|Your chats|Discussions|Vos discussions|チャット|チャット履歴|Чаты|Ваши чаты)$/i.test((node.querySelector('[data-group-name]')?.textContent||node.textContent).trim()));
    const heading=headings.find(node=>!own(node));
    if(heading) { const host=heading.closest('button,a')||heading;host.classList.add('cs-heading-hover');host.insertAdjacentElement('afterend',bar);bar.classList.add('cs-at-heading'); }
    else { const first=items().find(item=>root.contains(item.link));if(first){let container=first.link.closest('ol,ul');if(!container||!root.contains(container))container=first.link.parentElement;container.before(bar);}else root.prepend(bar); }
  }
  function scan() {
    if(!contextAlive()||!settings.enabled||busy)return;
    observer?.disconnect();
    sameWorkspace();
    grokHistory?.render();
    hideDeleted();
    const found=items();
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
      const search=site.id==='grok'&&!!item.link.closest('[cmdk-list]');
      item.link.classList.toggle('cs-grok-search-link',search);
      if(search)item.link.closest('[cmdk-item]')?.classList.add('cs-grok-result');
      item.link.classList.toggle('cs-dynamic',!search&&settings.checkboxMode!=='always');
      box.setAttribute('aria-label',t('selectChat',{title:item.title}));
    }
    // One toolbar for each top-level visible sidebar; nested history containers do not duplicate it.
    const parents=roots().filter(root=>found.some(item=>root.contains(item.link)));
    for(const root of parents.filter(root=>!parents.some(other=>other!==root&&other.contains(root))))toolbar(root);
    sync();watch();queueWave();
  }
  function schedule(){if(expired||scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;scan();},80);}
  function watch(){if(expired)return;observer?.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href','hidden','aria-hidden','class']});}
  function cleanup(){document.querySelectorAll('.cs-grok-result').forEach(n=>n.classList.remove('cs-grok-result'));document.querySelectorAll('.cs-grok-search-link').forEach(n=>n.classList.remove('cs-grok-search-link'));document.querySelectorAll('.cs-heading-hover').forEach(node=>node.classList.remove('cs-heading-hover'));document.querySelectorAll('[data-cs-owned]').forEach(node=>node.remove());document.querySelectorAll('.cs-chat-link').forEach(node=>{node.classList.remove('cs-chat-link','cs-dynamic','cs-selected','cs-wave-active');node.style.removeProperty('--cs-wave');});}
  function confirmDelete(action='delete'){
    if(!contextAlive())return;
    if(!selected.size||document.querySelector('.cs-confirm'))return;
    if(!sameWorkspace()){sync();return;}
    const approvedOrganization=selectionOrganization;
    const snapshot=[...selected].map(([id,title])=>({id,title}));
    const dialog=el('dialog','cs-confirm');dialog.dataset.csOwned='true';
    const title=el('h2','',t(action==='archive'?'archiveTitle':'confirmTitle'));title.id='cs-confirm-title';dialog.setAttribute('aria-labelledby',title.id);
    dialog.append(title,el('p','',t(action==='archive'?(site.id==='claude'?'coworkArchiveWarning':'archiveWarning'):'warning',{n:snapshot.length,site:site.name})));
    const list=el('ul','cs-review');for(const item of snapshot)list.append(el('li','',item.title));dialog.append(list);
    const footer=el('div','cs-footer'),cancel=el('button','cs-button',t('cancel')),confirm=el('button','cs-button cs-danger',t(action==='archive'?'archiveConfirm':'confirm',{n:snapshot.length}));
    cancel.dataset.csCancel='true';confirm.dataset.csConfirm='true';cancel.type=confirm.type='button';
    const opener=document.activeElement;const close=()=>{dialog.close();dialog.remove();opener?.focus();};
    cancel.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    confirm.onclick=()=>{close();if(!sameWorkspace()){sync();return;}void deleteBatch(snapshot,approvedOrganization,action);};footer.append(cancel,confirm);dialog.append(footer);(site.id==='grok'?document.querySelector('[role="dialog"]:has([cmdk-list])')||document.body:document.body).append(dialog);dialog.showModal();cancel.focus();
  }
  const deleted = new Set();
  function hideDeleted() {
    for(const link of document.querySelectorAll(rootSelector().split(',').map(root=>root+' a[href]').join(','))) {
      if(!deleted.has(core.chatId(link.getAttribute('href'),site.origin)))continue;
      let row=link.closest('.cs-grok-result')||link;
      const parent=link.parentElement;
      if(row===link&&parent && !parent.matches('nav,aside,ul,ol,#history') && parent.querySelectorAll('a[href]').length===1 && !parent.querySelector('.cs-toolbar')) row=parent;
      row.classList.add('cs-deleted-row');
    }
  }
  async function deleteBatch(snapshot,approvedOrganization,action='delete'){
    if(!contextAlive()||busy)return;busy=true;stopped=false;sync();
    const jobId=crypto.randomUUID(), allowed=new Set(snapshot.map(item=>item.id)), completed=new Set();
    const status=el('section','cs-status');status.dataset.csOwned='true';status.setAttribute('aria-label',t('manage'));
    const message=el('p','',t('progress',{done:0,total:snapshot.length}));message.setAttribute('role','status');
    const hint=el('p','cs-hint',t(action==='archive'?'archiveWorking':'working')),stop=el('button','cs-button',t('stop'));stop.type='button';
    stop.onclick=()=>{stopped=true;stop.disabled=true;try{void chrome.runtime.sendMessage({type:'cs-cancel',jobId}).catch(()=>{contextAlive();});}catch{contextAlive();}};
    status.append(message,hint,stop);(site.id==='grok'?document.querySelector('[role="dialog"]:has([cmdk-list])')||document.body:document.body).append(status);
    const update=ids=>{
      if(!status.isConnected)document.body.append(status);
      for(const id of ids||[])if(allowed.has(id)){completed.add(id);deleted.add(id);selected.delete(id);}
      hideDeleted();message.textContent=t('progress',{done:completed.size,total:snapshot.length});sync();
    };
    const submitted=new Set();
    const progress=(event,sender,reply)=>{
      if(sender?.id!==chrome.runtime.id||event.jobId!==jobId)return false;
      if(event.type==='cs-progress'){update(event.completed);return false;}
      if(event.type!=='cs-claude-delete'||site.id!=='claude')return false;
      if(!Array.isArray(event.ids)){reply({error:'invalid-request'});return false;}
      const requestAction=event.action||'delete';
      const task=Array.isArray(event.ids)&&event.ids.length===1&&core.isCoworkId(event.ids[0]);
      if(requestAction!==action||(action==='archive'&&!task)||(!task&&event.ids?.some(id=>core.isCoworkId(id)))||stopped||organizationId()!==approvedOrganization||event.organizationId!==approvedOrganization||
        !Array.isArray(event.ids)||!event.ids.length||event.ids.length>20||new Set(event.ids).size!==event.ids.length||
        event.ids.some(id=>!allowed.has(id)||submitted.has(id))){reply({error:'invalid-request'});return false;}
      event.ids.forEach(id=>submitted.add(id));
      // Same-origin content-script fetch uses the website session; never copy cookies or spoof headers.
      void (async()=>{
        try{
          const path=task?'/v1/code/sessions/'+event.ids[0]+(action==='archive'?'/archive':''):'/api/organizations/'+approvedOrganization+'/chat_conversations/delete_many';
          const headers={'Content-Type':'application/json',...(task?{'anthropic-version':'2023-06-01','anthropic-beta':'ccr-byoc-2025-07-29','anthropic-client-feature':'ccr','x-organization-uuid':approvedOrganization}:{})};
          const response=await fetch(path,{
            method:task&&action==='delete'?'DELETE':'POST',credentials:'same-origin',mode:'same-origin',redirect:'error',
            headers,body:JSON.stringify(task?{}:{conversation_uuids:event.ids}),
            signal:AbortSignal.timeout(20000)
          });
          const body=response.ok?(task?{deleted:event.ids,failed:[]}:await response.json()):null;
          reply({status:response.status,retryAfter:response.headers.get('Retry-After'),body});
        }catch{reply({error:'network'});}
      })();
      return true;
    };
    let result;
    try { chrome.runtime.onMessage.addListener(progress);result=await chrome.runtime.sendMessage({type:action==='archive'?'cs-archive':'cs-delete',jobId,ids:[...allowed],organizationId:approvedOrganization}); if(!result)throw Error('disconnected');update(result.completed); }
    catch { result={error:'connection-lost'}; }
    finally { try{chrome.runtime.onMessage.removeListener(progress);}catch{}busy=false; }
    if(!contextAlive())return;
    message.textContent=t(result.cancelled?(action==='archive'?'archiveStopped':'stopped'):result.error?'failed':'done',{n:completed.size});
    hint.textContent=result.retryAt ? t('cooldown',{time:new Date(result.retryAt).toLocaleTimeString(i18n.normalize(settings.language))}) : result.error ? t('apiError')+' ('+result.error+')' : '';if(!result.error)hint.remove();
    stop.disabled=false;stop.textContent=t('close');stop.onclick=()=>status.remove();
    if(!settings.enabled){selected.clear();document.querySelectorAll('.cs-checkbox,.cs-toolbar').forEach(node=>node.remove());}
    else scan();sync();void grokHistory?.setEnabled(settings.enabled&&settings.grokShowAll);
  }
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
  document.addEventListener('pointermove',event=>{pointer={x:event.clientX,y:event.clientY};queueWave();},{passive:true,capture:true});
  document.addEventListener('pointerleave',()=>{pointer=null;queueWave();});
  window.addEventListener('blur',()=>{pointer=null;queueWave();});
  document.addEventListener('scroll',()=>{queueWave();},true);
  document.addEventListener('click',event=>{if(event.target.closest?.('.cs-toolbar'))return;document.querySelectorAll('.cs-actions').forEach(n=>n.hidden=true);document.querySelectorAll('.cs-toggle').forEach(n=>n.setAttribute('aria-expanded','false'));});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.querySelectorAll('.cs-actions').forEach(n=>n.hidden=true);document.querySelectorAll('.cs-toggle[aria-expanded="true"]').forEach(n=>{n.setAttribute('aria-expanded','false');n.focus();});} });
  // Prevent parent React link handlers, while preserving the checkbox's native toggle.
  document.addEventListener('click',event=>{if(event.target.matches?.('.cs-checkbox')){event.stopPropagation();const box=event.target;if(!busy){box.checked?selected.set(box.dataset.csId,items().find(item=>item.id===box.dataset.csId)?.title||''):selected.delete(box.dataset.csId);sync();}}},true);
  const grokHistory=site.id==='grok'&&globalThis.ChatTidyGrok?ChatTidyGrok.create({changed:schedule,error:code=>{const notice=el('section','cs-status',t('grokLoadError')+' ('+code+')');notice.dataset.csOwned='true';const close=el('button','cs-button',t('close'));close.onclick=()=>notice.remove();notice.append(close);document.body.append(notice);}}):null;
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{if(message?.type==='cs-site'&&sender.id===chrome.runtime.id){reply({site:site.id});}return false;});
  document.addEventListener('pointerdown',event=>{if(event.target.matches?.('.cs-checkbox'))event.stopPropagation();},true);
  document.addEventListener('keydown',event=>{if(event.target.matches?.('.cs-checkbox'))event.stopPropagation();},true);
  chrome.storage.local.get(settings).then(saved=>{
    settings={...settings,...saved};
    observer=new MutationObserver(records=>{
      if(records.some(record=>{
        if(own(record.target) || record.target.closest?.('main'))return false;
        if(record.type==='attributes'){
          if(record.attributeName!=='class')return true;
          // Ignore our wave/selection class updates; repair only missing row markers.
          const link=record.target,box=link.matches?.('a')&&link.querySelector('.cs-checkbox');
          return box && (!link.classList.contains('cs-chat-link') ||
            link.classList.contains('cs-dynamic')!==(!link.classList.contains('cs-grok-search-link')&&settings.checkboxMode!=='always') ||
            link.classList.contains('cs-selected')!==selected.has(box.dataset.csId));
        }
        return [...record.addedNodes,...record.removedNodes].some(node=>!own(node));
      }))schedule();
    });scan();watch();void grokHistory?.setEnabled(settings.enabled&&settings.grokShowAll);
  }).catch(()=>{ /* Invalidated extension: refreshing the page re-injects it. */ });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local'||!['enabled','language','checkboxMode','grokShowAll'].some(key=>changes[key]))return;
    for(const key of ['enabled','language','checkboxMode','grokShowAll'])if(changes[key])settings[key]=changes[key].newValue;
    if(busy)return;
    cleanup();void grokHistory?.setEnabled(settings.enabled&&settings.grokShowAll);if(!settings.enabled)selected.clear();else scan();
  });
})();
