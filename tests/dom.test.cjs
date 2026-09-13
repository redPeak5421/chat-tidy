const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const row=n=>`<div class="row"><a href="/c/${id(n)}"><span>Chat ${n}</span></a><button aria-haspopup="menu" data-owner="${n}">…</button></div>`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function setup({beforeLoad,getSettings}={}){
 const dom=new JSDOM(`<nav><h2>聊天</h2><div id="history">${row('1')}${row('2')}</div></nav><main><a href="/c/${id('3')}">Reference link</a></main>`,{url:'https://chatgpt.com/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 w.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{width:100,height:30}]};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 let onChange;w.chrome={storage:{local:{get:async()=>({language:'en',enabled:true,layout:'menu'})},onChanged:{addListener:fn=>onChange=fn}},runtime:{id:'test',onMessage:{addListener:()=>{},removeListener:()=>{}},sendMessage:async message=>({completed:message.ids||[]})}};
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
test('settings switch language/layout and disable removes controls',async()=>{
 const {dom,d,change}=await setup();try{
 await change({language:{newValue:'fr'},layout:{newValue:'buttons'}});assert.equal(d.querySelector('[data-cs-action="delete"]').textContent,'Supprimer');assert.equal(d.querySelector('.cs-actions').hidden,true);assert.ok(d.querySelector('.cs-toggle svg'));
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
test('popup persists language and layout and renders translated help',async()=>{
 const dom=new JSDOM(fs.readFileSync('popup.html','utf8'),{url:'https://extension.test/',runScripts:'outside-only'});const w=dom.window,d=w.document,saved={};
 try{w.chrome={storage:{local:{get:async()=>({enabled:true,layout:'menu',language:'en'}),set:async data=>Object.assign(saved,data)}}};
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
test('diagnostics are opt-in, popup-only, aggregate-only and clearable; main updates do not rescan',async()=>{
 let listener;
 const {dom,w,d}=await setup({beforeLoad(w){
 w.chrome.runtime.getURL=path=>'chrome-extension://test/'+path;
 w.chrome.runtime.getManifest=()=>({version:'test'});
 w.chrome.runtime.onMessage.addListener=fn=>listener=fn;
 }});try{
 const sender={id:'test',url:'chrome-extension://test/popup.html'};
 const request=(action,from=sender)=>{let reply;listener({type:'cs-diagnostics-'+action},from,value=>reply=value);return reply;};
 assert.equal(request('report'),null);
 assert.equal(request('start',{id:'other',url:sender.url}),undefined);
 assert.equal(request('report'),null);
 assert.equal(request('start').ok,true);
 d.querySelector('input').click();
 d.dispatchEvent(new w.MouseEvent('pointermove',{clientX:35,clientY:120}));
 d.querySelector('main').append(d.createElement('p'));
 await wait(130);
 const report=request('report');
 assert.equal(report.selectedCount,1);assert.equal(report.pointerEvents,1);
 assert.equal(report.scans,0);assert.ok(report.framesWithSelection>0);
 assert.ok(!JSON.stringify(report).includes('Chat 1'));
 assert.ok(!JSON.stringify(report).includes(id('1')));
 assert.ok(Object.values(report).every(value=>typeof value==='number'||typeof value==='boolean'||value==='test'));
 assert.equal(request('stop').ok,true);assert.equal(request('report'),null);
 }finally{dom.window.close()}
});
