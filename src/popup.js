(async () => {
  const api=ChatTidyI18n;
  const defaults={enabled:true,concurrency:2,checkboxMode:'dynamic',language:api.browserLanguage()};
  const fields=['enabled','language','checkboxMode','concurrency'];
  let settings={...defaults,...await chrome.storage.local.get(defaults)};
  function render(){
    document.documentElement.lang=settings.language;
    const repository=document.querySelector('.repository-link');
    repository.title=api.t(settings.language,'repository');
    repository.setAttribute('aria-label',repository.title);
    document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=api.t(settings.language,node.dataset.i18n));
    document.getElementById('enabled').checked=settings.enabled;
    document.getElementById('language').value=settings.language;
    for(const key of ['checkboxMode','concurrency'])document.querySelectorAll('input[name="'+key+'"]').forEach(input=>input.checked=input.value===String(settings[key]));
  }
  render();
  for(const button of document.querySelectorAll('[data-diagnostic]'))button.addEventListener('click',async()=>{
    const status=document.getElementById('diagnostic-status');
    try {
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      if(!tab?.id || !tab.url?.startsWith('https://chatgpt.com/'))throw Error('unavailable');
      const action=button.dataset.diagnostic;
      const result=await chrome.tabs.sendMessage(tab.id,{type:'cs-diagnostics-'+action},{frameId:0});
      if(action==='report'){
        if(!result){status.textContent=api.t(settings.language,'diagnosticEmpty');return;}
        const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download='chat-tidy-diagnostics.json';link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        status.textContent=api.t(settings.language,'saved');
      }else status.textContent=api.t(settings.language,action==='start'?'diagnosticRunning':'saved');
    }catch{status.textContent=api.t(settings.language,'diagnosticUnavailable');}
  });
  for(const key of fields)document.getElementById(key).addEventListener('change',async event=>{
    const value=key==='enabled'?event.target.checked:key==='concurrency'?Number(event.target.value):event.target.value;
    settings[key]=value;render();
    await chrome.storage.local.set({[key]:value});
    document.getElementById('saved').textContent=api.t(settings.language,'saved');
  });
})();
