const {test,expect}=require('@playwright/test');
const {modernSidebar,modernRow,modernRail}=require('../fixtures/chatgpt-sidebar.cjs');
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;

test('ChatGPT app-shell: visible controls, keyboard selection, rerender and confirmed archive',async({page,context},testInfo)=>{
 const writes=[];
 await context.route('https://chatgpt.com/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/')return route.fulfill({contentType:'text/html',body:`<style>body{font:14px system-ui}aside{width:340px}.header,.header>div{display:flex;align-items:center}.header>div{flex:1;min-width:0}[data-app-action-sidebar-section-toggle]{flex:1} [role=listitem]>div>[role=button]{height:36px;display:block;position:relative;cursor:pointer}.contents{display:contents}.contents>button{position:absolute;right:0;opacity:0;pointer-events:none}.title{display:flex;width:100%;height:100%;align-items:center}.title span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}</style>${modernSidebar()}`});
  if(path==='/api/auth/session')return route.fulfill({json:{accessToken:'fixture-only',user:{id:'fixture'}}});
  if(route.request().method()==='PATCH'){writes.push({path,body:JSON.parse(route.request().postData())});return route.fulfill({json:{success:true}});}
  return route.abort();
 });
 await page.goto('https://chatgpt.com/');
 await page.evaluate(()=>{
  globalThis.chrome={storage:{local:{get:async d=>({...d,language:'en',checkboxMode:'always'}),set:async()=>{}},onChanged:{addListener(fn){globalThis.change=fn}}},runtime:{id:'fixture',onMessage:{addListener(){}}}};
  globalThis.nativeActions=0;
  document.querySelector('nav').addEventListener('click',e=>{if(e.target.closest('[data-sidebar-chatgpt-conversation-key]'))nativeActions++});
  document.querySelector('nav').addEventListener('keydown',e=>{if(e.target.closest('[data-sidebar-chatgpt-conversation-key]'))nativeActions++});
 });
 for(const f of ['core','batch','i18n','archive','content'])await page.addScriptTag({path:`src/${f}.js`});
 await page.addStyleTag({path:'src/content.css'});
 await expect(page.locator('.cs-checkbox')).toHaveCount(2);
 await expect(page.locator('.cs-toggle')).toBeVisible();
 const first=page.locator('.cs-checkbox').first();
 await first.focus();await first.press('Space');await expect(first).toBeChecked();
 expect(await page.evaluate(()=>nativeActions)).toBe(0);
 await expect(first.locator('..')).toHaveClass(/cs-selected/);
 await page.locator('.cs-toggle').click();await page.locator('[data-cs-action="archive"]').click();
 await expect(page.locator('.cs-review')).toHaveText('Chat 1');expect(writes).toHaveLength(0);
 await page.locator('[data-cs-cancel]').click();
 await page.evaluate(html=>{document.querySelector('nav [role="list"]').innerHTML=html},modernRow('1')+modernRow('2'));
 await expect(first).toBeChecked();
 await page.screenshot({path:testInfo.outputPath('chatgpt-sidebar.png')});
 await page.locator('[data-cs-action="archive"]').click();await page.locator('[data-cs-confirm]').click();
 await expect(page.locator('.cs-status')).toContainText('Removed 1');
 expect(writes).toEqual([{path:'/backend-api/conversation/'+id('1'),body:{is_archived:true}}]);
 await expect(page.locator(`[data-sidebar-chatgpt-conversation-key="chatgpt:conversation:${id('1')}"]`)).toBeHidden();
 await expect(page.locator(`[data-sidebar-chatgpt-conversation-key="chatgpt:conversation:${id('2')}"]`).first()).toBeVisible();
 await page.evaluate(()=>change({enabled:{newValue:false}},'local'));
 await expect(page.locator('.cs-checkbox,.cs-toolbar,.cs-chatgpt-heading,.cs-chatgpt-row')).toHaveCount(0);
});

test('ChatGPT rail entry stays hidden until selection and its menu escapes the native fade mask',async({page,context},testInfo)=>{
 await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>body{margin:0;font:14px system-ui}nav[data-app-navigation-rail]{position:fixed;inset:0 auto 0 0;width:52px;background:#f7f7f7;display:flex;flex-direction:column;align-items:center}.rail-items{display:flex;flex:1;flex-direction:column;align-items:center;gap:16px;width:100%;overflow-y:auto;mask-image:linear-gradient(#000 95%,transparent)}.rail-items>button,.rail-items>div>button{width:36px;height:36px;font-size:9px;padding:0}aside{margin-left:64px;width:300px}.header,.header>div{display:flex}[role=listitem]>div>[role=button]{height:36px;position:relative}.contents{display:contents}.contents>button{position:absolute;right:0;opacity:0;pointer-events:none}.title{display:flex;align-items:center;width:100%;height:100%}main{margin-left:400px}</style>${modernRail()+modernSidebar()}`}));
 await page.goto('https://chatgpt.com/');
 await page.evaluate(()=>{globalThis.chrome={storage:{local:{get:async d=>({...d,language:'en',checkboxMode:'dynamic'})},onChanged:{addListener(fn){globalThis.change=fn}}},runtime:{id:'fixture',onMessage:{addListener(){}}}};globalThis.ChatTidyBatch={cancel(){},run(){throw Error('No batch should run')}};});
 for(const f of ['core','i18n','projects','content'])await page.addScriptTag({path:`src/${f}.js`});
 await page.addStyleTag({path:'src/content.css'});
 const bar=page.locator('.cs-chatgpt-rail-toolbar'),toggle=bar.locator('.cs-toggle');
 await expect(bar).toHaveCount(1);await expect(toggle).toBeHidden();await expect(page.locator('#app-shell-sidebar .cs-toolbar')).toHaveCount(0);
 await page.locator('[data-app-navigation-rail]').hover();await expect(toggle).toBeHidden();
 const first=page.locator('.cs-checkbox').first();await first.focus();await first.press('Space');await expect(toggle).toBeVisible();
 await toggle.click();const menu=page.locator('.cs-actions');await expect(menu).toBeVisible();
 expect(await menu.evaluate(e=>e.matches(':popover-open'))).toBe(true);
 const box=await toggle.boundingBox(),panel=await menu.boundingBox();expect(panel.x).toBeGreaterThanOrEqual(box.x+box.width);expect(panel.y+panel.height).toBeLessThanOrEqual(800);
 for(const action of ['archive','move','delete','archiveManager'])await expect(menu.locator(`[data-cs-action="${action}"]`)).toBeVisible();
 await menu.locator('.cs-filter-input').fill('Chat 2');await menu.locator('.cs-filter-input').press('Enter');await expect(page.locator('.cs-checkbox:checked')).toHaveCount(2);
 await page.screenshot({path:testInfo.outputPath('rail-menu.png')});
 await menu.locator('[data-cs-action="clear"]').click();await expect(toggle).toBeVisible();await expect(menu).toBeVisible();
 await page.keyboard.press('Escape');await expect(toggle).toBeHidden();await expect(menu).toBeHidden();
 await page.evaluate(()=>change({checkboxMode:{newValue:'always'}},'local'));await expect(page.locator('.cs-chatgpt-rail-toolbar .cs-toggle')).toBeVisible();
 await page.locator('.cs-chatgpt-rail-toolbar .cs-toggle').click();await expect(page.locator('.cs-actions')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('.cs-actions')).toBeHidden();
 await page.evaluate(()=>change({checkboxMode:{newValue:'dynamic'}},'local'));await expect(page.locator('.cs-chatgpt-rail-toolbar .cs-toggle')).toBeHidden();
 await page.evaluate(()=>change({enabled:{newValue:false}},'local'));await expect(page.locator('.cs-toolbar,.cs-actions')).toHaveCount(0);
});
