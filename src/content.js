(() => {
  'use strict';
  if (globalThis.__chatTidyInstalled) return;
  globalThis.__chatTidyInstalled = true;
  const core = ChatTidyCore, i18n = ChatTidyI18n;
  let settings = {enabled:true,checkboxMode:'dynamic',language:i18n.browserLanguage()};
  const selected = new Map();
  let busy = false, stopped = false, scheduled = false, observer;
  const t = (key,vars) => i18n.t(settings.language,key,vars);
  const own = node => node?.nodeType === 1 && (node.matches('[data-cs-owned]') || node.closest('[data-cs-owned]'));
  function el(tag,className,text) { const node=document.createElement(tag); if(className)node.className=className; if(text!==undefined)node.textContent=text; return node; }
  function visible(node) { return node?.isConnected && !node.closest('[hidden],[aria-hidden="true"],.cs-deleted-row') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'; }
  function roots() { return [...document.querySelectorAll('nav,aside,[data-testid="history"],#history,[data-testid="sidebar"]')].filter(node=>visible(node)&&!node.closest('main')); }
  function items() {
    const result=[],seen=new Set();
    for(const root of roots()) for(const link of root.querySelectorAll('a[href]')) {
      if(seen.has(link)||!visible(link))continue;
      seen.add(link);const id=core.chatId(link.getAttribute('href'));if(!id)continue;
      const clone=link.cloneNode(true);clone.querySelectorAll('[data-cs-owned],button').forEach(n=>n.remove());
      const title=(clone.textContent||link.getAttribute('title')||'').trim();
      if(title)result.push({id,title,link,root});
    }
    return result;
  }
  function sync() {
    const count=t('selected',{n:selected.size});
    document.querySelectorAll('.cs-toolbar').forEach(bar=>bar.classList.toggle('cs-has-selection',selected.size>0));
    document.querySelectorAll('.cs-count').forEach(node=>{if(node.textContent!==count)node.textContent=count;});
    document.querySelectorAll('.cs-checkbox').forEach(box=>{box.checked=selected.has(box.dataset.csId);box.disabled=busy;box.closest('a')?.classList.toggle('cs-selected',box.checked);});
    document.querySelectorAll('[data-cs-action]').forEach(button=>{button.disabled=busy || ((button.dataset.csAction==='clear'||button.dataset.csAction==='delete')&&!selected.size);});
  }
  function button(key,action) { const b=el('button','cs-button',t(key));b.type='button';b.dataset.csAction=action;b.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();act(action);});return b; }
  function act(action) {
    if(busy)return;
    document.querySelectorAll('.cs-actions').forEach(n=>n.hidden=true);
    document.querySelectorAll('.cs-toggle').forEach(n=>n.setAttribute('aria-expanded','false'));
    if(action==='delete')return confirmDelete();
    core.select(selected,items(),action);sync();
  }
  function toolbar(root) {
    if(root.querySelector('.cs-toolbar'))return;
    const bar=el('div','cs-toolbar');bar.dataset.csOwned='true';
    bar.setAttribute('role','group');bar.setAttribute('aria-label',t('manage'));
    const count=el('span','cs-count');count.setAttribute('aria-live','polite');
    const actions=el('div','cs-actions');actions.append(count);
    for(const key of ['clear','invert','all','delete'])actions.append(button(key,key));
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
    const headings=[...root.querySelectorAll('h2,h3,[role="heading"],button')].filter(node=> /^(聊天|聊天記錄|聊天记录|Chats|Your chats|Discussions|Vos discussions|チャット|チャット履歴|Чаты|Ваши чаты)$/i.test(node.textContent.trim()));
    const heading=headings.find(node=>!own(node));
    if(heading) { const host=heading.closest('button,a')||heading;host.classList.add('cs-heading-hover');host.insertAdjacentElement('afterend',bar);bar.classList.add('cs-at-heading'); }
    else { const first=items().find(item=>root.contains(item.link));if(first){let container=first.link.closest('ol,ul');if(!container||!root.contains(container))container=first.link.parentElement;container.before(bar);}else root.prepend(bar); }
  }
  function scan() {
    if(!settings.enabled||busy)return;
    observer?.disconnect();
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
      item.link.classList.toggle('cs-dynamic',settings.checkboxMode!=='always');
      box.setAttribute('aria-label',t('selectChat',{title:item.title}));
    }
    // One toolbar for each top-level visible sidebar; nested history containers do not duplicate it.
    const parents=roots().filter(root=>found.some(item=>root.contains(item.link)));
    for(const root of parents.filter(root=>!parents.some(other=>other!==root&&other.contains(root))))toolbar(root);
    sync();watch();queueWave();
  }
  function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;scan();},80);}
  function watch(){observer?.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['href','hidden','aria-hidden','class']});}
  function cleanup(){document.querySelectorAll('.cs-heading-hover').forEach(node=>node.classList.remove('cs-heading-hover'));document.querySelectorAll('[data-cs-owned]').forEach(node=>node.remove());document.querySelectorAll('.cs-chat-link').forEach(node=>{node.classList.remove('cs-chat-link','cs-dynamic','cs-selected','cs-wave-active');node.style.removeProperty('--cs-wave');});}
  function confirmDelete(){
    if(!selected.size||document.querySelector('.cs-confirm'))return;
    const snapshot=[...selected].map(([id,title])=>({id,title}));
    const dialog=el('dialog','cs-confirm');dialog.dataset.csOwned='true';
    const title=el('h2','',t('confirmTitle'));title.id='cs-confirm-title';dialog.setAttribute('aria-labelledby',title.id);
    dialog.append(title,el('p','',t('warning',{n:snapshot.length})));
    const list=el('ul','cs-review');for(const item of snapshot)list.append(el('li','',item.title));dialog.append(list);
    const footer=el('div','cs-footer'),cancel=el('button','cs-button',t('cancel')),confirm=el('button','cs-button cs-danger',t('confirm',{n:snapshot.length}));
    cancel.dataset.csCancel='true';confirm.dataset.csConfirm='true';cancel.type=confirm.type='button';
    const opener=document.activeElement;const close=()=>{dialog.close();dialog.remove();opener?.focus();};
    cancel.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    confirm.onclick=()=>{close();void deleteBatch(snapshot);};footer.append(cancel,confirm);dialog.append(footer);document.body.append(dialog);dialog.showModal();cancel.focus();
  }
  const deleted = new Set();
  function hideDeleted() {
    for(const link of document.querySelectorAll('nav a[href],aside a[href],#history a[href],[data-testid="history"] a[href],[data-testid="sidebar"] a[href]')) {
      if(!deleted.has(core.chatId(link.getAttribute('href'))))continue;
      let row=link;
      const parent=link.parentElement;
      if(parent && !parent.matches('nav,aside,ul,ol,#history') && parent.querySelectorAll('a[href]').length===1 && !parent.querySelector('.cs-toolbar')) row=parent;
      row.classList.add('cs-deleted-row');
    }
  }
  async function deleteBatch(snapshot){
    if(busy)return;busy=true;stopped=false;sync();
    const jobId=crypto.randomUUID(), allowed=new Set(snapshot.map(item=>item.id)), completed=new Set();
    const status=el('section','cs-status');status.dataset.csOwned='true';status.setAttribute('aria-label',t('manage'));
    const message=el('p','',t('progress',{done:0,total:snapshot.length}));message.setAttribute('role','status');
    const hint=el('p','cs-hint',t('working')),stop=el('button','cs-button',t('stop'));stop.type='button';
    stop.onclick=()=>{stopped=true;stop.disabled=true;chrome.runtime.sendMessage({type:'cs-cancel',jobId}).catch(()=>{});};
    status.append(message,hint,stop);document.body.append(status);
    const update=ids=>{
      for(const id of ids||[])if(allowed.has(id)){completed.add(id);deleted.add(id);selected.delete(id);}
      hideDeleted();message.textContent=t('progress',{done:completed.size,total:snapshot.length});sync();
    };
    const progress=event=>{if(event.type==='cs-progress'&&event.jobId===jobId)update(event.completed);};
    chrome.runtime.onMessage.addListener(progress);
    let result;
    try { result=await chrome.runtime.sendMessage({type:'cs-delete',jobId,ids:[...allowed]}); if(!result)throw Error('disconnected');update(result.completed); }
    catch { result={error:'connection-lost'}; }
    finally { chrome.runtime.onMessage.removeListener(progress);busy=false; }
    message.textContent=t(result.cancelled?'stopped':result.error?'failed':'done',{n:completed.size});
    hint.textContent=result.retryAt ? t('cooldown',{time:new Date(result.retryAt).toLocaleTimeString(i18n.normalize(settings.language))}) : result.error ? t('apiError')+' ('+result.error+')' : '';if(!result.error)hint.remove();
    stop.disabled=false;stop.textContent=t('close');stop.onclick=()=>status.remove();
    if(!settings.enabled){selected.clear();document.querySelectorAll('.cs-checkbox,.cs-toolbar').forEach(node=>node.remove());}
    else scan();sync();
  }
  // Opt-in, in-memory counters only: never include text, IDs, URLs or credentials.
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
            link.classList.contains('cs-dynamic')!==(settings.checkboxMode!=='always') ||
            link.classList.contains('cs-selected')!==selected.has(box.dataset.csId));
        }
        return [...record.addedNodes,...record.removedNodes].some(node=>!own(node));
      }))schedule();
    });scan();watch();
  }).catch(()=>{ /* Invalidated extension: refreshing the page re-injects it. */ });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local'||!['enabled','language','checkboxMode'].some(key=>changes[key]))return;
    for(const key of ['enabled','language','checkboxMode'])if(changes[key])settings[key]=changes[key].newValue;
    if(busy)return;
    cleanup();if(!settings.enabled)selected.clear();else scan();
  });
})();
