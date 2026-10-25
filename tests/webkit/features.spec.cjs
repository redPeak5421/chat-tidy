const {test,expect}=require('@playwright/test');const fs=require('node:fs');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
test('archive entry, native table multi-select, restore and delete confirmation',async({page,context},testInfo)=>{
 let records=ids.map((id,i)=>({id,title:'Fictional '+i}));const writes=[];
 await context.route('https://chatgpt.com/**',async route=>{const url=new URL(route.request().url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<meta name="viewport" content="width=device-width,initial-scale=1"><nav><h2>Chats</h2><a href="/c/${ids[0]}">Test chat</a></nav>`});
  if(url.pathname==='/api/auth/session')return route.fulfill({json:{accessToken:'test',user:{id:'test-account'}}});
  if(url.pathname==='/backend-api/conversations')return route.fulfill({json:{items:records,offset:0,limit:30,total:records.length}});
  writes.push(JSON.parse(route.request().postData()));records=records.filter(r=>!url.pathname.endsWith(r.id));return route.fulfill({json:{success:true}});
 });
 await page.goto('https://chatgpt.com/');await page.evaluate(()=>{globalThis.chrome={storage:{local:{get:async d=>({...d,language:'en'}),set:async()=>{}},onChanged:{addListener(fn){globalThis.change=fn;}}},runtime:{id:'test',onMessage:{addListener(){}}}};});
 for(const f of ['core','batch','i18n','archive','bots','content'])await page.addScriptTag({path:'src/'+f+'.js'});await page.addStyleTag({path:'src/content.css'});
 await page.locator('.cs-toggle').click({force:true});await page.locator('[data-cs-action="archiveManager"]').click();await expect(page.locator('.cs-archive-checkbox')).toHaveCount(2);
 await page.evaluate(()=>change({theme:{newValue:'dark'}},'local'));await expect(page.locator('.cs-archive-manager')).toBeVisible();expect(await page.locator('.cs-archive-manager').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(20, 20, 20)');expect(await page.locator('.cs-archive-manager tbody a').first().evaluate(n=>getComputedStyle(n).color)).toBe('rgb(242, 242, 242)');await page.screenshot({path:testInfo.outputPath('archive-manager.png')});
 await page.locator('.cs-archive-checkbox').first().check();await page.locator('[data-archive-action="delete"]').click();await expect(page.locator('.cs-archive-confirm')).toBeVisible();expect(writes.length).toBe(0);await page.locator('[data-archive-cancel]').click();await page.locator('[data-archive-action="restore"]').click();await expect(page.locator('.cs-archive-checkbox')).toHaveCount(1);expect(writes).toEqual([{is_archived:false}]);
 await page.locator('.cs-archive-close').first().click();await page.evaluate(id=>{const modal=document.createElement('div');modal.dataset.testid='modal-archived-conversations';modal.innerHTML=`<table><tbody><tr><td><a href="/c/${id}">Native fixture</a></td></tr></tbody></table>`;document.body.append(modal);},ids[1]);await expect(page.locator('[data-testid="modal-archived-conversations"] .cs-archive-checkbox')).toHaveCount(1);
});
test('theme changes popup colors independent of system and settings persist',async({page,context},testInfo)=>{
 await context.route('https://fixture.test/**',route=>{const p=new URL(route.request().url()).pathname.slice(1)||'popup.html';if(!/^(popup\.html|src\/[\w.-]+|icons\/[\w.-]+)$/.test(p))return route.abort();return route.fulfill({path:p,contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':undefined});});
 await page.addInitScript(()=>{globalThis.saved={};globalThis.chrome={storage:{local:{get:async d=>({...d,language:'en'}),set:async d=>Object.assign(saved,d)}},tabs:{query:async()=>[]}};});await page.emulateMedia({colorScheme:'dark'});await page.goto('https://fixture.test/popup.html');await page.locator('#open-settings').click();await page.locator('#theme').selectOption('light');await expect(page.locator('html')).toHaveAttribute('data-theme','light');expect(await page.locator('html').evaluate(n=>getComputedStyle(n).getPropertyValue('--ink').trim())).toBe('#25334b');await page.emulateMedia({colorScheme:'light'});await page.locator('#theme').selectOption('dark');expect(await page.locator('html').evaluate(n=>getComputedStyle(n).getPropertyValue('--ink').trim())).toBe('#e4eafa');expect(await page.evaluate(()=>saved.theme)).toBe('dark');await page.screenshot({path:testInfo.outputPath('settings-dark.png')});
});
test('Bots preferences use the native section toggle and hide the complete group',async({page,context})=>{
 await context.route('https://grok.com/**',route=>route.fulfill({contentType:'text/html',body:'<div class="unified-sidebar"><div data-sidebar="group" id="bots"><div><button aria-expanded="true"><span>Bots</span></button></div><ul><li>Fictional bot</li></ul></div><div id="chats">Chats remain visible</div></div>'}));
 await page.goto('https://grok.com/');await page.evaluate(()=>{globalThis.chrome={storage:{local:{get:async d=>d},onChanged:{addListener(fn){globalThis.change=fn;}}},runtime:{id:'test',onMessage:{addListener(){}}}};const b=document.querySelector('#bots button');b.onclick=()=>{const expanded=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(expanded));document.querySelector('#bots ul').hidden=!expanded;};});
 for(const f of ['core','batch','i18n','archive','bots','content'])await page.addScriptTag({path:'src/'+f+'.js'});await page.addStyleTag({path:'src/content.css'});
 await page.evaluate(()=>change({grokCollapseBots:{newValue:true}},'local'));await expect(page.locator('#bots button')).toHaveAttribute('aria-expanded','false');await expect(page.locator('#bots ul')).toBeHidden();
 await page.evaluate(()=>change({grokHideBots:{newValue:true}},'local'));await expect(page.locator('#bots')).toBeHidden();await expect(page.locator('#chats')).toBeVisible();
 await page.evaluate(()=>change({grokHideBots:{newValue:false},grokCollapseBots:{newValue:false}},'local'));await expect(page.locator('#bots')).toBeVisible();await expect(page.locator('#bots ul')).toBeVisible();
});

test('native archive toolbar stays in visible dialog and deep-link close returns to data controls',async({page,context})=>{
 await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:`<div data-testid="modal-archived-conversations"><div hidden>Backdrop</div><section role="dialog"><button aria-label="Close"><svg></svg></button><h2>Archived</h2><table><tbody><tr><td><a href="/c/${ids[0]}">Fixture</a></td></tr></tbody></table></section></div>`}));
 await page.goto('https://chatgpt.com/#settings/DataControls/ArchivedChats');
 for(const f of ['core','archive'])await page.addScriptTag({path:'src/'+f+'.js'});
 await page.evaluate(()=>{globalThis.ChatTidyBatch={cancel(){}};globalThis.manager=ChatTidyArchive.create({t:k=>k});manager.scan();});
 await expect(page.locator('[role="dialog"] [data-archive-action="restore"]')).toBeVisible();await expect(page.locator('[role="dialog"] [data-archive-action="delete"]')).toBeVisible();
 await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page).toHaveURL('https://chatgpt.com/#settings/DataControls');
});

test('ChatGPT move picker lists projects from the sidebar endpoint and patches gizmo_id per chat',async({page,context},testInfo)=>{
 const patches=[];
 await context.route('https://chatgpt.com/**',async route=>{const url=new URL(route.request().url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<meta name="viewport" content="width=device-width,initial-scale=1"><nav><h2>Chats</h2>${ids.map((id,i)=>`<a href="/c/${id}">Fixture ${i}</a>`).join('')}</nav>`});
  if(url.pathname==='/api/auth/session')return route.fulfill({json:{accessToken:'test',user:{id:'test-account'}}});
  if(url.pathname==='/backend-api/gizmos/snorlax/sidebar')return route.fulfill({json:{cursor:null,items:[{gizmo:{gizmo:{id:'g-p-fixture',display:{name:'Fixture project'}}},conversations:{items:[]}}]}});
  if(route.request().method()==='PATCH'){patches.push({path:url.pathname,body:JSON.parse(route.request().postData())});return route.fulfill({json:{success:true}});}
  return route.fulfill({status:404,body:''});
 });
 await page.goto('https://chatgpt.com/');await page.evaluate(()=>{globalThis.browser={storage:{local:{get:async d=>({...d,language:'en',checkboxMode:'always'}),set:async()=>{}},onChanged:{addListener(){}}},runtime:{id:'test',onMessage:{addListener(){}}}};globalThis.chrome=globalThis.browser;});
 for(const f of ['core','batch','i18n','archive','bots','projects','content'])await page.addScriptTag({path:'src/'+f+'.js'});await page.addStyleTag({path:'src/content.css'});
 await page.locator('.cs-checkbox').first().check();await page.locator('.cs-toggle').click({force:true});await page.locator('[data-cs-action="move"]').click();
 const dialog=page.locator('.cs-move');await expect(dialog).toBeVisible();await expect(dialog).toContainText('Fixture project');await page.screenshot({path:testInfo.outputPath('move-picker.png')});
 await dialog.locator('input[value="g-p-fixture"]').check();await dialog.locator('[data-cs-move-confirm]').click();
 await expect.poll(()=>patches.length).toBe(1);expect(patches[0]).toEqual({path:'/backend-api/conversation/'+ids[0],body:{gizmo_id:'g-p-fixture'}});
 await expect(page.locator('.cs-status')).toContainText('Moved 1');await expect(page.locator(`a[href="/c/${ids[0]}"]`)).toBeHidden();
});
test('the five concurrency choices fit the 440px popup in every language',async({page,context},testInfo)=>{
 await context.route('https://fixture.test/**',route=>{const p=new URL(route.request().url()).pathname.slice(1)||'popup.html';if(!/^(popup\.html|src\/[\w.-]+|icons\/[\w.-]+)$/.test(p))return route.abort();return route.fulfill({path:p,contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':undefined});});
 await page.addInitScript(()=>{globalThis.saved={};globalThis.chrome={storage:{local:{get:async d=>({...d,language:'en'}),set:async d=>Object.assign(saved,d)}},tabs:{query:async()=>[]}};});
 await page.setViewportSize({width:440,height:600});await page.goto('https://fixture.test/popup.html');
 for(const language of ['en','zh-CN','zh-TW','fr','ja','ru']){
  await page.locator('#language').selectOption(language);
  const layout=await page.evaluate(()=>{
   const group=document.getElementById('concurrency'),field=group.closest('.field'),labels=[...group.querySelectorAll('label')],title=document.getElementById('concurrency-label');
   const box=group.getBoundingClientRect(),area=field.getBoundingClientRect();
   return {page:document.documentElement.scrollWidth<=innerWidth,values:labels.map(l=>l.querySelector('input').value),inside:box.left>=area.left-0.5&&box.right<=area.right+0.5,
    oneRow:new Set(labels.map(l=>Math.round(l.getBoundingClientRect().top))).size===1,clipped:labels.some(l=>{const s=l.querySelector('span');return s.scrollWidth>s.clientWidth+0.5;}),
    titleClipped:title.scrollWidth>title.clientWidth+0.5,width:Math.round(box.width),titleTop:Math.round(title.getBoundingClientRect().top)};
  });
  expect(layout.page,language).toBe(true);expect(layout.values).toEqual(['1','3','5','10','15']);
  expect(layout.inside,language).toBe(true);expect(layout.oneRow,language).toBe(true);expect(layout.clipped,language).toBe(false);expect(layout.titleClipped,language).toBe(false);
  await page.locator('#concurrency').screenshot({path:testInfo.outputPath('concurrency-'+language+'.png')});
 }
 await page.locator('input[name="concurrency"][value="15"]').check({force:true});await expect.poll(()=>page.evaluate(()=>saved.concurrency)).toBe(15);
});
