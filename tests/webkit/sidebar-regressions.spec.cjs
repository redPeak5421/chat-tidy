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
test('Grok localized Bots in the new sidebar use the native collapse control and hide the whole section',async({page,context})=>{
 await load(page,context,'grok.com',`<div data-sidebar="sidebar"><div data-sidebar="group" id="bots"><div class="labelrow"><button aria-expanded="true"><span>机器人</span><svg></svg></button><button>+</button></div><ul><li><a href="/bot/example">Grok Bot</a></li><li><button>未分配</button><a href="/bot/other">Bot</a></li><li><button>展开</button></li></ul></div><div id="chats"><h2>聊天</h2><a href="/c/${id('1')}">Example chat</a></div></div>`);
 await page.evaluate(()=>{const b=document.querySelector('#bots button');b.onclick=()=>{const open=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(open));document.querySelector('#bots ul').hidden=!open;};change({grokCollapseBots:{newValue:true}},'local');});
 await expect(page.locator('#bots ul')).toBeHidden();await expect(page.locator('#bots button').first()).toHaveAttribute('aria-expanded','false');
 await page.locator('#bots button').first().click();await expect(page.locator('#bots ul')).toBeVisible();
 await page.evaluate(()=>change({grokHideBots:{newValue:true}},'local'));await expect(page.locator('#bots')).toBeHidden();await expect(page.locator('#chats')).toBeVisible();
 await page.evaluate(()=>change({enabled:{newValue:false}},'local'));await expect(page.locator('#bots')).toBeVisible();await expect(page.locator('#bots ul')).toBeVisible();
});
