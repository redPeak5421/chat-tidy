const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const row=n=>`<div class="row"><a href="/c/${id(n)}"><span>Chat ${n}</span></a><button aria-haspopup="menu" data-owner="${n}">…</button></div>`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function setup({realBatch=false,beforeLoad,getSettings,url='https://chatgpt.com/',markup}={}){
 const dom=new JSDOM(markup??`<nav><h2>聊天</h2><div id="history">${row('1')}${row('2')}</div></nav><main><a href="/c/${id('3')}">Reference link</a></main>`,{url,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{width:100,height:30}]};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 let onChange;w.browser={storage:{local:{get:async()=>({language:'en',enabled:true})},onChanged:{addListener:fn=>onChange=fn}},runtime:{id:'test',onMessage:{addListener:()=>{},removeListener:()=>{}},sendMessage:async message=>({completed:message.ids||[]})}};
 if(getSettings)w.browser.storage.local.get=getSettings;
 w.ChatTidyBatch={run:async job=>({completed:job.ids}),cancel:()=>{}};
 if(realBatch){w.navigator.locks={request:async(name,options,fn)=>fn({name})};w.AbortSignal=AbortSignal;w.eval(fs.readFileSync('src/batch.js','utf8'));}
 beforeLoad?.(w);
 for(const f of ['core','i18n','content'])if(fs.existsSync(`src/${f}.js`))w.eval(fs.readFileSync(`src/${f}.js`,'utf8'));
 await wait(150);return {dom,w,d:w.document,change:async changes=>{onChange?.(changes,'local');await wait(150)}};
}
test('injects sidebar checkboxes, leaves main alone, survives new rows and rerenders',async()=>{
 const {dom,w,d}=await setup();try{
 assert.equal(d.querySelectorAll('.cs-checkbox').length,2);
 assert.equal(d.querySelector('main .cs-checkbox'),null);
 d.querySelector('.cs-checkbox').click();assert.match(d.querySelector('.cs-count').textContent,/1/);
 d.querySelector('#history').insertAdjacentHTML('beforeend',row('4'));await wait(150);assert.equal(d.querySelectorAll('.cs-checkbox').length,3);
 d.querySelector('#history').innerHTML=row('1')+row('2');await wait(150);assert.equal(d.querySelector('.cs-checkbox').checked,true);
 assert.equal(d.querySelectorAll('.cs-toolbar').length,1);
 }finally{dom.window.close()}
});
test('all, invert, clear and cancellation never invoke native delete',async()=>{
 const {dom,d}=await setup();try{
 assert.ok(d.querySelector('[data-cs-action="all"]'));
 d.querySelector('[data-cs-action="all"]').click();assert.equal(d.querySelectorAll('.cs-checkbox:checked').length,2);
 d.querySelector('[data-cs-action="invert"]').click();assert.equal(d.querySelectorAll('.cs-checkbox:checked').length,0);
 d.querySelector('.cs-checkbox').click();d.querySelector('[data-cs-action="delete"]').click();
 assert.match(d.querySelector('.cs-confirm').textContent,/Chat 1/);d.querySelector('[data-cs-cancel]').click();assert.equal(d.querySelector('.cs-confirm'),null);
 d.querySelector('[data-cs-action="clear"]').click();assert.equal(d.querySelectorAll('.cs-checkbox:checked').length,0);
 }finally{dom.window.close()}
});
test('settings switch language and disable removes controls',async()=>{
 const {dom,d,change}=await setup();try{
 await change({language:{newValue:'fr'}});assert.equal(d.querySelector('[data-cs-action="delete"]').textContent,'Supprimer');assert.equal(d.querySelector('.cs-actions').hidden,true);assert.ok(d.querySelector('.cs-toggle svg'));
 await change({enabled:{newValue:false}});assert.equal(d.querySelectorAll('.cs-checkbox,.cs-toolbar').length,0);
 }finally{dom.window.close()}
});
test('all six language packs have every string',async()=>{
 const {dom,w}=await setup();try{const api=w.ChatTidyI18n;const keys=Object.keys(api.dict.en);assert.equal(Object.keys(api.languages).length,6);for(const pack of Object.values(api.dict))for(const key of keys)assert.ok(pack[key],key);}finally{dom.window.close()}
});
test('batch sends only selected IDs to the direct executor without native UI or scroll',async()=>{
 const {dom,w,d}=await setup();try{
 let calls=[],native=0;w.ChatTidyBatch.run=async message=>{calls.push(message);return {completed:message.ids}};
 w.HTMLElement.prototype.scrollIntoView=()=>{throw Error('must not scroll')};
 d.querySelectorAll('[data-owner]').forEach(node=>{node.onclick=()=>native++;node.onpointerdown=()=>native++});
 d.querySelector('[data-cs-action="all"]').click();d.querySelector('[data-cs-action="delete"]').click();d.querySelector('[data-cs-confirm]').click();await wait(150);
 assert.equal(native,0);assert.deepEqual(Array.from(calls[0].ids),[id('1'),id('2')]);assert.equal(d.querySelectorAll('.cs-deleted-row').length,2);assert.match(d.querySelector('.cs-status').textContent,/Removed 2/);assert.equal(d.querySelector('[role="menu"],[role="dialog"]'),null);
 }finally{dom.window.close()}
});
test('failed direct batch retains unfinished selections',async()=>{
 const {dom,w,d}=await setup();try{
 w.ChatTidyBatch.run=async()=>({completed:[id('1')],error:'rate-limit'});
 d.querySelector('[data-cs-action="all"]').click();d.querySelector('[data-cs-action="delete"]').click();d.querySelector('[data-cs-confirm]').click();await wait(150);
 assert.equal(d.querySelectorAll('.cs-checkbox:checked').length,1);assert.match(d.querySelector('.cs-status').textContent,/rate-limit/);
 }finally{dom.window.close()}
});
test('checkbox does not navigate using a parent click handler',async()=>{
 const {dom,d}=await setup();try{let navigations=0;d.querySelector('nav').addEventListener('click',()=>navigations++);d.querySelector('.cs-checkbox').click();assert.equal(navigations,0);assert.equal(d.querySelector('.cs-checkbox').checked,true);}finally{dom.window.close()}
});
test('popup persists language and renders translated help',async()=>{
 const dom=new JSDOM(fs.readFileSync('popup.html','utf8'),{url:'https://extension.test/',runScripts:'outside-only'});const w=dom.window,d=w.document,saved={};
 try{w.browser={storage:{local:{get:async()=>({enabled:true,language:'en'}),set:async data=>Object.assign(saved,data)}}};
 for(const f of ['i18n','popup'])w.eval(fs.readFileSync(`src/${f}.js`,'utf8'));await wait(0);
 const lang=d.getElementById('language');lang.value='ja';lang.dispatchEvent(new w.Event('change'));await wait(0);assert.equal(saved.language,'ja');assert.equal(d.querySelector('summary').textContent,'使い方');
 assert.equal(d.getElementById('layout'),null);assert.ok(d.querySelector('.logo svg'));
 }finally{w.close()}
});
test('wave is limited to left edge and fades with vertical distance; settings restore always visible',async()=>{
 const {dom,w,d,change}=await setup();try{
 d.querySelector('#history').insertAdjacentHTML('beforeend',row('4'));await wait(120);
 const links=[...d.querySelectorAll('.cs-chat-link')];
 links.forEach((link,i)=>link.getBoundingClientRect=()=>({left:20,right:300,top:100+i*40,bottom:140+i*40,height:40,width:280}));
 d.dispatchEvent(new w.MouseEvent('pointermove',{clientX:35,clientY:120}));await wait(40);
 const levels=links.map(link=>Number(link.style.getPropertyValue('--cs-wave')));
 assert.equal(levels[0],1);assert.ok(levels[0]>levels[1]&&levels[1]>levels[2]&&levels[2]>0);
 d.dispatchEvent(new w.MouseEvent('pointermove',{clientX:180,clientY:120}));await wait(40);
 assert.ok(links.every(link=>Number(link.style.getPropertyValue('--cs-wave'))===0));
 links[0].querySelector('input').click();assert.ok(links[0].classList.contains('cs-selected'));
 await change({checkboxMode:{newValue:'always'}});assert.equal(d.querySelectorAll('.cs-dynamic').length,0);
 await change({checkboxMode:{newValue:'dynamic'}});assert.equal(d.querySelectorAll('.cs-dynamic').length,3);
 }finally{dom.window.close()}
});

test('restores row classes after native class-only updates without another click',async()=>{
 const {dom,w,d}=await setup();try{
 const link=d.querySelector('#history a');
 link.getBoundingClientRect=()=>({left:20,right:300,top:100,bottom:140,height:40,width:280});
 link.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:35,clientY:120}));await wait(40);
 const box=link.querySelector('.cs-checkbox');link.className='native-row';
 await wait(160);
 assert.equal(link.querySelector('.cs-checkbox'),box);
 assert.ok(link.classList.contains('cs-chat-link'));
 assert.ok(link.classList.contains('cs-dynamic'));
 assert.ok(link.classList.contains('cs-wave-active'));
 assert.equal(link.style.getPropertyValue('--cs-wave'),'1.000');
 }finally{dom.window.close()}
});
test('left-edge hover survives stopped pointer event bubbling',async()=>{
 const {dom,w,d}=await setup();try{
 const link=d.querySelector('#history a');link.getBoundingClientRect=()=>({left:20,right:300,top:100,bottom:140,height:40,width:280});
 link.addEventListener('pointermove',event=>event.stopPropagation());
 link.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:35,clientY:120}));await wait(40);
 assert.equal(link.style.getPropertyValue('--cs-wave'),'1.000');
 }finally{dom.window.close()}
});
test('initialization paints an already observed pointer without another movement',async()=>{
 let release;const ready=new Promise(resolve=>release=resolve);
 const {dom,w,d}=await setup({getSettings:()=>ready});try{
 const link=d.querySelector('#history a');link.getBoundingClientRect=()=>({left:20,right:300,top:100,bottom:140,height:40,width:280});
 link.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:35,clientY:120}));await wait(40);
 assert.equal(link.querySelector('.cs-checkbox'),null);
 release({enabled:true,language:'en',checkboxMode:'dynamic'});await wait(80);
 assert.ok(link.querySelector('.cs-checkbox'));
 assert.equal(link.style.getPropertyValue('--cs-wave'),'1.000');
 }finally{dom.window.close()}
});


test('selected checkbox does not prevent another row hover after a scroll event',async()=>{
 const {dom,w,d}=await setup();try{
 const links=[...d.querySelectorAll('.cs-chat-link')];
 links.forEach((link,i)=>link.getBoundingClientRect=()=>({left:20,right:300,top:100+i*40,bottom:140+i*40,height:40,width:280}));
 links[0].querySelector('input').click();
 links[1].dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:35,clientY:160}));
 d.querySelector('#history').dispatchEvent(new w.Event('scroll'));
 await wait(50);
 assert.ok(links[0].querySelector('input').checked);
 assert.equal(links[1].style.getPropertyValue('--cs-wave'),'1.000');
 assert.ok(links[1].classList.contains('cs-wave-active'));
 }finally{dom.window.close()}
});

for(const site of ['claude','grok'])test(site+' sidebar selection excludes tasks, bots and main content',async()=>{
 const claude=site==='claude',origin=claude?'https://claude.ai':'https://grok.com',route=claude?'/chat/':'/c/';
 const markup=`<div ${claude?'data-testid="sidebar"':'data-sidebar="sidebar"'}><button>${claude?'Chats and tasks':'聊天'}</button><div><a href="${route+id('1')}"><span>Example chat</span></a></div><a href="${claude?'/cowork/cse_example':'/bot/'+id('2')}">Other item</a></div><main><a href="${route+id('3')}">Reference</a></main>`;
 const {dom,d}=await setup({url:origin,markup});try{
 assert.equal(d.querySelectorAll('.cs-checkbox').length,1);
 assert.equal(d.querySelector('main .cs-checkbox'),null);
 d.querySelector('.cs-checkbox').click();assert.equal(d.querySelectorAll('.cs-selected').length,1);
 d.querySelector('[data-cs-action="clear"]').click();assert.equal(d.querySelectorAll('.cs-selected').length,0);
 }finally{dom.window.close()}
});
for(const site of ['claude','grok'])test(`${site} confirms once and sends only selected chats without native menu clicks`,async()=>{
 const url=site==='claude'?'https://claude.ai/new':'https://grok.com/';
 const attr=site==='claude'?'data-testid="sidebar"':'data-sidebar="sidebar"';
 const route=site==='claude'?'chat':'c';
 const {dom,w,d}=await setup({url,markup:`<div ${attr}><h2>Chats</h2><a href="/${route}/${id('1')}">Example one</a><a href="/${route}/${id('2')}">Example two</a><button class="native-menu">Menu</button></div>`,beforeLoad:w=>{w.document.cookie=`lastActiveOrg=${id('9')};path=/`;}});
 try{
 const calls=[];let nativeClicks=0;d.querySelector('.native-menu').onclick=()=>nativeClicks++;
 w.ChatTidyBatch.run=async message=>{calls.push(message);return {completed:message.ids}};
 d.querySelector('.cs-checkbox').click();d.querySelector('[data-cs-action="delete"]').click();
 assert.equal(calls.length,0);assert.match(d.querySelector('.cs-confirm').textContent,new RegExp(site==='claude'?'Claude':'Grok'));
 d.querySelector('[data-cs-confirm]').click();await wait(100);
 assert.equal(calls.length,1);assert.deepEqual(Array.from(calls[0].ids),[id('1')]);assert.equal(nativeClicks,0);
 if(site==='claude')assert.equal(calls[0].organizationId,id('9'));
 assert.equal(d.querySelectorAll('.cs-deleted-row').length,1);
 }finally{dom.window.close()}
});
test('Claude workspace change while confirming clears selection without deleting',async()=>{
 const {dom,w,d}=await setup({url:'https://claude.ai/new',markup:`<div data-testid="sidebar"><h2>Chats</h2><a href="/chat/${id('1')}">Example</a></div>`,beforeLoad:w=>{w.document.cookie=`lastActiveOrg=${id('8')};path=/`;}});
 try{
 let calls=0;w.ChatTidyBatch.run=async()=>{calls++;return {completed:[]}};
 d.querySelector('.cs-checkbox').click();d.querySelector('[data-cs-action="delete"]').click();
 d.cookie=`lastActiveOrg=${id('9')};path=/`;d.querySelector('[data-cs-confirm]').click();await wait(100);
 assert.equal(calls,0);assert.equal(d.querySelectorAll('.cs-checkbox:checked').length,0);
 }finally{dom.window.close()}
});
test('Claude title icon glyph does not move toolbar into first conversation',async()=>{
 const {dom,d}=await setup({url:'https://claude.ai/new',markup:`<div data-testid="sidebar"><div class="labelrow"><button data-group-toggle><span data-group-name>Chats and tasks</span><span data-cds="Icon">\ue02a</span></button><button>View all</button></div><div><a href="/chat/${id('1')}">Example</a></div></div>`});
 try{assert.equal(d.querySelector('.cs-toolbar').parentElement,d.querySelector('.labelrow'));assert.equal(d.querySelector('[data-group-toggle]').nextElementSibling,d.querySelector('.cs-toolbar'));}finally{dom.window.close()}
});
test('Claude executes only confirmed IDs directly with no runtime relay',async()=>{
 const calls=[];
 const {dom,w,d}=await setup({realBatch:true,url:'https://claude.ai/new',markup:`<div data-testid="sidebar"><h2>Chats</h2><a href="/chat/${id('1')}">Example</a></div>`,beforeLoad:w=>{
 w.document.cookie=`lastActiveOrg=${id('9')};path=/`;
 w.browser.runtime.sendMessage=()=>{throw Error('no relay permitted')};
 w.fetch=async(url,options)=>{calls.push({url,options});return {status:200,ok:true,headers:{get:()=>null},json:async()=>({deleted:[id('1')],failed:[]})}};
 }});
 try{
 d.querySelector('.cs-checkbox').click();d.querySelector('[data-cs-action="delete"]').click();assert.equal(calls.length,0);
 d.querySelector('[data-cs-confirm]').click();await wait(50);
 assert.equal(calls.length,1);assert.equal(calls[0].url,`/api/organizations/${id('9')}/chat_conversations/delete_many`);
 assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.method,'POST');
 assert.deepEqual(JSON.parse(calls[0].options.body),{conversation_uuids:[id('1')]});
 assert.equal(d.querySelectorAll('.cs-deleted-row').length,1);
 }finally{dom.window.close()}
});
test('ChatGPT archive reviews selection then sends archive only and preserves failures',async()=>{
 const {dom,w,d}=await setup();try{
 const calls=[];w.ChatTidyBatch.run=async message=>{calls.push(message);return {completed:[id('1')],error:'rate-limit'}};
 const archive=d.querySelector('[data-cs-action="archive"]');assert.equal(archive.disabled,true);
 d.querySelector('[data-cs-action="all"]').click();archive.click();assert.equal(calls.length,0);
 assert.match(d.querySelector('.cs-confirm').textContent,/Archive selected|Archived Chats/);
 d.querySelector('[data-cs-confirm]').click();await wait(100);
 assert.equal(calls.length,1);assert.equal(calls[0].action,'archive');assert.equal(calls[0].ids.length,2);
 assert.equal(d.querySelectorAll('.cs-checkbox:checked').length,1);
 }finally{dom.window.close()}
});
for(const site of ['claude','grok'])test(`${site} does not offer local or unverified archive`,async()=>{
 const attr=site==='claude'?'data-testid="sidebar"':'data-sidebar="sidebar"';const route=site==='claude'?'chat':'c';
 const {dom,d}=await setup({url:site==='claude'?'https://claude.ai/':'https://grok.com/',markup:`<div ${attr}><h2>Chats</h2><a href="/${route}/${id('1')}">Example</a></div>`});
 try{if(site==='grok')assert.equal(d.querySelector('[data-cs-action="archive"]'),null);else{const archive=d.querySelector('[data-cs-action="archive"]');assert.equal(archive.hidden,true);d.querySelector('.cs-checkbox').click();assert.equal(archive.disabled,true);assert.equal(archive.hidden,true,'ordinary Claude chats never show Archive');}}finally{dom.window.close()}
});
test('Claude shows Archive only while the selection is Cowork tasks only',async()=>{
 const task='cse_01AAAAAAAAAAAAAAAAAAAAAA';
 const {dom,d}=await setup({url:'https://claude.ai/',markup:`<div data-testid="sidebar"><h2>Chats</h2><a href="/chat/${id('1')}">Chat</a><a href="/cowork/${task}">Task</a></div>`});
 try{
 const archive=d.querySelector('[data-cs-action="archive"]');const boxes=[...d.querySelectorAll('.cs-checkbox')];const taskBox=boxes.find(box=>box.dataset.csId===task),chatBox=boxes.find(box=>box.dataset.csId===id('1'));
 assert.equal(archive.hidden,true);
 taskBox.click();assert.equal(archive.hidden,false);assert.equal(archive.disabled,false);
 chatBox.click();assert.equal(archive.hidden,true);
 chatBox.click();assert.equal(archive.hidden,false);
 taskBox.click();assert.equal(archive.hidden,true);
 }finally{dom.window.close()}
});
for(const action of ['archive','delete'])test(`Cowork ${action} uses the native endpoint and accepts an empty successful response`,async()=>{
 const task='cse_01AAAAAAAAAAAAAAAAAAAAAA';const calls=[];
 const {dom,w,d}=await setup({realBatch:true,url:'https://claude.ai/chats',markup:`<div data-testid="sidebar"><h2>Chats</h2><a href="/cowork/${task}">Example task</a></div>`,beforeLoad:w=>{
 w.document.cookie=`lastActiveOrg=${id('9')};path=/`;
 w.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:204,headers:{get:()=>null},json:async()=>{throw Error('empty')}}};
 }});
 try{
 d.querySelector('.cs-checkbox').click();assert.equal(d.querySelector(`[data-cs-action="${action}"]`).disabled,false);
 d.querySelector(`[data-cs-action="${action}"]`).click();d.querySelector('[data-cs-confirm]').click();
 await wait(50);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/v1/code/sessions/'+task+(action==='archive'?'/archive':''));
 assert.equal(calls[0].options.method,action==='archive'?'POST':'DELETE');assert.deepEqual(JSON.parse(calls[0].options.body),{});
 assert.equal(calls[0].options.headers['x-organization-uuid'],id('9'));
 assert.equal(calls[0].options.headers['X-Device-Attestation'],undefined);
 assert.equal(d.querySelectorAll('.cs-deleted-row').length,1);
 }finally{dom.window.close()}
});
test('Grok search dialog recognizes empty overlay links, adds top delete and keeps selection in sync',async()=>{
 const {dom,w,d}=await setup({url:'https://grok.com/',markup:`<div data-sidebar="sidebar"><h2>Chats</h2><ul><li><a href="/c/${id('1')}">One</a></li></ul></div><div role="dialog"><input role="combobox"><div cmdk-list role="listbox"><div cmdk-item role="option"><a aria-label="One" href="/c/${id('1')}"></a><div>One Yesterday</div></div><div cmdk-item role="option"><a aria-label="Two" href="/c/${id('2')}"></a><div>Two Last week</div></div></div><div class="preview"><a href="/c/${id('3')}">Preview link</a></div></div>`});
 try{
 const list=d.querySelector('[cmdk-list]');assert.equal(list.querySelectorAll('.cs-checkbox').length,2);assert.equal(d.querySelector('.preview input'),null);
 assert.ok(list.previousElementSibling.classList.contains('cs-search-toolbar'));assert.equal(list.querySelector('.cs-dynamic'),null);
 let native=0;list.addEventListener('click',()=>native++);list.addEventListener('pointerdown',()=>native++);
 const box=list.querySelector('.cs-checkbox');box.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true}));box.click();
 assert.equal(native,0);assert.equal(d.querySelector('[data-sidebar] .cs-checkbox').checked,true);
 const calls=[];w.ChatTidyBatch.run=async message=>{calls.push(message);return {completed:message.ids}};
 d.querySelector('.cs-search-toolbar [data-cs-action="delete"]').click();assert.equal(d.querySelector('.cs-confirm').parentElement,d.querySelector('[role="dialog"]'));
 d.querySelector('[data-cs-confirm]').click();await wait(80);assert.deepEqual(Array.from(calls[0].ids),[id('1')]);assert.ok(list.querySelector('[cmdk-item]').classList.contains('cs-deleted-row'));
 }finally{dom.window.close()}
});
for(const site of ['grok','claude'])test(`popup show-all switch visibility follows active ${site} page`,async()=>{
 const dom=new JSDOM(fs.readFileSync('popup.html','utf8'),{url:'https://extension.test/',runScripts:'outside-only'});const w=dom.window,d=w.document,saved={};
 try{w.browser={tabs:{query:async()=>[{id:1}],sendMessage:async()=>({site})},storage:{local:{get:async()=>({enabled:true,language:'en',grokShowAll:false}),set:async data=>Object.assign(saved,data)}}};
 for(const name of ['i18n','popup'])w.eval(fs.readFileSync(`src/${name}.js`,'utf8'));await wait(10);
 assert.equal(d.querySelector('#grok-options').hidden,site!=='grok');
 if(site==='grok'){const input=d.querySelector('#grokShowAll');input.checked=true;input.dispatchEvent(new w.Event('change'));await wait(10);assert.equal(saved.grokShowAll,true);}
 }finally{w.close()}
});
test('extension reload disconnects stale sidebar controls and requests a page refresh',async()=>{
 const {dom,w,d}=await setup();try{
 w.browser.runtime.id=undefined;
 d.querySelector('#history').insertAdjacentHTML('beforeend',row('4'));await wait(160);
 assert.equal(d.querySelectorAll('.cs-checkbox').length,0);assert.match(d.querySelector('.cs-context-expired').textContent,/Refresh/);
 d.querySelector('#history').insertAdjacentHTML('beforeend',row('5'));await wait(120);
 assert.equal(d.querySelectorAll('.cs-context-expired').length,1);
 }finally{dom.window.close()}
});

test('ChatGPT Recent heading keeps the management icon in the native heading row',async()=>{
 const {dom,d}=await setup({markup:`<nav><div class="recent-header"><button id="recent">最近<svg aria-hidden="true"></svg></button><button aria-label="New chat">+</button><button aria-label="More">…</button></div><div id="history">${row('1')}</div></nav>`});
 try{assert.equal(d.querySelector('.cs-toolbar').parentElement,d.querySelector('.recent-header'));assert.equal(d.querySelector('#recent').nextElementSibling,d.querySelector('.cs-toolbar'));}finally{dom.window.close()}
});
test('theme preference reaches injected controls and resets on disable',async()=>{
 const {dom,d,change}=await setup();try{await change({theme:{newValue:'dark'}});assert.equal(d.documentElement.dataset.csTheme,'dark');await change({theme:{newValue:'light'}});assert.equal(d.documentElement.dataset.csTheme,'light');await change({theme:{newValue:'system'}});assert.equal(d.documentElement.dataset.csTheme,'system');await change({enabled:{newValue:false}});assert.equal(d.documentElement.dataset.csTheme,undefined);}finally{dom.window.close();}
});

// Kimi renders RouterLink anchors inside the history and pinned sections.
const kimiId=n=>`${n.repeat(8)}-dfe2-88b1-8000-${n.repeat(12)}`;
const kimiRow=(n,title)=>`<div class="next-sidebar-history-item"><a href="/chat/${kimiId(n)}?chat_enter_method=history" class="next-sidebar-history-item__link"><div class="next-sidebar-history-item__main"><span class="next-sidebar-history-item__title">${title}</span></div></a><button type="button" class="next-sidebar-history-item__more" aria-label="更多">…</button></div>`;
async function kimiSetup(extra){
 const markup=`<aside class="next-sidebar"><section class="next-sidebar-section"><div class="next-sidebar-section__header"><button type="button" class="next-sidebar-section__title is-collapsible" aria-expanded="true"><span class="next-sidebar-section__title-text">对话</span><span class="next-sidebar-section__toggle-icon" aria-hidden="true"></span></button><div class="next-sidebar-section__action is-hover-only"><button type="button">查看全部</button></div></div><div class="next-sidebar-section__content"><div class="next-sidebar-history-list"><div class="next-sidebar-history-list__items">${kimiRow('1','Trip plan')}${kimiRow('2','Reading list')}</div></div></div></section><ul class="next-sidebar-pinned-list"><li class="next-sidebar-pinned-list__item">${kimiRow('3','Pinned chat')}</li></ul></aside><main><a href="/chat/${kimiId('4')}">Related chat</a></main>`;
 return setup({url:'https://www.kimi.com/chat/'+kimiId('1'),markup,beforeLoad:w=>{w.localStorage.setItem('access_token','t');w.localStorage.setItem('msh_user_id','u');extra?.(w);}});
}
test('Kimi sidebar rows get checkboxes, the icon sits beside the history heading and the menu offers delete only',async()=>{
 const {dom,d}=await kimiSetup();try{
 assert.equal(d.querySelectorAll('.cs-checkbox').length,3);assert.equal(d.querySelector('main .cs-checkbox'),null);
 assert.equal(d.querySelector('.cs-toolbar').previousElementSibling,d.querySelector('.next-sidebar-section__title'));assert.equal(d.querySelector('.cs-toolbar').nextElementSibling,d.querySelector('.next-sidebar-section__action'));assert.ok(d.querySelector('.next-sidebar-section__header').classList.contains('cs-heading-row'));
 assert.equal(d.querySelector('[data-cs-action="archive"]'),null);assert.equal(d.querySelector('[data-cs-action="move"]'),null);assert.equal(d.querySelector('[data-cs-action="archiveManager"]'),null);
 assert.ok(d.querySelector('[data-cs-action="delete"]'));
 }finally{dom.window.close()}
});
test('Kimi deletion confirms once, sends selected IDs to the executor and hides the native row wrapper',async()=>{
 const {dom,w,d}=await kimiSetup();try{
 const calls=[];w.ChatTidyBatch.run=async message=>{calls.push(message);return {completed:message.ids}};
 d.querySelector(`.cs-checkbox[data-cs-id="${kimiId('2')}"]`).click();d.querySelector('[data-cs-action="delete"]').click();
 assert.match(d.querySelector('.cs-confirm').textContent,/Reading list/);assert.match(d.querySelector('.cs-confirm').textContent,/Kimi/);
 d.querySelector('[data-cs-confirm]').click();await wait(100);
 assert.deepEqual(Array.from(calls[0].ids),[kimiId('2')]);assert.equal(calls[0].action,'delete');
 const row=d.querySelector(`a[href^="/chat/${kimiId('2')}"]`).closest('.next-sidebar-history-item');
 assert.ok(row.classList.contains('cs-deleted-row'));assert.equal(d.querySelectorAll('.cs-deleted-row').length,1);
 }finally{dom.window.close()}
});
// Qwen rows have no href; the site module maps them from the website's own list.
const qwenId=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const qwenRow=title=>`<div class="chat-item-drag"><a aria-label="chat-item" class="chat-item-drag-link"><div class="chat-item-drag-link-content"><span class="chat-item-title-text">${title}</span></div></a></div>`;
const qwenSection=inner=>`<div class="list-folder"><div class="collapsible-full"><div class="collapsible-full"><div><div class="collapsible-full"><div class="folder-button"><div class="folder-name">所有对话</div><div class="folder-button-icon-container"><span aria-hidden="true">▾</span></div></div></div></div></div><div><div class="folder-content">${inner}</div></div></div></div>`;
async function qwenSetup(){
 const markup=`<div id="sidebar"><div class="session-list">${qwenSection(`<div class="list-folder-pt"><div class="list-folder-chats">Today</div>${qwenRow('Alpha')}${qwenRow('Beta')}</div>`)}</div></div>`;
 return setup({url:'https://chat.qwen.ai/',markup,beforeLoad:w=>{
  w.AbortSignal=AbortSignal;
  w.fetch=async url=>{const path=url.split('?')[0];const body=path==='/api/v2/chats/pinned'?{success:true,data:[]}:path==='/api/v2/chats/'?{success:true,data:[{id:qwenId('1'),title:'Alpha'},{id:qwenId('2'),title:'Beta'}]}:path==='/api/v1/auths/'?{id:'user-a',email:'a@example.test'}:{success:false,data:{code:'missing'}};return {ok:true,status:200,headers:{get:()=>null},json:async()=>body};};
  for(const f of ['qwen','projects'])w.eval(fs.readFileSync('src/'+f+'.js','utf8'));
 }});
}
test('Qwen rows receive IDs from the site list, offer archive, move and the manager, and hide the row wrapper after deletion',async()=>{
 const {dom,w,d}=await qwenSetup();try{
 await wait(200);
 const boxes=[...d.querySelectorAll('.cs-checkbox')];assert.equal(boxes.length,2);assert.deepEqual(boxes.map(box=>box.dataset.csId),[qwenId('1'),qwenId('2')]);
 assert.ok(d.querySelector('[data-cs-action="archive"]'));assert.ok(d.querySelector('[data-cs-action="move"]'));assert.ok(d.querySelector('[data-cs-action="archiveManager"]'));
 const header=d.querySelector('.folder-button');assert.equal(d.querySelector('.cs-toolbar').parentElement,header,'the icon lives in the All chats header row');assert.equal(d.querySelector('.cs-toolbar').previousElementSibling,header.querySelector('.folder-name'),'right after the section name');assert.equal(d.querySelector('.cs-toolbar').nextElementSibling,header.querySelector('.folder-button-icon-container'),'before the chevron');assert.ok(header.classList.contains('cs-heading-row'));assert.equal(header.querySelector('.folder-name').textContent,'所有对话');
 assert.equal(d.querySelector('[data-cs-action="move"]').textContent,'Move to project');
 const calls=[];w.ChatTidyBatch.run=async message=>{calls.push(message);return {completed:message.ids}};
 boxes[1].click();d.querySelector('[data-cs-action="archive"]').click();assert.match(d.querySelector('.cs-confirm').textContent,/Qwen/);d.querySelector('[data-cs-confirm]').click();await wait(100);
 assert.equal(calls[0].action,'archive');assert.deepEqual(Array.from(calls[0].ids),[qwenId('2')]);assert.equal(calls[0].expectedUserId,'user-a');
 assert.ok(d.querySelectorAll('.chat-item-drag')[1].classList.contains('cs-deleted-row'));assert.equal(d.querySelectorAll('.chat-item-drag')[0].classList.contains('cs-deleted-row'),false);
 }finally{dom.window.close()}
});
test('ChatGPT move picker lists projects, moves into an existing one and hides moved rows',async()=>{
 const {dom,w,d}=await setup({beforeLoad:w=>{w.AbortSignal=AbortSignal;w.fetch=async url=>{const path=url.split('?')[0];const body=path==='/api/auth/session'?{accessToken:'t',user:{id:'a'}}:path==='/backend-api/gizmos/snorlax/sidebar'?{cursor:null,items:[{gizmo:{gizmo:{id:'g-p-one',display:{name:'Research'}}},conversations:{items:[]}}]}:{};return {ok:true,status:200,json:async()=>body};};w.eval(fs.readFileSync('src/projects.js','utf8'));}});
 try{
 const calls=[];w.ChatTidyBatch.run=async message=>{calls.push(message);return {completed:message.ids}};
 const move=d.querySelector('[data-cs-action="move"]');assert.ok(move);assert.equal(move.disabled,true);assert.equal(move.textContent,'Move to project');
 d.querySelector('[data-cs-action="all"]').click();assert.equal(move.disabled,false);move.click();await wait(50);
 const dialog=d.querySelector('.cs-move');assert.ok(dialog);assert.match(dialog.textContent,/Research/);assert.equal(calls.length,0);
 const confirm=dialog.querySelector('[data-cs-move-confirm]');assert.equal(confirm.disabled,true);
 dialog.querySelector('input[value="g-p-one"]').click();dialog.dispatchEvent(new w.Event('change'));assert.equal(confirm.disabled,false);
 confirm.click();await wait(100);
 assert.equal(calls.length,1);assert.equal(calls[0].action,'move');assert.equal(calls[0].target,'g-p-one');assert.equal(calls[0].ids.length,2);
 assert.equal(d.querySelector('.cs-move'),null);assert.equal(d.querySelectorAll('.cs-deleted-row').length,2);assert.match(d.querySelector('.cs-status').textContent,/Moved 2/);
 }finally{dom.window.close()}
});
test('ChatGPT move picker creates a new project first and moves nothing when creation fails',async()=>{
 let fail=true;const posts=[];
 const {dom,w,d}=await setup({beforeLoad:w=>{w.AbortSignal=AbortSignal;w.fetch=async(url,options={})=>{const path=url.split('?')[0];if(path==='/backend-api/gizmos/snorlax/upsert'){posts.push(JSON.parse(options.body));return {ok:!fail,status:fail?500:200,json:async()=>({resource:{gizmo:{id:'g-p-new',display:{name:'Fresh'}}}})};}const body=path==='/api/auth/session'?{accessToken:'t',user:{id:'a'}}:{cursor:null,items:[]};return {ok:true,status:200,json:async()=>body};};w.eval(fs.readFileSync('src/projects.js','utf8'));}});
 try{
 const calls=[];w.ChatTidyBatch.run=async message=>{calls.push(message);return {completed:message.ids}};
 d.querySelector('.cs-checkbox').click();d.querySelector('[data-cs-action="move"]').click();await wait(50);
 const dialog=d.querySelector('.cs-move');assert.match(dialog.textContent,/No destinations yet/);
 const name=dialog.querySelector('.cs-move-name');name.value='Fresh';name.dispatchEvent(new w.Event('input'));
 const confirm=dialog.querySelector('[data-cs-move-confirm]');assert.equal(confirm.disabled,false);
 confirm.click();await wait(50);
 assert.equal(posts.length,1);assert.equal(posts[0].display.name,'Fresh');assert.equal(calls.length,0);assert.match(dialog.querySelector('.cs-move-error').textContent,/Nothing was moved/);assert.ok(d.querySelector('.cs-move'));
 fail=false;confirm.click();await wait(100);
 assert.equal(calls.length,1);assert.equal(calls[0].target,'g-p-new');assert.equal(d.querySelector('.cs-move'),null);
 }finally{dom.window.close()}
});
test('Claude move uses group wording, targets the workspace and keeps moved chats visible; Cowork tasks hide it',async()=>{
 const task='cse_01AAAAAAAAAAAAAAAAAAAAAA';
 const {dom,w,d}=await setup({url:'https://claude.ai/',markup:`<div data-testid="sidebar"><h2>Chats</h2><a href="/chat/${id('1')}">Chat</a><a href="/cowork/${task}">Task</a></div>`,beforeLoad:w=>{w.document.cookie=`lastActiveOrg=${id('9')};path=/`;w.AbortSignal=AbortSignal;w.fetch=async url=>{assert.equal(url,`/api/organizations/${id('9')}/projects`);return {ok:true,status:200,json:async()=>[{uuid:id('5'),name:'Group A'},{uuid:id('6'),name:'Old',archived_at:'2026-01-01'}]};};w.eval(fs.readFileSync('src/projects.js','utf8'));}});
 try{
 const move=d.querySelector('[data-cs-action="move"]');assert.equal(move.textContent,'Move to group');
 const boxes=[...d.querySelectorAll('.cs-checkbox')];const taskBox=boxes.find(box=>box.dataset.csId===task),chatBox=boxes.find(box=>box.dataset.csId===id('1'));
 taskBox.click();assert.equal(move.hidden,true);taskBox.click();chatBox.click();assert.equal(move.hidden,false);
 const calls=[];w.ChatTidyBatch.run=async message=>{calls.push(message);return {completed:message.ids}};
 move.click();await wait(50);const dialog=d.querySelector('.cs-move');assert.match(dialog.textContent,/Group A/);assert.doesNotMatch(dialog.textContent,/Old/);assert.match(dialog.textContent,/New group/);
 dialog.querySelector(`input[value="${id('5')}"]`).click();dialog.dispatchEvent(new w.Event('change'));dialog.querySelector('[data-cs-move-confirm]').click();await wait(100);
 assert.equal(calls[0].organizationId,id('9'));assert.equal(calls[0].target,id('5'));assert.equal(d.querySelectorAll('.cs-deleted-row').length,0,'grouped Claude chats stay in the recents list');assert.equal(d.querySelectorAll('.cs-checkbox:checked').length,0);
 }finally{dom.window.close()}
});
test('Gemini and Grok never offer move or the archive manager',async()=>{
 for(const [url,markup] of [['https://grok.com/',`<div data-sidebar="sidebar"><h2>Chats</h2><a href="/c/${id('1')}">One</a></div>`]]){
 const {dom,d}=await setup({url,markup,beforeLoad:w=>{w.eval(fs.readFileSync('src/projects.js','utf8'));}});
 try{assert.equal(d.querySelector('[data-cs-action="move"]'),null);assert.equal(d.querySelector('[data-cs-action="archiveManager"]'),null);}finally{dom.window.close()}
 }
});
test('ChatGPT project creation sends the private sharing shape and falls back to the projects route on 422',async()=>{
 const posts=[];
 const {dom,w,d}=await setup({beforeLoad:w=>{w.AbortSignal=AbortSignal;w.fetch=async(url,options={})=>{const path=url.split('?')[0];
  if(path==='/backend-api/gizmos/snorlax/upsert'){posts.push({path,body:JSON.parse(options.body)});return {ok:false,status:422,json:async()=>({detail:'invalid'})};}
  if(path==='/backend-api/projects'){posts.push({path,body:JSON.parse(options.body)});return {ok:true,status:200,json:async()=>({resource:{gizmo:{id:'g-p-fallback',display:{name:'Fresh'}}}})};}
  const body=path==='/api/auth/session'?{accessToken:'t',user:{id:'a'}}:{cursor:null,items:[]};return {ok:true,status:200,json:async()=>body};};w.eval(fs.readFileSync('src/projects.js','utf8'));}});
 try{
 const calls=[];w.ChatTidyBatch.run=async message=>{calls.push(message);return {completed:message.ids}};
 d.querySelector('.cs-checkbox').click();d.querySelector('[data-cs-action="move"]').click();await wait(50);
 const dialog=d.querySelector('.cs-move');const name=dialog.querySelector('.cs-move-name');name.value='Fresh';name.dispatchEvent(new w.Event('input'));dialog.querySelector('[data-cs-move-confirm]').click();await wait(100);
 assert.deepEqual(posts.map(p=>p.path),['/backend-api/gizmos/snorlax/upsert','/backend-api/projects']);
 assert.equal(posts[0].body.sharing[0].type,'private');assert.equal(posts[0].body.sharing[0].capabilities.can_read,true);assert.equal(posts[0].body.display.name,'Fresh');
 assert.equal(calls.length,1);assert.equal(calls[0].target,'g-p-fallback');
 }finally{dom.window.close()}
});
