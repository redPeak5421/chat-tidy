const {test,expect}=require('@playwright/test');
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
async function load(page,context,site,body){
 await context.route(`https://${site}/**`,route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>body{margin:0;background:#faf9f7;font:14px system-ui}[data-testid=sidebar],[data-sidebar=sidebar]{width:288px;padding:12px;box-sizing:border-box}.labelrow{display:flex;align-items:center;gap:4px}.labelrow>[data-group-toggle]{flex:1;min-width:0;text-align:left;height:36px}.native-row,.native-label{position:relative;isolation:isolate}.native-row a{height:44px;display:block;padding:8px;box-sizing:border-box}.native-label{margin-top:20px}main{margin-left:330px}</style>${body}`}));
 await page.goto(`https://${site}/`);
 await page.evaluate(()=>{globalThis.chrome={storage:{local:{get:async d=>({...d,language:'en',checkboxMode:'always'})},onChanged:{addListener(fn){globalThis.change=fn;}}},runtime:{id:'test',onMessage:{addListener(){}}}};globalThis.ChatTidyBatch={cancel(){},run(){throw Error('This test must not issue chat operations');}};});
 for(const f of ['core','i18n','bots','content'])await page.addScriptTag({path:`src/${f}.js`});
 await page.addStyleTag({path:'src/content.css'});
}
test('Claude dated sidebar keeps one management entry alongside the first recent collapse title',async({page,context})=>{
 await load(page,context,'claude.ai',`<div data-testid="sidebar"><div><button data-group-toggle><span data-group-name>已置顶</span></button></div><div data-row-key="label:day-0" class="native-label"><div class="labelrow"><button data-group-toggle><span data-group-name>今天</span><span data-cds="Icon">\ue02a</span></button><button aria-label="筛选和分组最近对话">Filter</button></div></div><div class="native-row"><a href="/chat/${id('1')}">Example one</a></div><div data-row-key="label:day-3" class="native-label"><div class="labelrow"><button data-group-toggle><span data-group-name>10月5日</span></button></div></div><div class="native-row"><a href="/chat/${id('2')}">Example two</a></div></div>`);
 await expect(page.locator('.cs-toolbar')).toHaveCount(1);
 await expect(page.locator('[data-row-key="label:day-0"] .cs-toggle')).toBeVisible();
 const title=await page.locator('[data-row-key="label:day-0"] [data-group-toggle]').boundingBox(),toggle=await page.locator('.cs-toggle').boundingBox();
 expect(Math.abs((title.y+title.height/2)-(toggle.y+toggle.height/2))).toBeLessThan(2);
 await page.locator('.cs-toggle').click();await page.locator('[data-cs-action="all"]').click();await expect(page.locator('.cs-actions')).toBeVisible();await expect(page.locator('[data-cs-action="delete"]')).toBeEnabled();
});
test('Claude menu covers isolated native rows and selection controls keep it expanded',async({page,context},testInfo)=>{
 await load(page,context,'claude.ai',`<div data-testid="sidebar"><div class="native-label"><div class="labelrow"><button data-group-toggle><span data-group-name>Chats and tasks</span></button><button>View all</button></div></div>${[1,2,3,4,5].map(n=>`<div class="native-row"><a href="/chat/${id(String(n))}">Example ${n}</a></div>`).join('')}</div><main>Outside</main>`);
 await page.locator('.cs-toggle').click();const menu=page.locator('.cs-actions');await expect(menu).toBeVisible();
 expect(await menu.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(255, 255, 255)');
 const covered=await page.locator('[data-cs-action="delete"]').evaluate(n=>{const r=n.getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.cs-actions');});expect(covered).toBe(true);
 for(const action of ['all','invert','all','clear','all']){await page.locator(`[data-cs-action="${action}"]`).click();await expect(menu).toBeVisible();}
 await page.locator('[data-cs-action="delete"]').click();await expect(page.locator('.cs-confirm')).toBeVisible();await page.locator('[data-cs-cancel]').click();await expect(menu).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('claude-menu.png')});
 await page.keyboard.press('Escape');await expect(menu).toBeHidden();await page.locator('.cs-toggle').click();await page.locator('main').click();await expect(menu).toBeHidden();
});
test('Claude menu opens beside the sidebar so filtered rows stay visible',async({page,context})=>{
 await load(page,context,'claude.ai',`<div data-testid="sidebar"><div class="native-label"><div class="labelrow"><button data-group-toggle><span data-group-name>最近</span></button></div></div>${['Alpha','Web page notes','Gamma'].map((title,n)=>`<div class="native-row"><a href="/chat/${id(String(n+1))}">${title}</a></div>`).join('')}</div><main>Outside</main>`);
 await page.locator('.cs-toggle').click();const menu=page.locator('.cs-actions');await expect(menu).toBeVisible();
 const panel=await menu.boundingBox(),sidebar=await page.locator('[data-testid=sidebar]').boundingBox();
 expect(panel.x).toBeGreaterThanOrEqual(sidebar.x+sidebar.width);
 await page.locator('.cs-filter-input').fill('web');
 await expect(page.locator('.cs-chat-link.cs-match')).toHaveCount(1);
 const row=page.locator('.cs-chat-link.cs-match');
 expect(await row.evaluate(n=>{const r=n.getBoundingClientRect();return !document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.cs-actions');})).toBe(true);
 await expect(menu.locator('.cs-result')).toHaveText(['Web page notes']);
 await menu.locator('.cs-result input').check();await expect(row.locator('.cs-checkbox')).toBeChecked();await expect(menu).toBeVisible();
});
test('narrow windows keep the menu over the sidebar but still list the matches',async({page,context})=>{
 await page.setViewportSize({width:420,height:700});
 await load(page,context,'claude.ai',`<div data-testid="sidebar"><div class="native-label"><div class="labelrow"><button data-group-toggle><span data-group-name>最近</span></button></div></div>${['Alpha','Web page notes'].map((title,n)=>`<div class="native-row"><a href="/chat/${id(String(n+1))}">${title}</a></div>`).join('')}</div>`);
 await page.locator('.cs-toggle').click();const menu=page.locator('.cs-actions');
 const panel=await menu.boundingBox();expect(panel.x).toBeGreaterThanOrEqual(8);expect(panel.x+panel.width).toBeLessThanOrEqual(412);
 await page.locator('.cs-filter-input').fill('web');await expect(menu.locator('.cs-result')).toHaveText(['Web page notes']);
 const after=await menu.boundingBox();expect(after.y+after.height).toBeLessThanOrEqual(692);
});
test('Grok localized Bots in the new sidebar use the native collapse control and hide the whole section',async({page,context})=>{
 await load(page,context,'grok.com',`<div data-sidebar="sidebar"><div data-sidebar="group" id="bots"><div class="labelrow"><button aria-expanded="true"><span>机器人</span><svg></svg></button><button>+</button></div><ul><li><a href="/bot/example">Grok Bot</a></li><li><button>未分配</button><a href="/bot/other">Bot</a></li><li><button>展开</button></li></ul></div><div id="chats"><h2>聊天</h2><a href="/c/${id('1')}">Example chat</a></div></div>`);
 await page.evaluate(()=>{const b=document.querySelector('#bots button');b.onclick=()=>{const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));document.querySelector('#bots ul').hidden=!open;};change({grokCollapseBots:{newValue:true}},'local');});
 await expect(page.locator('#bots ul')).toBeHidden();await expect(page.locator('#bots button').first()).toHaveAttribute('aria-expanded','false');
 await page.locator('#bots button').first().click();await expect(page.locator('#bots ul')).toBeVisible();
 await page.evaluate(()=>change({grokHideBots:{newValue:true}},'local'));await expect(page.locator('#bots')).toBeHidden();await expect(page.locator('#chats')).toBeVisible();
 await page.evaluate(()=>change({enabled:{newValue:false}},'local'));await expect(page.locator('#bots')).toBeVisible();await expect(page.locator('#bots ul')).toBeVisible();
});
test('left-edge hover wave lights rows in a real layout and stays silent while the pointer is over the page',async({page,context})=>{
 await context.route('https://claude.ai/**',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>body{margin:0;display:flex;font:14px system-ui}[data-testid=sidebar]{width:288px;padding:12px;box-sizing:border-box}[data-testid=sidebar] a{height:40px;display:flex;align-items:center}main{flex:1;height:600px}</style><div data-testid="sidebar"><h2>Recents</h2>${['1','2','3'].map(n=>`<div><a href="/chat/${id(n)}">Chat ${n}</a></div>`).join('')}</div><main>Page</main>`}));
 await page.goto('https://claude.ai/');
 await page.evaluate(()=>{globalThis.chrome={storage:{local:{get:async d=>({...d,language:'en',checkboxMode:'dynamic'})},onChanged:{addListener(){}}},runtime:{id:'test',onMessage:{addListener(){}}}};globalThis.ChatTidyBatch={cancel(){},run(){throw Error('no chat operations');}};});
 for(const f of ['core','i18n','content'])await page.addScriptTag({path:`src/${f}.js`});
 await page.addStyleTag({path:'src/content.css'});
 await expect(page.locator('.cs-dynamic')).toHaveCount(3);
 const box=await page.locator('.cs-chat-link').nth(1).boundingBox();
 await page.mouse.move(box.x+10,box.y+box.height/2);
 await expect(page.locator('.cs-chat-link').nth(1)).toHaveClass(/cs-wave-active/);
 await page.mouse.move(700,300);
 await expect(page.locator('.cs-wave-active')).toHaveCount(0);
 await page.evaluate(()=>{globalThis.waveWrites=0;new MutationObserver(r=>{globalThis.waveWrites+=r.length;}).observe(document.querySelector('[data-testid=sidebar]'),{subtree:true,attributes:true});});
 for(const x of [720,760,800])await page.mouse.move(x,320);
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 expect(await page.evaluate(()=>globalThis.waveWrites)).toBe(0);
 await page.mouse.move(box.x+10,box.y+box.height/2);
 await expect(page.locator('.cs-chat-link').nth(1)).toHaveClass(/cs-wave-active/);
});
for(const scheme of ['light','dark'])test(`Claude recents icon matches the native 24px filter button without growing the row (${scheme})`,async({page,context})=>{
 await page.emulateMedia({colorScheme:scheme});
 await context.route('https://claude.ai/**',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>:root{--cds-fill-ghost-hover:${scheme==='dark'?'#ffffff13':'#0000000d'}}body{margin:0;font:14px system-ui;background:${scheme==='dark'?'#1f1e1d':'#faf9f7'};color:${scheme==='dark'?'#eee':'#222'}}[data-testid=sidebar]{width:288px;padding:12px;box-sizing:border-box}[data-row-key]{--df-row-h:32px}.labelrow{display:flex;align-items:center;padding:0 4px 4px 10px;line-height:16px}.labelrow h3{display:flex;flex:1;min-width:0;margin:0;font:inherit}.labelrow [data-group-toggle]{display:flex;flex:1;margin:-4px 0 -4px -4px;padding:4px 0 4px 4px;height:28px;border:0;background:none;font:inherit;color:inherit}.filter{display:flex;align-items:center;justify-content:center;width:24px;height:24px;margin:-4px 0 -4px 4px;padding:0;border:0;border-radius:6px;background:none;color:inherit}.native-row a{height:32px;display:flex;align-items:center}</style><div data-testid="sidebar"><div data-row-key="label:recents"><div data-sidebar-group-label class="labelrow"><h3><button data-group-toggle><span data-group-name>Recents</span></button></h3><div><button class="filter" aria-label="Filter">≡</button></div></div></div><div class="native-row"><a href="/chat/${id('1')}">Example one</a></div></div>`}));
 await page.goto('https://claude.ai/');
 const before=(await page.locator('[data-row-key="label:recents"]').boundingBox()).height;
 await page.evaluate(()=>{globalThis.chrome={storage:{local:{get:async d=>({...d,language:'en',checkboxMode:'always'})},onChanged:{addListener(){}}},runtime:{id:'test',onMessage:{addListener(){}}}};globalThis.ChatTidyBatch={cancel(){},run(){throw Error('no chat operations');}};});
 for(const f of ['core','i18n','content'])await page.addScriptTag({path:`src/${f}.js`});
 await page.addStyleTag({path:'src/content.css'});
 const toggle=page.locator('.cs-toggle');await expect(toggle).toBeVisible();
 const t=await toggle.boundingBox(),f=await page.locator('.filter').boundingBox(),svg=await toggle.locator('svg').boundingBox();
 expect((await page.locator('[data-row-key="label:recents"]').boundingBox()).height).toBe(before);
 expect([t.width,t.height]).toEqual([24,24]);expect([svg.width,svg.height]).toEqual([16,16]);
 expect(Math.abs((t.y+t.height/2)-(f.y+f.height/2))).toBeLessThan(1);expect(Math.round(f.x-(t.x+t.width))).toBe(4);
 expect(await toggle.evaluate(n=>getComputedStyle(n).borderRadius)).toBe('6px');
 // The stylesheet lands after the script here, so let the background transition settle first.
 await expect.poll(()=>toggle.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
 await toggle.hover();await expect.poll(()=>toggle.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe(scheme==='dark'?'rgba(255, 255, 255, 0.075)':'rgba(0, 0, 0, 0.05)');
 await page.mouse.move(600,500);await expect.poll(()=>toggle.evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
});
for(const language of ['en','fr','ru','ja'])test(`filter panel labels are never cut off (${language})`,async({page,context})=>{
 await load(page,context,'claude.ai',`<div data-testid="sidebar"><div class="native-label"><div class="labelrow"><button data-group-toggle><span data-group-name>Chats and tasks</span></button></div></div><div class="native-row"><a href="/chat/${id('1')}">Example one</a></div></div><main>Outside</main>`);
 await page.evaluate(language=>change({language:{newValue:language}},'local'),language);await page.waitForTimeout(300);
 await page.locator('.cs-toggle').click();const menu=page.locator('.cs-actions');await expect(menu).toBeVisible();
 const clipped=await menu.evaluate(m=>[...m.querySelectorAll('.cs-select-buttons>.cs-button>span,.cs-run-row>.cs-button>span')].filter(s=>s.offsetParent&&s.scrollWidth>s.clientWidth+1).map(s=>s.textContent));
 expect(clipped).toEqual([]);
 const box=await menu.boundingBox();expect(box.width).toBeLessThanOrEqual(310);
});
