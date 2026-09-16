(async () => {
  const api=ChatTidyI18n;
  const defaults={enabled:true,grokShowAll:false,grokHideBots:false,grokCollapseBots:false,theme:'system',hideSupport:false,concurrency:2,checkboxMode:'dynamic',language:api.browserLanguage()};
  const fields=['enabled','grokShowAll','language','checkboxMode','concurrency','theme','grokHideBots','grokCollapseBots',...(document.getElementById('hideSupport')?['hideSupport']:[])];
  let settings={...defaults,...await browser.storage.local.get(defaults)};
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
  }
  document.getElementById('open-settings').onclick=()=>{document.getElementById('main-page').hidden=true;document.getElementById('settings-page').hidden=false;document.getElementById('back-settings').focus();};
  document.getElementById('back-settings').onclick=()=>{document.getElementById('main-page').hidden=false;document.getElementById('settings-page').hidden=true;document.getElementById('open-settings').focus();};
  // Chrome caps the popup at 600px: bring the expanded guide into view instead of leaving it clipped below the fold.
  document.querySelectorAll('#main-page details').forEach(section=>section.addEventListener('toggle',()=>{if(section.open)section.scrollIntoView?.({block:'nearest'});}));
  render();
  document.getElementById('open-archive').onclick=async()=>{try{const [tab]=await browser.tabs.query({active:true,currentWindow:true});const result=await browser.tabs.sendMessage(tab.id,{type:'cs-open-archive'});if(result?.ok)window.close();else document.getElementById('saved').textContent=api.t(settings.language,'refresh');}catch{document.getElementById('saved').textContent=api.t(settings.language,'refresh');}};
  if(browser.tabs){try{const [tab]=await browser.tabs.query({active:true,currentWindow:true});if(tab?.id){const result=await browser.tabs.sendMessage(tab.id,{type:'cs-site'});document.getElementById('open-archive').hidden=!['chatgpt','qwen'].includes(result?.site);document.getElementById('grok-options').hidden=result?.site!=='grok';document.getElementById('grok-bots-options').hidden=result?.site!=='grok';}}catch{}}
  for(const key of fields)document.getElementById(key).addEventListener('change',async event=>{
    const value=['enabled','grokShowAll','grokHideBots','grokCollapseBots','hideSupport'].includes(key)?event.target.checked:key==='concurrency'?Number(event.target.value):event.target.value;
    settings[key]=value;render();
    await browser.storage.local.set({[key]:value});
    document.getElementById('saved').textContent=api.t(settings.language,'saved');
  });
})();
