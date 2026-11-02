const {test,expect}=require('@playwright/test');
// Layout options on ChatGPT-shaped pages: the adapter CSS applies, focus mode hides the chrome and offers a way out.
// appShell mirrors the live app-shell DOM (2026-11): width comes from --thread-content-responsive-max-width through a transcriptContent class.
// legacy keeps the older #stage-slideover-sidebar layout, whose column reads --thread-content-max-width directly.
const shells={
 appShell:{sidebar:'aside.app-shell-left-panel',header:'[data-app-shell-main-titlebar]',body:`<aside class="app-shell-left-panel">History</aside><main data-app-shell-main-surface><div data-app-shell-main-titlebar>ChatGPT</div><div data-request-input-activity-root><div class="thread transcriptContent-x1">{text}</div></div></main>`,
  css:':root{--thread-content-responsive-max-width:48rem}.transcriptContent-x1{--thread-content-max-width:var(--thread-content-responsive-max-width,inherit);max-width:var(--thread-content-max-width)}'},
 legacy:{sidebar:'#stage-slideover-sidebar',header:'#page-header',body:`<div id="stage-slideover-sidebar">History</div><main><div id="page-header">ChatGPT</div><div class="thread [--thread-content-max-width:48rem]">{text}</div></main>`,
  css:'.thread{max-width:var(--thread-content-max-width,48rem)}'}
};
async function load(page,context,theme,shell){
 const s=shells[shell],text='<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>'.repeat(6);
 await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>body{margin:0;display:flex;height:100vh;font:14px system-ui;background:${theme==='dark'?'#212121':'#fff'};color:${theme==='dark'?'#ececec':'#0d0d0d'}}${s.sidebar}{flex:none;width:260px;background:${theme==='dark'?'#181818':'#f9f9f9'}}${s.header}{height:52px;border-bottom:1px solid #8883}main{flex:1;display:flex;flex-direction:column;min-width:0}.thread{margin:24px auto;width:100%;padding:0 16px;box-sizing:border-box}p{line-height:1.6}${s.css}</style>${s.body.replace('{text}',text)}`}));
 await page.emulateMedia({colorScheme:theme});await page.goto('https://chatgpt.com/c/11111111-1111-4111-8111-111111111111');
 await page.evaluate(theme=>{document.documentElement.dataset.csTheme=theme;globalThis.writes=[];globalThis.chrome={storage:{local:{set:async d=>{writes.push(d);}}}};},theme);
 for(const f of ['core','i18n','reader-sites','layout'])await page.addScriptTag({path:`src/${f}.js`});
 await page.evaluate(()=>{const t=key=>ChatTidyI18n.t('en',key);globalThis.layout=ChatTidyLayout.create({t,adapter:ChatTidyReaderSites.get('chatgpt')});});
 return s;
}
for(const shell of Object.keys(shells))for(const theme of ['light','dark'])test(`chat width and focus mode on a ChatGPT ${shell} page (${theme})`,async({page,context},info)=>{
 const s=await load(page,context,theme,shell);
 const width=()=>page.locator('.thread').evaluate(n=>Math.round(n.getBoundingClientRect().width));
 expect(await width()).toBe(768);
 await page.evaluate(()=>layout.update({enabled:true,chatWidth:'wide',focusMode:false}));expect(await width()).toBe(840,'wide fills the 840px chat column');
 await page.evaluate(()=>layout.update({enabled:true,chatWidth:'wide',focusMode:true}));
 await expect(page.locator(s.sidebar)).toBeHidden();await expect(page.locator(s.header)).toBeHidden();expect(await width()).toBe(1040,'without the sidebar the wide column reaches 1040px');
 const exit=page.locator('.cs-focus-exit');await expect(exit).toBeVisible();await expect(exit).toHaveText('Exit focus mode');
 const box=await exit.boundingBox(),viewport=page.viewportSize();expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y).toBeLessThan(40);
 const colors=await exit.evaluate(n=>({bg:getComputedStyle(n).backgroundColor}));expect(colors.bg).toBe(theme==='dark'?'rgb(20, 20, 20)':'rgb(255, 255, 255)');
 // A keyboard press first, so the programmatic focus shows the focus ring.
 await page.keyboard.press('Shift');await exit.focus();
 if(shell==='appShell')await page.screenshot({path:info.outputPath(`focus-${theme}.png`),animations:"disabled",clip:{x:700,y:0,width:400,height:120}});
 await exit.press('Enter');expect(await page.evaluate(()=>writes)).toEqual([{focusMode:false}]);
 await page.evaluate(()=>layout.update({enabled:true,chatWidth:'full',focusMode:false}));await expect(exit).toHaveCount(0);await expect(page.locator(s.sidebar)).toBeVisible();
 expect(await width()).toBe(Math.round((viewport.width-260)-48));
 await page.evaluate(()=>layout.update({enabled:false,chatWidth:'full'}));await expect(page.locator('#cs-layout')).toHaveCount(0);expect(await width()).toBe(768);
});
// Compact sidebar with each site's real rule, on the sidebar shells measured live (see .omc/research/reader-dom.md addendum).
const compactShells={
 gemini:{url:'https://gemini.google.com/app/9f2c4e1a7b3d5e60',css:'bard-sidenav{display:block;flex:none;--bard-sidenav-open-width:288px;--bard-sidenav-closed-width:52px;width:var(--bard-sidenav-open-width)}bard-sidenav-content{display:block;flex:1}',
  body:'<bard-sidenav><side-navigation-content>History</side-navigation-content></bard-sidenav><bard-sidenav-content><main>Chat</main></bard-sidenav-content>',sidebar:'bard-sidenav',main:'bard-sidenav-content',before:288,after:240},
 kimi:{url:'https://www.kimi.com/chat/11111111-1111-4111-8111-111111111111',css:'.app{position:relative;width:100%}.sidebar-slot{position:absolute;left:0;top:0;width:240px;height:100vh}aside.next-sidebar{width:240px}.app.has-sidebar>.main{margin-left:240px}.layout-header{height:52px}',
  body:'<div class="app has-sidebar"><div class="sidebar-slot"><aside class="sidebar next-sidebar">History</aside></div><div class="main"><div class="layout-header">Head</div>Chat</div></div>',sidebar:'aside.next-sidebar',main:'.main',before:240,after:200},
 qwen:{url:'https://chat.qwen.ai/c/11111111-1111-4111-8111-111111111111',css:'.desktop-layout{display:flex;width:100%}.sidebar-wrapper .sidebar{width:240px;max-width:240px;flex-shrink:0}.sidebar-wrapper .sidebar-collapse{width:60px}.sidebar-side{width:240px}.chat-messages{flex:1}header.header-desktop{height:48px}',
  body:'<div class="desktop-layout"><div class="sidebar-wrapper"><div class="sidebar"><div class="sidebar-side">History</div></div></div><div class="chat-messages"><header class="header-desktop">Head</header>Chat</div></div>',sidebar:'.sidebar-wrapper',main:'.chat-messages',before:240,after:200},
 zai:{url:'https://chat.z.ai/c/11111111-1111-4111-8111-111111111111',css:'.w-\\[238px\\]{width:238px}#sidebar{flex:none}.flex{display:flex}',
  body:'<div class="flex"><div id="sidebar" data-collapsed="false"><div class="flex w-[238px] shrink-0 overflow-hidden"><div class="flex w-[238px] shrink-0"><div class="AgentChatList">History</div></div></div></div><div id="chat-container" style="flex:1">Chat</div></div>',sidebar:'#sidebar',main:'#chat-container',before:238,after:200}
};
for(const [site,s] of Object.entries(compactShells))test(`compact sidebar narrows the live ${site} sidebar, and focus mode still hides it`,async({page})=>{
 await page.route(s.url.replace(/\/[^/]*\/[^/]*$/,'/**'),route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>body{margin:0;display:flex;font:14px system-ui}${s.css}</style>${s.body}`}));
 await page.goto(s.url);
 await page.evaluate(()=>{globalThis.chrome={storage:{local:{set:async()=>{}}}};});
 for(const f of ['core','i18n','reader-sites','layout'])await page.addScriptTag({path:`src/${f}.js`});
 await page.evaluate(site=>{globalThis.layout=ChatTidyLayout.create({t:k=>k,adapter:ChatTidyReaderSites.get(site)});},site);
 const width=()=>page.locator(s.sidebar).evaluate(n=>Math.round(n.getBoundingClientRect().width)),left=()=>page.locator(s.main).evaluate(n=>Math.round(n.getBoundingClientRect().left));
 expect(await width()).toBe(s.before);
 await page.evaluate(()=>layout.update({enabled:true,compactSidebar:true}));
 expect(await width()).toBe(s.after);expect(await left()).toBe(s.after);
 // Focus mode is later in the sheet, so it wins over compact: the sidebar is gone and the chat starts at the left edge.
 await page.evaluate(()=>layout.update({enabled:true,compactSidebar:true,focusMode:true}));
 await expect(page.locator(s.sidebar)).toBeHidden();expect(await left()).toBe(0);
 await page.evaluate(()=>layout.update({enabled:true,compactSidebar:false,focusMode:false}));expect(await width()).toBe(s.before);
 if(site==='qwen'){await page.locator('.sidebar').evaluate(n=>n.classList.add('sidebar-collapse'));await page.evaluate(()=>layout.update({enabled:true,compactSidebar:true}));expect(await width()).toBe(60,'the collapsed rail is left alone');}
 if(site==='zai'){await page.locator('#sidebar').evaluate(n=>n.dataset.collapsed='true');await page.evaluate(()=>layout.update({enabled:true,compactSidebar:true}));expect(await width()).toBe(238,'a collapsed sidebar is left alone');}
});
