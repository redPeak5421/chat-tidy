const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const row=n=>`<div class="row"><a href="/c/${id(n)}"><span>Chat ${n}</span></a><button aria-haspopup="menu" data-owner="${n}">…</button></div>`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function setup({beforeLoad,getSettings,url='https://chatgpt.com/',markup}={}){
 const dom=new JSDOM(markup??`<nav><h2>聊天</h2><div id="history">${row('1')}${row('2')}</div></nav><main><a href="/c/${id('3')}">Reference link</a></main>`,{url,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{width:100,height:30}]};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 let onChange;w.chrome={storage:{local:{get:async()=>({language:'en',enabled:true})},onChanged:{addListener:fn=>onChange=fn}},runtime:{id:'test',onMessage:{addListener:()=>{},removeListener:()=>{}},sendMessage:async message=>({completed:message.ids||[]})}};
 if(getSettings)w.chrome.storage.local.get=getSettings;
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
test('batch sends only selected IDs to background without native UI or scroll',async()=>{
 const {dom,w,d}=await setup();try{
 let calls=[],native=0;w.chrome.runtime.sendMessage=async message=>{calls.push(message);return {completed:message.ids}};
 w.HTMLElement.prototype.scrollIntoView=()=>{throw Error('must not scroll')};
 d.querySelectorAll('[data-owner]').forEach(node=>{node.onclick=()=>native++;node.onpointerdown=()=>native++});
 d.querySelector('[data-cs-action="all"]').click();d.querySelector('[data-cs-action="delete"]').click();d.querySelector('[data-cs-confirm]').click();await wait(150);
 assert.equal(native,0);assert.deepEqual(Array.from(calls[0].ids),[id('1'),id('2')]);assert.equal(d.querySelectorAll('.cs-deleted-row').length,2);assert.match(d.querySelector('.cs-status').textContent,/Removed 2/);assert.equal(d.querySelector('[role="menu"],[role="dialog"]'),null);
 }finally{dom.window.close()}
});
test('failed background batch retains unfinished selections',async()=>{
 const {dom,w,d}=await setup();try{
 w.chrome.runtime.sendMessage=async()=>({completed:[id('1')],error:'rate-limit'});
 d.querySelector('[data-cs-action="all"]').click();d.querySelector('[data-cs-action="delete"]').click();d.querySelector('[data-cs-confirm]').click();await wait(150);
 assert.equal(d.querySelectorAll('.cs-checkbox:checked').length,1);assert.match(d.querySelector('.cs-status').textContent,/rate-limit/);
 }finally{dom.window.close()}
});
test('checkbox does not navigate using a parent click handler',async()=>{
 const {dom,d}=await setup();try{let navigations=0;d.querySelector('nav').addEventListener('click',()=>navigations++);d.querySelector('.cs-checkbox').click();assert.equal(navigations,0);assert.equal(d.querySelector('.cs-checkbox').checked,true);}finally{dom.window.close()}
});
test('popup persists language and renders translated help',async()=>{
 const dom=new JSDOM(fs.readFileSync('popup.html','utf8'),{url:'https://extension.test/',runScripts:'outside-only'});const w=dom.window,d=w.document,saved={};
 try{w.chrome={storage:{local:{get:async()=>({enabled:true,language:'en'}),set:async data=>Object.assign(saved,data)}}};
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
 w.chrome.runtime.sendMessage=async message=>{calls.push(message);return {completed:message.ids}};
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
 let calls=0;w.chrome.runtime.sendMessage=async()=>{calls++;return {completed:[]}};
 d.querySelector('.cs-checkbox').click();d.querySelector('[data-cs-action="delete"]').click();
 d.cookie=`lastActiveOrg=${id('9')};path=/`;d.querySelector('[data-cs-confirm]').click();await wait(100);
 assert.equal(calls,0);assert.equal(d.querySelectorAll('.cs-checkbox:checked').length,0);
 }finally{dom.window.close()}
});
test('Claude title icon glyph does not move toolbar into first conversation',async()=>{
 const {dom,d}=await setup({url:'https://claude.ai/new',markup:`<div data-testid="sidebar"><div class="labelrow"><button data-group-toggle><span data-group-name>Chats and tasks</span><span data-cds="Icon">\ue02a</span></button><button>View all</button></div><div><a href="/chat/${id('1')}">Example</a></div></div>`});
 try{assert.equal(d.querySelector('.cs-toolbar').parentElement,d.querySelector('.labelrow'));assert.equal(d.querySelector('[data-group-toggle]').nextElementSibling,d.querySelector('.cs-toolbar'));}finally{dom.window.close()}
});
test('Claude deletion runs in the confirmed page with exact IDs and rejects unapproved or replayed batches',async()=>{
 let receive;const calls=[];
 const {dom,w,d}=await setup({url:'https://claude.ai/new',markup:`<div data-testid="sidebar"><h2>Chats</h2><a href="/chat/${id('1')}">Example</a></div>`,beforeLoad:w=>{
 w.document.cookie=`lastActiveOrg=${id('9')};path=/`;
 w.chrome.runtime.onMessage.addListener=fn=>receive=fn;
 w.chrome.runtime.onMessage.removeListener=()=>{};
 w.fetch=async(url,options)=>{calls.push({url,options});return {status:200,ok:true,headers:{get:()=>null},json:async()=>({deleted:[id('1')],failed:[]})}};
 }});
 try{
 let job,finish;w.chrome.runtime.sendMessage=message=>{job=message;return new Promise(r=>finish=r)};
 d.querySelector('.cs-checkbox').click();d.querySelector('[data-cs-action="delete"]').click();assert.equal(calls.length,0);
 d.querySelector('[data-cs-confirm]').click();
 const send=(ids,extra={})=>new Promise(resolve=>{if(receive({type:'cs-claude-delete',jobId:job.jobId,organizationId:id('9'),ids,...extra},{id:'test'},resolve)!==true)resolve(undefined)});
 await send([id('2')]);assert.equal(calls.length,0);
 const result=await send([id('1')]);assert.equal(result.status,200);assert.equal(calls.length,1);
 assert.equal(calls[0].url,`/api/organizations/${id('9')}/chat_conversations/delete_many`);
 assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.method,'POST');
 assert.deepEqual(JSON.parse(calls[0].options.body),{conversation_uuids:[id('1')]});
 await send([id('1')]);assert.equal(calls.length,1);
 finish({completed:[id('1')]});await wait(30);
 }finally{dom.window.close()}
});
test('ChatGPT archive reviews selection then sends archive only and preserves failures',async()=>{
 const {dom,w,d}=await setup();try{
 const calls=[];w.chrome.runtime.sendMessage=async message=>{calls.push(message);return {completed:[id('1')],error:'rate-limit'}};
 const archive=d.querySelector('[data-cs-action="archive"]');assert.equal(archive.disabled,true);
 d.querySelector('[data-cs-action="all"]').click();archive.click();assert.equal(calls.length,0);
 assert.match(d.querySelector('.cs-confirm').textContent,/Archive selected|Archived Chats/);
 d.querySelector('[data-cs-confirm]').click();await wait(100);
 assert.equal(calls.length,1);assert.equal(calls[0].type,'cs-archive');assert.equal(calls[0].ids.length,2);
 assert.equal(d.querySelectorAll('.cs-checkbox:checked').length,1);
 }finally{dom.window.close()}
});
for(const site of ['claude','grok'])test(`${site} does not offer local or unverified archive`,async()=>{
 const attr=site==='claude'?'data-testid="sidebar"':'data-sidebar="sidebar"';const route=site==='claude'?'chat':'c';
 const {dom,d}=await setup({url:site==='claude'?'https://claude.ai/':'https://grok.com/',markup:`<div ${attr}><h2>Chats</h2><a href="/${route}/${id('1')}">Example</a></div>`});
 try{if(site==='grok')assert.equal(d.querySelector('[data-cs-action="archive"]'),null);else{d.querySelector('.cs-checkbox').click();assert.equal(d.querySelector('[data-cs-action="archive"]').disabled,true);}}finally{dom.window.close()}
});
for(const action of ['archive','delete'])test(`Cowork ${action} uses the native endpoint and accepts an empty successful response`,async()=>{
 const task='cse_01AAAAAAAAAAAAAAAAAAAAAA';let receive;const calls=[];
 const {dom,w,d}=await setup({url:'https://claude.ai/chats',markup:`<div data-testid="sidebar"><h2>Chats</h2><a href="/cowork/${task}">Example task</a></div>`,beforeLoad:w=>{
 w.document.cookie=`lastActiveOrg=${id('9')};path=/`;w.chrome.runtime.onMessage.addListener=fn=>receive=fn;
 w.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:204,headers:{get:()=>null},json:async()=>{throw Error('empty')}}};
 }});
 try{
 let job,finish;w.chrome.runtime.sendMessage=message=>{job=message;return new Promise(r=>finish=r)};
 d.querySelector('.cs-checkbox').click();assert.equal(d.querySelector(`[data-cs-action="${action}"]`).disabled,false);
 d.querySelector(`[data-cs-action="${action}"]`).click();d.querySelector('[data-cs-confirm]').click();
 const result=await new Promise(resolve=>receive({type:'cs-claude-delete',action,jobId:job.jobId,organizationId:id('9'),ids:[task]},{id:'test'},resolve));
 assert.equal(result.status,204);assert.equal(calls.length,1);assert.equal(calls[0].url,'/v1/code/sessions/'+task+(action==='archive'?'/archive':''));
 assert.equal(calls[0].options.method,action==='archive'?'POST':'DELETE');assert.deepEqual(JSON.parse(calls[0].options.body),{});
 assert.equal(calls[0].options.headers['x-organization-uuid'],id('9'));
 assert.equal(calls[0].options.headers['X-Device-Attestation'],undefined);
 finish({completed:[task]});await wait(30);
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
 const calls=[];w.chrome.runtime.sendMessage=async message=>{calls.push(message);return {completed:message.ids}};
 d.querySelector('.cs-search-toolbar [data-cs-action="delete"]').click();assert.equal(d.querySelector('.cs-confirm').parentElement,d.querySelector('[role="dialog"]'));
 d.querySelector('[data-cs-confirm]').click();await wait(80);assert.deepEqual(Array.from(calls[0].ids),[id('1')]);assert.ok(list.querySelector('[cmdk-item]').classList.contains('cs-deleted-row'));
 }finally{dom.window.close()}
});
for(const site of ['grok','claude'])test(`popup show-all switch visibility follows active ${site} page`,async()=>{
 const dom=new JSDOM(fs.readFileSync('popup.html','utf8'),{url:'https://extension.test/',runScripts:'outside-only'});const w=dom.window,d=w.document,saved={};
 try{w.chrome={tabs:{query:async()=>[{id:1}],sendMessage:async()=>({site})},storage:{local:{get:async()=>({enabled:true,language:'en',grokShowAll:false}),set:async data=>Object.assign(saved,data)}}};
 for(const name of ['i18n','popup'])w.eval(fs.readFileSync(`src/${name}.js`,'utf8'));await wait(10);
 assert.equal(d.querySelector('#grok-options').hidden,site!=='grok');
 if(site==='grok'){const input=d.querySelector('#grokShowAll');input.checked=true;input.dispatchEvent(new w.Event('change'));await wait(10);assert.equal(saved.grokShowAll,true);}
 }finally{w.close()}
});
test('extension reload disconnects stale sidebar controls and requests a page refresh',async()=>{
 const {dom,w,d}=await setup();try{
 w.chrome.runtime.id=undefined;
 d.querySelector('#history').insertAdjacentHTML('beforeend',row('4'));await wait(160);
 assert.equal(d.querySelectorAll('.cs-checkbox').length,0);assert.match(d.querySelector('.cs-context-expired').textContent,/Refresh/);
 d.querySelector('#history').insertAdjacentHTML('beforeend',row('5'));await wait(120);
 assert.equal(d.querySelectorAll('.cs-context-expired').length,1);
 }finally{dom.window.close()}
});
