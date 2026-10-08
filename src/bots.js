/* Only target the native Bots sidebar group, never the chat list or message body. */
globalThis.ChatTidyBots={create(){
  const touched=new Map();let settings={enabled:true,grokHideBots:false,grokCollapseBots:false};
  // The collapse preference is a default: applied once per page load and again whenever the preference changes.
  // Later scans leave the section alone so the user can expand or collapse it freely.
  let revision=0;
  const roots='aside,nav,.unified-sidebar,[data-sidebar="sidebar"],[data-slot="sidebar"]';
  const labels=new Set(['bots','机器人','機器人','ボット','боты','robots']);
  function reset(){for(const [group,snapshot] of touched){group.classList.remove('cs-bots-hidden');const button=snapshot.button;if(button.isConnected&&snapshot.changed&&button.getAttribute('aria-expanded')!==snapshot.expanded)button.click();}touched.clear();}
  function scan(){
    if(location.hostname!=='grok.com'||!settings.enabled){reset();return;}
    for(const button of document.querySelectorAll(roots.split(',').map(root=>root+' button[aria-expanded]').join(','))){
      if(button.closest('main')||!labels.has((button.getAttribute('aria-label')||button.textContent).trim().toLowerCase()))continue;
      const group=button.closest('[data-sidebar="group"],[data-slot="sidebar-group"]');if(!group||group.querySelector('a[href^="/c/"]'))continue;
      if(!touched.has(group))touched.set(group,{button,expanded:button.getAttribute('aria-expanded'),changed:false,revision:-1});
      const snapshot=touched.get(group);snapshot.button=button;group.classList.toggle('cs-bots-hidden',!!settings.grokHideBots);
      if(!settings.grokHideBots&&snapshot.revision!==revision){const desired=String(!settings.grokCollapseBots);if(button.getAttribute('aria-expanded')!==desired){snapshot.changed=true;button.click();}snapshot.revision=revision;}
    }
    for(const [group] of touched)if(!group.isConnected)touched.delete(group);
  }
  function update(next){
    const before=settings;settings={...settings,...next};
    if(['enabled','grokHideBots','grokCollapseBots'].some(key=>settings[key]!==before[key]))revision++;
    scan();
  }
  return {scan,update,destroy:reset};
}};
