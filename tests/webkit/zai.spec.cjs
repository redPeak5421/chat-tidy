const {test,expect}=require('@playwright/test');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
// Live z.ai layout: a "Recent" label div, a hidden group tab, then the scrollable list of row wrappers holding button[data-selected].
const row=title=>`<div class="w-full relative group"><button draggable="false" data-selected="false" class="zrow"><div class="flex"><div dir="auto" class="truncate">${title}</div></div><span class="contents"></span></button></div>`;
const html=`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:14px system-ui;background:#f0f0f0}#sidebar{width:238px}.panel{display:flex;flex-direction:column;margin:0 6px}.label{flex-shrink:0;padding:8px 8px 8px 14px;font-size:14px;line-height:20px;color:#888}.zrow{width:100%;display:flex;justify-content:space-between;gap:8px;padding:8px 8px 8px 38px;border:0;background:none;font:inherit;line-height:20px;border-radius:10px;text-align:left}.truncate{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}</style><div id="sidebar"><div class="panel"><div class="label">最近</div><button id="chat-group-tab-zai-web" hidden><span>最近</span></button><div class="wrap"><div class="AgentChatList">${row('Fixture alpha')}${row('Fixture beta')}</div></div></div></div><main>Page</main>`;
async function boot(page,context,{requests,list,mode='always',lang='en',theme='system',css=''}){
 await context.route('https://chat.z.ai/**',async route=>{const request=route.request();const url=new URL(request.url());const path=url.pathname,method=request.method();
  if(method==='GET'&&path==='/')return route.fulfill({contentType:'text/html',body:html.replace('</style>',css+'</style>')});
  requests.push({method,path,query:Object.fromEntries(url.searchParams),headers:request.headers()});
  const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  if(method==='GET'&&path==='/api/v1/chats/')return json(url.searchParams.get('page')==='1'?list:[]);
  if(method==='GET'&&path==='/api/v1/auths/')return json({id:'user-a',email:'a@example.test'});
  if(method==='DELETE'&&/^\/api\/v1\/chats\/[0-9a-f-]{36}$/.test(path))return json(true);
  return route.fulfill({status:404,contentType:'application/json',body:'{"detail":"Not Found"}'});
 });
 await page.goto('https://chat.z.ai/');
 // The Svelte app nests the row menu button inside the row button; the HTML parser cannot, so add it through the DOM.
 await page.evaluate(([mode,lang,theme])=>{document.querySelectorAll('.zrow>span.contents').forEach(span=>{const menu=document.createElement('button');menu.className='chatItemMenu';menu.textContent='⋯';span.append(menu);});
  localStorage.setItem('token','fixture-token');globalThis.browser={storage:{local:{get:async d=>({...d,language:lang,theme,checkboxMode:mode}),set:async()=>{}},onChanged:{addListener(){}}},runtime:{id:'test',onMessage:{addListener(){}}}};globalThis.chrome=globalThis.browser;},[mode,lang,theme]);
 for(const f of ['core','zai','batch','i18n','content'])await page.addScriptTag({path:'src/'+f+'.js'});await page.addStyleTag({path:'src/content.css'});
}
test('Z.ai rows are mapped from the site list, the icon fits the Recent label and deletion targets only the checked chat',async({page,context},testInfo)=>{
 const requests=[];await boot(page,context,{requests,list:[{id:ids[0],title:'Fixture alpha'},{id:ids[1],title:'Fixture beta'}]});
 await expect(page.locator('.cs-checkbox')).toHaveCount(2);
 expect(await page.locator('.cs-checkbox').evaluateAll(nodes=>nodes.map(n=>n.dataset.csId))).toEqual(ids);
 const label=page.locator('.label');await expect(label.locator('.cs-toggle')).toBeVisible();
 const l=await label.boundingBox(),b=await label.locator('.cs-toggle').boundingBox();
 expect(l.height).toBe(36);expect(b.width).toBe(24);expect(b.height).toBe(24);expect(Math.abs(l.y+l.height/2-b.y-b.height/2)).toBeLessThan(1.5);expect(l.x+l.width-(b.x+b.width)).toBeLessThan(12);
 await page.screenshot({path:testInfo.outputPath('zai-sidebar.png')});
 // Checking a row must not trigger the row button (navigation) or the nested menu.
 await page.evaluate(()=>{globalThis.rowClicks=0;document.querySelectorAll('.zrow').forEach(b=>b.addEventListener('click',()=>globalThis.rowClicks++));});
 await page.locator('.cs-checkbox').nth(1).click();await expect(page.locator('.cs-checkbox').nth(1)).toBeChecked();expect(await page.evaluate(()=>globalThis.rowClicks)).toBe(0);
 await page.locator('.cs-toggle').click();await expect(page.locator('[data-cs-action="archive"]')).toHaveCount(0);await expect(page.locator('[data-cs-action="move"]')).toHaveCount(0);
 await page.locator('[data-cs-action="delete"]').click();expect(requests.filter(r=>r.method==='DELETE')).toEqual([]);
 await page.locator('.cs-confirm .cs-danger').click();
 await expect.poll(()=>requests.filter(r=>r.method==='DELETE').length).toBe(1);
 const del=requests.find(r=>r.method==='DELETE');expect(del.path).toBe('/api/v1/chats/'+ids[1]);expect(del.headers['authorization']).toBe('Bearer fixture-token');
 expect(requests.some(r=>r.path==='/api/v1/chats/'&&r.method!=='GET')).toBe(false);
 const list=requests.find(r=>r.path==='/api/v1/chats/');expect(list.query).toEqual({page:'1',type:'all',channel:'zai-web',project_id:'none'});
 await expect(page.locator('.AgentChatList>div').nth(1)).toBeHidden();await expect(page.locator('.AgentChatList>div').nth(0)).toBeVisible();
 await expect(page.locator('.cs-status')).toContainText('Removed 1');
});
// Measured live: a row whose title the list does not confirm must not hide the toolbar and the other rows' checkboxes.
test('Z.ai rows the website list does not confirm get no checkbox while confirmed rows keep theirs',async({page,context})=>{
 const requests=[];await boot(page,context,{requests,list:[{id:ids[0],title:'Fixture alpha'},{id:ids[1],title:'Something else'}]});
 await expect(page.locator('.cs-checkbox')).toHaveCount(1);
 expect(await page.locator('.zrow').evaluateAll(rows=>rows.map(row=>row.querySelector('.cs-checkbox')?.dataset.csId||null))).toEqual([ids[0],null]);
 await expect(page.locator('.label .cs-toggle')).toBeVisible();
});
test('Z.ai keeps the management icon visible in dynamic mode without any hover',async({page,context})=>{
 const requests=[];await boot(page,context,{requests,mode:'dynamic',list:[{id:ids[0],title:'Fixture alpha'},{id:ids[1],title:'Fixture beta'}]});
 await expect(page.locator('.cs-checkbox')).toHaveCount(2);const bar=page.locator('.label .cs-toolbar');
 await page.mouse.move(600,400);await expect.poll(()=>bar.evaluate(n=>getComputedStyle(n).opacity)).toBe('1');
 await expect(page.locator('.label .cs-toggle')).toBeVisible();
});
// Tailwind-like preflight plus a transparent inherited label colour: the menu must not depend on anything the page sets.
const hostile='*{border:0 solid;margin:0;padding:0;box-sizing:border-box}svg{display:block}button{color:inherit;background-color:transparent;font:inherit}.label{color:transparent}';
for(const [scheme,theme,lang] of [['light','system','en'],['dark','system','fr'],['dark','dark','ru'],['light','dark','zh-CN']])test(`selection buttons are labelled, visible and readable (${scheme} OS, ${theme} theme, ${lang})`,async({page,context},testInfo)=>{
 await page.emulateMedia({colorScheme:scheme});
 const requests=[];await boot(page,context,{requests,list:[{id:ids[0],title:'Fixture alpha'},{id:ids[1],title:'Fixture beta'}],lang,theme,css:hostile});
 await expect(page.locator('.cs-checkbox')).toHaveCount(2);await page.locator('.cs-toggle').click();
 const panel=page.locator('.cs-actions');await expect(panel).toBeVisible();await expect(panel.locator('.cs-select-row .cs-count')).toBeVisible();
 const box=await panel.boundingBox();
 for(const action of ['all','invert','clear']){
  const control=panel.locator(`.cs-select-buttons [data-cs-action="${action}"]`);await expect(control).toBeVisible();
  const r=await control.boundingBox();expect(r.width).toBeGreaterThan(40);expect(r.height).toBe(34);expect(r.x+r.width).toBeLessThanOrEqual(box.x+box.width);
  const info=await control.evaluate(n=>{const lum=c=>{const [r,g,b]=c.match(/[\d.]+/g).map(Number).slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
   const fg=getComputedStyle(n).color,bg=getComputedStyle(n.closest('.cs-actions')).backgroundColor,svg=n.querySelector('svg').getBoundingClientRect(),span=n.querySelector('span');
   const [a,b]=[lum(fg),lum(bg)].sort((x,y)=>y-x);return {ratio:(a+.05)/(b+.05),svg:[svg.width,svg.height],text:span.textContent,title:n.title,spanWidth:span.getBoundingClientRect().width,stroke:getComputedStyle(n.querySelector('svg')).stroke};});
  expect(info.ratio).toBeGreaterThan(4.5);expect(info.svg).toEqual([16,16]);expect(info.text.length).toBeGreaterThan(0);expect(info.title).toBe(info.text);expect(info.spanWidth).toBeGreaterThan(8);expect(info.stroke).not.toBe('none');
 }
 await page.screenshot({path:testInfo.outputPath(`zai-menu-${scheme}-${theme}-${lang}.png`)});
});
