/* Only target the native Bots sidebar group, never the chat list or message body. */
globalThis.ChatTidyBots={create(){
  const touched=new Map();let settings={enabled:true,grokHideBots:false,grokCollapseBots:false};
  // The collapse preference is a default: applied once per page load and again whenever the preference changes.
  // Later scans leave the section alone so the user can expand or collapse it freely.
  let pending=true;
  function reset(){for(const [group,snapshot] of touched){group.classList.remove('cs-bots-hidden');const button=snapshot.button;if(button.isConnected&&snapshot.changed&&button.getAttribute('aria-expanded')!==snapshot.expanded)button.click();}touched.clear();pending=true;}
  function scan(){
    if(location.hostname!=='grok.com'||!settings.enabled){reset();return;}
    let applied=false;
    for(const button of document.querySelectorAll('aside button[aria-expanded],nav button[aria-expanded],.unified-sidebar button[aria-expanded]')){
      if((button.getAttribute('aria-label')||button.textContent).trim().toLowerCase()!=='bots')continue;
      const group=button.closest('[data-sidebar="group"],[data-slot="sidebar-group"]');if(!group||group.querySelector('a[href^="/c/"]'))continue;
      if(!touched.has(group))touched.set(group,{button,expanded:button.getAttribute('aria-expanded'),changed:false});
      const snapshot=touched.get(group);snapshot.button=button;group.classList.toggle('cs-bots-hidden',!!settings.grokHideBots);
      if(!settings.grokHideBots&&pending){const desired=String(!settings.grokCollapseBots);if(button.getAttribute('aria-expanded')!==desired){snapshot.changed=true;button.click();}applied=true;}
    }
    if(applied)pending=false;
    for(const [group] of touched)if(!group.isConnected)touched.delete(group);
  }
  function update(next){
    const before=settings;settings={...settings,...next};
    if(['enabled','grokHideBots','grokCollapseBots'].some(key=>settings[key]!==before[key]))pending=true;
    scan();
  }
  return {scan,update,destroy:reset};
}};
