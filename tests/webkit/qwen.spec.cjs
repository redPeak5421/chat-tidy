const {test,expect}=require('@playwright/test');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const row=title=>`<div class="chat-item-drag"><a aria-label="chat-item" class="chat-item-drag-link"><div class="chat-item-drag-link-content"><span class="chat-item-title-text">${title}</span></div></a></div>`;
const html=`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>#sidebar{width:280px}.chat-item-drag-link{display:flex;padding:8px;cursor:pointer}</style><div id="sidebar"><div class="session-list"><div class="list-folder"><div class="collapsible-full"><div class="collapsible-full"><div><div class="collapsible-full"><div class="folder-button" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#eee;border-radius:8px;cursor:pointer" onclick="this.dataset.toggles=String((Number(this.dataset.toggles)||0)+1)"><div class="folder-name">所有对话</div><div class="folder-button-icon-container"><span aria-hidden="true">▾</span></div></div></div></div></div><div><div class="folder-content"><div class="list-folder-pt"><div class="list-folder-chats">Today</div>${row('Fixture alpha')}${row('Fixture beta')}</div></div></div></div></div></div></div>`;
async function boot(page,context,{requests}){
 await context.route('https://chat.qwen.ai/**',async route=>{const request=route.request();const url=new URL(request.url());const path=url.pathname,method=request.method();
  if(method==='GET'&&path==='/')return route.fulfill({contentType:'text/html',body:html});
  requests.push({method,path,query:Object.fromEntries(url.searchParams),body:request.postData()?JSON.parse(request.postData()):null,headers:request.headers()});
  const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/api/v2/chats/pinned')return json({success:true,data:[]});
  if(path==='/api/v2/chats/')return json({success:true,data:[{id:ids[0],title:'Fixture alpha'},{id:ids[1],title:'Fixture beta'}]});
  if(path==='/api/v1/auths/')return json({id:'user-a',email:'a@example.test'});
  if(path==='/api/v2/projects/'&&method==='GET')return json({success:true,data:[{id:'proj-1',name:'Research'}]});
  if(path==='/api/v2/projects/add_chat')return json({success:true,data:true});
  if(path.startsWith('/api/v2/chats/')&&(method==='DELETE'||path.endsWith('/archive')))return json({success:true,data:true});
  return json({success:false,data:{code:'Not_Found'}});
 });
 await page.goto('https://chat.qwen.ai/');
 await page.evaluate(()=>{globalThis.browser={storage:{local:{get:async d=>({...d,language:'en',checkboxMode:'always'}),set:async()=>{}},onChanged:{addListener(){}}},runtime:{id:'test',onMessage:{addListener(){}}}};globalThis.chrome=globalThis.browser;});
 for(const f of ['core','gemini','kimi','qwen','batch','i18n','archive','bots','projects','content'])await page.addScriptTag({path:'src/'+f+'.js'});await page.addStyleTag({path:'src/content.css'});
}
test('Qwen rows are mapped from the site list and deletion targets only the checked chat',async({page,context},testInfo)=>{
 const requests=[];await boot(page,context,{requests});
 await expect(page.locator('.cs-checkbox')).toHaveCount(2);
 expect(await page.locator('.cs-checkbox').evaluateAll(nodes=>nodes.map(n=>n.dataset.csId))).toEqual(ids);
 const header=page.locator('.folder-button');await expect(header.locator('.cs-toggle')).toBeVisible();const a=await header.boundingBox(),b=await header.locator('.cs-toggle').boundingBox(),name=await header.locator('.folder-name').boundingBox(),chevron=await header.locator('.folder-button-icon-container').boundingBox();
 expect(Math.abs(a.y+a.height/2-b.y-b.height/2)).toBeLessThan(2);expect(Math.abs(name.y+name.height/2-b.y-b.height/2)).toBeLessThan(2);expect(b.x).toBeGreaterThanOrEqual(name.x+name.width-1);expect(b.x+b.width).toBeLessThanOrEqual(chevron.x+1);
 await page.locator('.cs-toggle').click();await expect(page.locator('.cs-actions')).toBeVisible();expect(await header.getAttribute('data-toggles')).toBeNull();await page.locator('.cs-toggle').click();
 await page.screenshot({path:testInfo.outputPath('qwen-sidebar.png')});
 await page.locator('.cs-checkbox').nth(1).check();await page.locator('.cs-toggle').click();await page.locator('[data-cs-action="delete"]').click();
 expect(requests.filter(r=>r.method==='DELETE')).toEqual([]);await page.locator('.cs-confirm .cs-danger').click();
 await expect.poll(()=>requests.filter(r=>r.method==='DELETE').length).toBe(1);
 const del=requests.find(r=>r.method==='DELETE');expect(del.path).toBe('/api/v2/chats/'+ids[1]);expect(del.headers['source']).toBe('web');expect(del.headers['authorization']).toBeUndefined();
 await expect(page.locator('.chat-item-drag').nth(1)).toBeHidden();await expect(page.locator('.chat-item-drag').nth(0)).toBeVisible();
});
test('Qwen move picker offers projects and adds the selection through the native batch endpoint',async({page,context})=>{
 const requests=[];await boot(page,context,{requests});
 await expect(page.locator('.cs-checkbox')).toHaveCount(2);
 await page.locator('.cs-toggle').click();await page.locator('[data-cs-action="all"]').click();await page.locator('.cs-toggle').click();await page.locator('[data-cs-action="move"]').click();
 const dialog=page.locator('.cs-move');await expect(dialog).toBeVisible();await expect(dialog).toContainText('Research');
 await dialog.locator('input[value="proj-1"]').check();await dialog.locator('[data-cs-move-confirm]').click();
 await expect.poll(()=>requests.filter(r=>r.path==='/api/v2/projects/add_chat').length).toBe(1);
 expect(requests.find(r=>r.path==='/api/v2/projects/add_chat').body).toEqual({chat_ids:ids,project_id:'proj-1'});
 await expect(page.locator('.cs-status')).toContainText('Moved 2');await expect(page.locator('.chat-item-drag')).toHaveCount(2);await expect(page.locator('.chat-item-drag.cs-deleted-row')).toHaveCount(2);
});
