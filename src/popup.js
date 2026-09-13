(async () => {
  const api=ChatTidyI18n;
  const defaults={enabled:true,grokShowAll:false,concurrency:2,checkboxMode:'dynamic',language:api.browserLanguage()};
  const fields=['enabled','grokShowAll','language','checkboxMode','concurrency'];
  let settings={...defaults,...await chrome.storage.local.get(defaults)};
  function render(){
    document.documentElement.lang=settings.language;
    const repository=document.querySelector('.repository-link');
    repository.title=api.t(settings.language,'repository');
    repository.setAttribute('aria-label',repository.title);
    document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=api.t(settings.language,node.dataset.i18n));
    document.getElementById('enabled').checked=settings.enabled;document.getElementById('grokShowAll').checked=settings.grokShowAll;
    document.getElementById('language').value=settings.language;
    for(const key of ['checkboxMode','concurrency'])document.querySelectorAll('input[name="'+key+'"]').forEach(input=>input.checked=input.value===String(settings[key]));
  }
  render();
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
  if(chrome.tabs){try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id){const result=await chrome.tabs.sendMessage(tab.id,{type:'cs-site'});document.getElementById('grok-options').hidden=result?.site!=='grok';}}catch{}}
  for(const key of fields)document.getElementById(key).addEventListener('change',async event=>{
    const value=(key==='enabled'||key==='grokShowAll')?event.target.checked:key==='concurrency'?Number(event.target.value):event.target.value;
    settings[key]=value;render();
    await chrome.storage.local.set({[key]:value});
    document.getElementById('saved').textContent=api.t(settings.language,'saved');
  });
})();
