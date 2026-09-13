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
  for(const key of fields)document.getElementById(key).addEventListener('change',async event=>{
    const value=key==='enabled'?event.target.checked:key==='concurrency'?Number(event.target.value):event.target.value;
    settings[key]=value;render();
    await chrome.storage.local.set({[key]:value});
    document.getElementById('saved').textContent=api.t(settings.language,'saved');
  });
})();
