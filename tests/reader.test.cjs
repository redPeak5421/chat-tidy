const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {JSDOM}=require('jsdom');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const uuid=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const plain=value=>JSON.parse(JSON.stringify(value));
const message=(role,id,html)=>`<div data-message-author-role="${role}"${id?` data-message-id="${id}"`:''}><div class="${role==='user'?'whitespace-pre-wrap':'markdown'}">${html}</div></div>`;
const thread=pairs=>pairs.map(([q,a],i)=>message('user','u'+i,q)+message('assistant','a'+i,a)).join('');
const bread=[['How do I bake bread?','<p>Use flour and water. Bread needs time.</p>'],['What about pizza?','<p>Pizza dough is like bread dough.</p>'],['Tell me a joke','<p>No.</p>']];
// chrome.storage.local and onChanged as Chrome behaves: get(null|key|keys|defaults), removals notify too. writes counts set/remove calls.
function fakeStorage(seed={}){
 const store=plain(seed),listeners=[],counter={writes:0};const notify=changes=>{for(const fn of [...listeners])fn(changes,'local');};
 const pick=keys=>keys==null?plain(store):typeof keys==='string'?(keys in store?{[keys]:plain(store[keys])}:{}):Array.isArray(keys)?Object.fromEntries(keys.filter(k=>k in store).map(k=>[k,plain(store[k])])):Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,k in store?plain(store[k]):v]));
 const storage={onChanged:{addListener:fn=>listeners.push(fn),removeListener:fn=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);}},local:{
  get:async keys=>pick(keys),
  set:async values=>{counter.writes++;const changes={};for(const [k,v] of Object.entries(values)){changes[k]={oldValue:store[k],newValue:plain(v)};store[k]=plain(v);}notify(changes);},
  remove:async keys=>{counter.writes++;const changes={};for(const k of [].concat(keys))if(k in store){changes[k]={oldValue:store[k]};delete store[k];}if(Object.keys(changes).length)notify(changes);}}};
 return {store,listeners,counter,storage};
}
function pure(){const ctx={};vm.createContext(ctx);for(const f of ['library','reader'])vm.runInContext(fs.readFileSync(`src/${f}.js`,'utf8'),ctx);return ctx;}
async function setup({pairs=bread,html,url=`https://chatgpt.com/c/${uuid('1')}`,data={},highlights=false,wrap,before}={}){
 const dom=new JSDOM(`<!doctype html><title>Plan trip - ChatGPT</title><body><main><div id="thread">${html??thread(pairs)}</div></main></body>`,{url,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document;
 w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')||this.matches('.contents')?[]:[{width:100,height:20}]};
 d.head.insertAdjacentHTML('beforeend','<style>.contents{display:contents}</style>');
 const scrolled=[];w.HTMLElement.prototype.scrollIntoView=function(){scrolled.push(this)};
 const {store,listeners,counter,storage}=fakeStorage(data);w.chrome={runtime:{id:'test'},storage};
 const registry=new Map();
 if(highlights){Object.defineProperty(w,'CSS',{value:{highlights:registry},configurable:true});w.Highlight=class{constructor(...ranges){this.ranges=[...ranges];this.priority=0;}add(range){this.ranges.push(range);}get size(){return this.ranges.length;}};}
 for(const f of ['core','i18n','library','reader-sites','reader'])w.eval(fs.readFileSync(`src/${f}.js`,'utf8'));
 await before?.(w);
 const env={lang:'en'};const t=(k,v)=>w.ChatTidyI18n.t(env.lang,k,v);
 const real=w.ChatTidyReaderSites.get('chatgpt'),adapter=wrap?wrap(real):real;
 const reader=w.ChatTidyReader.create({t,site:w.ChatTidyCore.siteForUrl(url),adapter,library:w.ChatTidyLibrary,titleOf:()=>''});
 const settings={...w.ChatTidyCore.settings,language:'en'};reader.update(settings);await wait(80);
 const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)];
 const type=async(value,ms=220)=>{const input=$('.cs-reader-search-input');input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));await wait(ms);};
 const key=(target,k,extra={})=>target.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,...extra}));
 const lib=async()=>plain(await w.ChatTidyLibrary.load());
 return {dom,w,d,reader,store,listeners,counter,lib,registry,scrolled,settings,env,$,$$,type,key,close:()=>{reader.destroy();dom.window.close();}};
}

test('turns group the answers under the question before them and keep stable identities',()=>{
 const {ChatTidyReader:r,ChatTidyLibrary:lib}=pure(),u1={},u2={},a1={},a2={},a3={};
 const list=r.turns([{role:'assistant',el:{},text:'greeting'},{role:'user',el:u1,id:null,text:' What  is X? '},{role:'assistant',el:a1,id:'a1',text:'X is'},{role:'assistant',el:a2,id:'a2',text:'more'},{role:'user',el:u2,id:'u2',text:'Next'},{role:'assistant',el:a3,id:null,text:'ok'},{role:'user',el:{},id:null,text:'Unanswered'}],lib.hash);
 assert.equal(list.length,3,'a reply before the first question starts no turn');
 assert.equal(list[0].question,'What is X?');assert.equal(list[0].hash,lib.hash('What is X?'));assert.equal(list[0].id,'a1','first answer ID when the question has none');
 assert.equal(list[0].userEl,u1);assert.equal(list[0].userBody,u1,'the element itself when there is no body');assert.equal(list[0].answerEls.length,2);assert.equal(list[0].answerEls[1],a2);assert.equal(list[0].answer,'X is more');
 assert.equal(list[1].id,'u2');assert.equal(list[1].index,1);assert.equal(list[2].answerEls.length,0);assert.equal(list[2].id,null);
});
test('findMatches is case-insensitive, non-overlapping and keeps offsets valid for expanding case folds',()=>{
 const {ChatTidyReader:r}=pure();
 assert.deepEqual(plain(r.findMatches('Foo foo FOO','foo')),[0,4,8]);
 assert.deepEqual(plain(r.findMatches('aaaa','aa')),[0,2]);
 assert.deepEqual(plain(r.findMatches('a.b a*b','.b')),[1]);
 assert.deepEqual(plain(r.findMatches('abc','  ')),[]);assert.deepEqual(plain(r.findMatches('','x')),[]);
 const text='İstanbul istanbul ISTANBUL';assert.equal(r.fold(text).length,text.length);
 for(const i of r.findMatches(text,'istanbul'))assert.equal(text.slice(i,i+8).toLowerCase(),'istanbul');
 assert.deepEqual(plain(r.findMatches('Größe GRÖSSE größe','größe')),[0,13]);
});
test('resolveTurn prefers the message ID, then the nearest same question, and uses the position only for bare references',()=>{
 const {ChatTidyReader:r}=pure(),list=[{index:0,id:'x',hash:'h1'},{index:1,id:null,hash:'h2'},{index:2,id:null,hash:'h2'}];
 assert.equal(r.resolveTurn(list,{id:'x',hash:'h2',index:2}).index,0);
 assert.equal(r.resolveTurn(list,{id:'gone',hash:'h2',index:2}).index,2);
 assert.equal(r.resolveTurn(list,{hash:'h2',index:0}).index,1);
 assert.equal(r.resolveTurn(list,{hash:'zz',index:1},true),null,'a saved question that is not rendered never resolves by position');
 assert.equal(r.resolveTurn(list,{id:'gone',index:1},true),null);
 assert.equal(r.resolveTurn(list,{index:1},false),null);assert.equal(r.resolveTurn(list,{index:1},true).index,1,'a reference without id or hash may use the position late');
 assert.equal(r.resolveTurn(list,{hash:'zz',index:9}),null);assert.equal(r.resolveTurn([],{id:'x'}),null);
});
test('rail ticks scale up to 12px apart and share ticks below 3px',()=>{
 const {ChatTidyReader:r}=pure();
 assert.deepEqual(plain(r.ticks(0,300)),{step:1,n:0,gap:0});
 assert.deepEqual(plain(r.ticks(1,300)),{step:1,n:1,gap:0});
 assert.deepEqual(plain(r.ticks(5,400)),{step:1,n:5,gap:12});
 const mid=r.ticks(100,400);assert.equal(mid.step,1);assert.ok(mid.gap>=3&&mid.gap<12);
 for(const count of [500,1000,5000]){const many=r.ticks(count,400);assert.ok(many.step>1);assert.ok(many.gap>=3,'never denser than 3px');assert.ok(many.n*many.step>=count);assert.ok((many.n-1)*many.gap<=400);}
});
test('chat titles drop the site name',()=>{
 const {ChatTidyReader:r}=pure();
 assert.equal(r.cleanTitle('Plan trip - ChatGPT','ChatGPT'),'Plan trip');assert.equal(r.cleanTitle('ChatGPT','ChatGPT'),'');
 assert.equal(r.cleanTitle('Claude | Notes','Claude'),'Notes');assert.equal(r.cleanTitle('A-B','ChatGPT'),'A-B');assert.equal(r.cleanTitle('  Gemini ','Gemini'),'');
});

test('rail and panel list every question; ticks, rows and the open state work',async()=>{
 const env=await setup();const {w,d,$,$$,store,scrolled}=env;try{
  assert.equal($$('.cs-reader').length,1);assert.equal($('.cs-reader').dataset.csOwned,'true');
  assert.equal($$('.cs-reader-tick').length,3);assert.deepEqual($$('.cs-reader-outline-text').map(n=>n.textContent),['How do I bake bread?','What about pizza?','Tell me a joke']);
  assert.equal($('.cs-reader-panel-total').textContent,'3');assert.equal($$('.cs-reader-tick[aria-current="true"]').length,1);
  const users=$$('[data-message-author-role="user"]');
  $$('.cs-reader-tick')[2].dispatchEvent(new w.MouseEvent('click',{bubbles:true,detail:0}));
  assert.equal(scrolled.at(-1),users[2]);assert.ok(users[2].querySelector('.whitespace-pre-wrap').hasAttribute('data-cs-flash'),'the ring hugs the question body');assert.equal($('.cs-reader-tick[aria-current="true"]'),$$('.cs-reader-tick')[2]);
  assert.equal($('.cs-reader-outline-row[aria-current="true"]').dataset.index,'2');
  $$('.cs-reader-outline-go')[1].click();assert.equal(scrolled.at(-1),users[1]);
  const fresh=users[0].cloneNode(true);users[0].replaceWith(fresh);$$('.cs-reader-outline-go')[0].click();assert.equal(scrolled.at(-1),fresh,'a rerendered question is found again');
  assert.ok(!$('.cs-reader').classList.contains('cs-reader-open'));assert.ok($('.cs-reader-panel').hasAttribute('inert'));
  $('.cs-reader-rail-open').click();await wait(20);
  assert.ok($('.cs-reader').classList.contains('cs-reader-open'));assert.equal(store.readerPanelOpen,true);assert.equal(d.activeElement,$('.cs-reader-search-input'));
  $('.cs-reader-panel-head .cs-reader-icon:last-child').click();await wait(20);assert.equal(store.readerPanelOpen,false);assert.ok($('.cs-reader-panel').hasAttribute('inert'));
  await wait(1400);assert.equal(d.querySelectorAll('[data-cs-flash]').length,0,'the flash ring is temporary');
 }finally{env.close();}
});
test('the panel restores its saved open state and keyboard input never reaches site shortcuts',async()=>{
 const env=await setup({data:{readerPanelOpen:true}});const {d,$,key}=env;try{
  assert.ok($('.cs-reader').classList.contains('cs-reader-open'));
  let seen=0;d.addEventListener('keydown',()=>seen++);
  key($('.cs-reader-search-input'),'a');assert.equal(seen,0);key($('.cs-reader-search-input'),'Escape');assert.equal(seen,1);
 }finally{env.close();}
});
test('search counts loaded matches, filters the outline, steps with wrap and clears on Escape (no highlight API)',async()=>{
 const pairs=[['How do I <b>bre</b>ad?','<p>Use flour and water. <span class="contents">Bread</span> needs time.<span hidden>bread</span><span data-cs-owned="true">bread</span></p>'],...bread.slice(1)];
 const env=await setup({pairs});const {d,$,$$,type,key}=env;try{
  await type('bread');
  assert.equal($('.cs-reader-count').textContent,'1 of 3');
  assert.deepEqual($$('.cs-reader-outline-row').map(n=>n.dataset.index),['0','1']);assert.deepEqual($$('.cs-reader-outline-count').map(n=>n.textContent),['2','1']);
  assert.equal($$('.cs-reader-tick[data-hit]').length,2);
  assert.ok(d.querySelector('[data-message-author-role="user"] b').hasAttribute('data-cs-flash'),'without paint the match element is ringed');
  key($('.cs-reader-search-input'),'Enter');assert.equal($('.cs-reader-count').textContent,'2 of 3');
  key($('.cs-reader-search-input'),'Enter',{shiftKey:true});key($('.cs-reader-search-input'),'Enter',{shiftKey:true});assert.equal($('.cs-reader-count').textContent,'3 of 3','wraps backwards');
  $('.cs-reader-search>.cs-reader-icon:last-child').click();assert.equal($('.cs-reader-count').textContent,'1 of 3','next wraps forwards');
  key($('.cs-reader-search-input'),'Enter',{isComposing:true});assert.equal($('.cs-reader-count').textContent,'1 of 3','IME confirmation is not a step');
  $$('.cs-reader-outline-go')[1].click();assert.equal($('.cs-reader-count').textContent,'3 of 3','a row jumps to its first match');
  await type('zebra');assert.equal($('.cs-reader-count').textContent,'');assert.equal($('.cs-reader-outline-empty').textContent,'No matches in loaded messages');
  await type('bread');key($('.cs-reader-search-input'),'Escape');
  assert.equal($('.cs-reader-search-input').value,'');assert.equal($$('.cs-reader-outline-row').length,3);assert.equal($('.cs-reader-count').textContent,'');assert.equal($$('.cs-reader-tick[data-hit]').length,0);
 }finally{env.close();}
});
test('search paints every match and the current one with CSS highlights and keeps its place as messages change',async()=>{
 const pairs=[['How do I <b>bre</b>ad?','<p>Bread needs time.</p>'],...bread.slice(1)];
 const env=await setup({pairs,highlights:true});const {d,$,type,key,registry}=env;try{
  await type('BREAD');
  assert.equal(registry.get('cs-search').size,3);assert.equal(registry.get('cs-search-current').size,1);assert.equal(registry.get('cs-search-current').priority,1);
  assert.equal(registry.get('cs-search-current').ranges[0].toString(),'bread','a match across inline elements is one range');
  key($('.cs-reader-search-input'),'Enter');assert.equal($('.cs-reader-count').textContent,'2 of 3');assert.equal(registry.get('cs-search-current').ranges[0].toString(),'Bread');
  assert.equal(d.querySelectorAll('[data-cs-flash]').length,0,'painted matches are not ringed');
  d.querySelector('#thread').insertAdjacentHTML('beforeend',message('user','u9','More bread please')+message('assistant','a9','<p>Bread.</p>'));await wait(320);
  assert.equal($('.cs-reader-count').textContent,'2 of 5','new messages join the search and the current match stays');
  d.querySelectorAll('.markdown p')[0].append(' More bread.');await wait(650);
  assert.equal($('.cs-reader-count').textContent,'2 of 6','a streaming answer is searched again');
  key($('.cs-reader-search-input'),'Escape');assert.equal(registry.has('cs-search'),false);assert.equal(registry.has('cs-search-current'),false);
 }finally{env.close();}
});
test('streaming inside an answer does not rescan the chat unless a search is active',async()=>{
 let calls=0;const env=await setup({wrap:real=>({...real,messages(root){calls++;return real.messages(root);}})});const {d,type}=env;try{
  const before=calls,answer=d.querySelector('[data-message-author-role="assistant"] .markdown p');
  for(let i=0;i<5;i++){answer.append(' token');await wait(30);}
  await wait(600);assert.equal(calls,before,'answer text changes alone are ignored');
  d.querySelector('#thread').insertAdjacentHTML('beforeend',message('user','u5','New question'));await wait(300);
  assert.ok(calls>before,'a new message is picked up');assert.equal(d.querySelectorAll('.cs-reader-tick').length,4);
  await type('token');const searched=calls;answer.append(' token');await wait(650);
  assert.ok(calls>searched);assert.equal(d.querySelector('.cs-reader-count').textContent,'1 of 6');
 }finally{env.close();}
});
test('typing in the composer and churn outside messages never rescan message text; changed messages are read alone',async()=>{
 let probes=0;
 const env=await setup({html:thread(bread)+'<form><div contenteditable="true" id="composer"><p></p></div><textarea></textarea></form><div id="status"></div>',wrap:real=>({...real,messages(root,options){if(options?.text===false)probes++;return real.messages(root,options);}})});
 const {w,d,$$}=env;try{
  let reads=0;Object.defineProperty(w.HTMLElement.prototype,'innerText',{configurable:true,get(){reads++;return this.textContent;}});
  const start=probes,composer=d.querySelector('#composer p');
  for(let i=0;i<20;i++){composer.append('x');if(i%5===0)composer.parentElement.setAttribute('data-x',i);await wait(15);}
  await wait(400);assert.equal(probes,start,'composer keystrokes are ignored');assert.equal(reads,0);
  const status=d.querySelector('#status');
  for(let i=0;i<12;i++){status.textContent='Saving '+i;status.append(d.createElement('span'));await wait(50);}
  await wait(400);assert.ok(probes>start&&probes<=start+2,`churn outside messages is debounced into a cheap probe (${probes-start})`);assert.equal(reads,0,'and reads no message text');
  d.querySelector('#thread').insertAdjacentHTML('beforeend',message('user','u7','Fresh question')+message('assistant','a7','<p>Fresh answer</p>'));await wait(500);
  assert.equal($$('.cs-reader-tick').length,4);assert.equal(reads,2,'only the new messages are read');
  d.querySelector('[data-message-id="u0"] .whitespace-pre-wrap').textContent='How do I bake rye bread?';await wait(400);
  assert.equal($$('.cs-reader-outline-text')[0].textContent,'How do I bake rye bread?');assert.equal(reads,3,'an edited question is read again, alone');
 }finally{env.close();}
});
test('opening and leaving the tags popover without an edit writes nothing',async()=>{
 const env=await setup();const {w,$,key,counter,lib}=env;try{
  const leave=async()=>{const input=$('.cs-reader-tags-input');key(input,'Enter');input.dispatchEvent(new w.FocusEvent('blur'));$('.cs-reader-note').dispatchEvent(new w.FocusEvent('blur'));key($('.cs-reader-tags-pop'),'Escape');await wait(500);};
  const before=counter.writes;
  $('.cs-reader-tags-button').click();await leave();
  assert.equal(counter.writes,before,'no bookmark appears from Enter, blur or close');assert.deepEqual(await lib(),{});
  $('.cs-reader-tags-button').click();$('.cs-reader-tags-input').value='work';key($('.cs-reader-tags-input'),'Enter');await wait(60);
  assert.equal(counter.writes,before+1);key($('.cs-reader-tags-pop'),'Escape');await wait(60);
  $('.cs-reader-tags-button').click();await leave();$('.cs-reader-tags-button').click();w.document.body.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));await wait(500);
  assert.equal(counter.writes,before+1,'reopening a saved item and leaving it unchanged writes nothing');
  $('.cs-reader-tags-button').click();const note=$('.cs-reader-note');note.value='x';note.dispatchEvent(new w.Event('input'));note.value='';note.dispatchEvent(new w.Event('input'));await wait(500);
  assert.equal(counter.writes,before+1,'an edit that is undone before the pause writes nothing');
 }finally{env.close();}
});
test('answers take tags and a note from their row; editing an unsaved answer bookmarks it',async()=>{
 const env=await setup();const {w,$,$$,key,lib,type}=env;try{
  const tag=$$('.cs-reader-outline-tag')[1],answer=w.ChatTidyLibrary.answerKey('chatgpt',uuid('1'),{id:'u1'});
  assert.equal(tag.getAttribute('aria-label'),'Tags and note');assert.equal(tag.getAttribute('aria-pressed'),null);
  tag.click();assert.ok($('.cs-reader-tags-pop'));assert.equal(tag.getAttribute('aria-expanded'),'true');assert.equal($$('.cs-reader-chip').length,0);
  const input=$('.cs-reader-tags-input');input.value='dough';key(input,'Enter');await wait(60);
  const item=(await lib())[answer];assert.equal(item.type,'answer');assert.deepEqual(item.tags,['dough']);assert.equal(item.question,'What about pizza?');assert.equal(item.excerpt,'Pizza dough is like bread dough.');
  assert.equal($$('.cs-reader-outline-mark')[1].getAttribute('aria-pressed'),'true','editing tags bookmarks the answer');
  assert.ok(tag.hasAttribute('data-filled'));assert.equal(tag.title,'Tags and note: dough');
  assert.equal($('.cs-reader-panel-head .cs-reader-fill').getAttribute('aria-pressed'),'false','the chat itself stays unbookmarked');assert.equal(('chatgpt:'+uuid('1')) in await lib(),false);
  const note=$('.cs-reader-note');note.value='Try a 48 h proof';note.dispatchEvent(new w.Event('input'));await wait(500);assert.equal((await lib())[answer].note,'Try a 48 h proof');
  tag.click();assert.equal($('.cs-reader-tags-pop'),null,'the same button closes it');
  $('.cs-reader-tags-button').click();assert.equal($$('.cs-reader-chip').length,0,'the header button edits the chat, not the answer');key($('.cs-reader-tags-pop'),'Escape');
  $$('.cs-reader-outline-tag')[1].click();assert.deepEqual($$('.cs-reader-chip-name').map(n=>n.textContent),['dough']);
  $('.cs-reader-outline').dispatchEvent(new w.Event('scroll'));assert.ok($('.cs-reader-tags-pop'),'scrolling keeps it while its row is in view');
  await type('bread');assert.ok($('.cs-reader-tags-pop'),'a filtered list keeps the popover on its row');assert.equal($('.cs-reader-outline-row[data-index="1"] .cs-reader-outline-tag').getAttribute('aria-expanded'),'true');
  await type('joke');assert.equal($('.cs-reader-tags-pop'),null,'and closes it when the row is filtered out');
 }finally{env.close();}
});
test('search never matches across paragraphs, list items or line breaks',async()=>{
 const env=await setup({pairs:[['First line<br>second line','<p>Use flour</p><p>and water</p><ul><li>salt</li><li>yeast</li></ul><p>a <b>bo</b>ld word</p>']]});const {$,type}=env;try{
  for(const query of ['flourand','flour and','saltyeast','linesecond'])await type(query),assert.equal($('.cs-reader-count').textContent,'',query);
  await type('flour');assert.equal($('.cs-reader-count').textContent,'1 of 1');
  await type('line');assert.equal($('.cs-reader-count').textContent,'1 of 2');
  await type('bold');assert.equal($('.cs-reader-count').textContent,'1 of 1','inline formatting still joins');
 }finally{env.close();}
});
test('answer bookmarks write and remove library items and mark the row and its tick',async()=>{
 const env=await setup();const {w,$,$$,lib}=env;try{
  const chat=uuid('1'),key=w.ChatTidyLibrary.answerKey('chatgpt',chat,{id:'u0'});
  $$('.cs-reader-outline-mark')[0].click();await wait(60);
  const item=(await lib())[key];assert.ok(item,'saved under the turn key');
  assert.equal(item.type,'answer');assert.equal(item.chatId,chat);assert.equal(item.title,'Plan trip');assert.equal(item.question,'How do I bake bread?');
  assert.equal(item.excerpt,'Use flour and water. Bread needs time.');assert.deepEqual(item.turn,{id:'u0',index:0,hash:w.ChatTidyLibrary.hash('How do I bake bread?')});assert.equal(item.url,w.location.href);
  assert.equal($$('.cs-reader-outline-mark')[0].getAttribute('aria-pressed'),'true');assert.equal($$('.cs-reader-outline-mark')[0].getAttribute('aria-label'),'Remove answer bookmark');
  assert.ok($$('.cs-reader-tick')[0].hasAttribute('data-marked'));
  $$('.cs-reader-outline-mark')[0].click();await wait(60);assert.equal(key in await lib(),false);assert.equal($$('.cs-reader-outline-mark')[0].getAttribute('aria-pressed'),'false');
 }finally{env.close();}
});
test('chat star, tags and note save to the library and follow edits from elsewhere',async()=>{
 const other={key:'claude:c9',type:'chat',site:'claude',chatId:'c9',url:'',title:'Other',tags:['travel','work','Later'],note:'',savedAt:1,updatedAt:1};
 const env=await setup({before:w=>w.ChatTidyLibrary.put(other)});const {w,d,$,$$,lib,key}=env;try{
  const chatKey='chatgpt:'+uuid('1'),star=$('.cs-reader-panel-head .cs-reader-fill');
  assert.equal(star.getAttribute('aria-pressed'),'false');
  star.click();await wait(60);assert.equal((await lib())[chatKey].type,'chat');assert.equal((await lib())[chatKey].title,'Plan trip');assert.equal(star.getAttribute('aria-pressed'),'true');
  star.click();await wait(60);assert.equal(chatKey in await lib(),false);assert.equal(star.getAttribute('aria-label'),'Bookmark this chat');
  $('.cs-reader-tags-button').click();const input=$('.cs-reader-tags-input');assert.equal(d.activeElement,input);
  assert.deepEqual($$('.cs-reader-suggest-tag').map(n=>n.textContent),['Later','travel','work']);
  input.value='work';key(input,'Enter');await wait(60);
  assert.deepEqual((await lib())[chatKey].tags,['work'],'Enter saves at once and bookmarks the chat');assert.equal(star.getAttribute('aria-pressed'),'true');
  assert.deepEqual($$('.cs-reader-suggest-tag').map(n=>n.textContent),['Later','travel']);
  input.value='ideas,';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.deepEqual($$('.cs-reader-chip-name').map(n=>n.textContent),['work','ideas']);
  key(input,'Backspace');assert.deepEqual($$('.cs-reader-chip-name').map(n=>n.textContent),['work']);
  $$('.cs-reader-suggest-tag')[1].click();assert.deepEqual($$('.cs-reader-chip-name').map(n=>n.textContent),['work','travel']);
  $('.cs-reader-chip-x').click();assert.deepEqual($$('.cs-reader-chip-name').map(n=>n.textContent),['travel']);assert.equal($('.cs-reader-chip-x').getAttribute('aria-label'),'Remove tag travel');
  const note=$('.cs-reader-note');note.value='Ask about yeast';note.dispatchEvent(new w.Event('input',{bubbles:true}));
  await wait(150);assert.equal((await lib())[chatKey].note,'','notes save after a short pause');
  await wait(400);assert.equal((await lib())[chatKey].note,'Ask about yeast');assert.deepEqual((await lib())[chatKey].tags,['travel']);assert.equal($('.cs-reader-pop-status').textContent,'Saved');
  assert.ok($('.cs-reader-tags-button').hasAttribute('data-filled'));
  await w.ChatTidyLibrary.put({...(await lib())[chatKey],tags:['travel','synced']});await wait(30);
  assert.deepEqual($$('.cs-reader-chip-name').map(n=>n.textContent),['travel','synced'],'another tab edited the tags');
  key($('.cs-reader-tags-pop'),'Escape');assert.equal($('.cs-reader-tags-pop'),null);assert.equal(d.activeElement,$('.cs-reader-tags-button'));
  $('.cs-reader-tags-button').click();$('.cs-reader-tags-input').value='draft';d.body.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));await wait(60);
  assert.equal($('.cs-reader-tags-pop'),null,'outside press closes');assert.deepEqual((await lib())[chatKey].tags,['travel','synced','draft'],'typed text is kept on close');
  await w.ChatTidyLibrary.remove(chatKey);await wait(30);assert.equal(star.getAttribute('aria-pressed'),'false');
 }finally{env.close();}
});
test('focus toggle writes the setting and mirrors it',async()=>{
 const env=await setup();const {$,store,reader,settings}=env;try{
  const focus=$('.cs-reader-panel-head .cs-reader-icon:nth-of-type(3)');assert.equal(focus.getAttribute('aria-label'),'Focus mode');
  focus.click();await wait(20);assert.equal(store.focusMode,true);
  reader.update({...settings,focusMode:true});assert.equal(focus.getAttribute('aria-pressed'),'true');assert.equal(focus.getAttribute('aria-label'),'Exit focus mode');
 }finally{env.close();}
});
test('rebuilds after content cleanup and on language change',async()=>{
 const env=await setup();const {w,d,$,$$,reader,settings,env:lang,type}=env;try{
  await type('bread');
  d.querySelectorAll('[data-cs-owned]').forEach(n=>n.remove());reader.update(settings);await wait(60);
  assert.equal($$('.cs-reader').length,1);assert.equal($$('.cs-reader-tick').length,3);assert.equal($('.cs-reader-search-input').value,'bread');assert.equal($('.cs-reader-count').textContent,'1 of 3');
  d.querySelectorAll('[data-cs-owned]').forEach(n=>n.remove());await wait(900);assert.equal($$('.cs-reader').length,1,'the poll notices removed nodes too');
  lang.lang='zh_CN';reader.update({...settings,language:'zh_CN'});await wait(30);
  assert.equal($$('.cs-reader').length,1);assert.equal($('.cs-reader-panel-title').firstChild.textContent,w.ChatTidyI18n.t('zh_CN','outlineTitle'));
 }finally{env.close();}
});
test('disabling removes DOM, highlights, flash marks, observers and listeners; destroy is idempotent',async()=>{
 for(const off of [{outline:false},{enabled:false}]){
  const env=await setup({highlights:true});const {d,$$,reader,settings,registry,listeners,type,store}=env;try{
   assert.equal(listeners.length,1);
   $$('.cs-reader-outline-go')[0].click();await type('bread');assert.ok(registry.has('cs-search'));assert.equal(d.querySelectorAll('[data-cs-flash]').length,1);
   reader.update({...settings,...off});
   assert.equal(d.querySelectorAll('[data-cs-owned]').length,0);assert.equal(registry.size,0);assert.equal(d.querySelectorAll('[data-cs-flash]').length,0);assert.equal(listeners.length,0);
   d.querySelector('#thread').insertAdjacentHTML('beforeend',message('user','u7','Later'));d.body.dispatchEvent(new d.defaultView.Event('pointerdown'));await wait(950);
   assert.equal(d.querySelectorAll('[data-cs-owned]').length,0,'no observer or poll is left');
   reader.update(settings);await wait(60);assert.equal(d.querySelectorAll('.cs-reader-tick').length,4,'turning it back on rebuilds');assert.equal(d.querySelector('.cs-reader-search-input').value,'','and starts without a query');
   reader.destroy();reader.destroy();assert.equal(d.querySelectorAll('[data-cs-owned]').length,0);reader.update(settings);await wait(60);assert.equal(d.querySelectorAll('[data-cs-owned]').length,0);
   assert.equal(store.readerPanelOpen,undefined);
  }finally{env.close();}
 }
});
test('late messages, SPA navigation between chats and leaving the chat',async()=>{
 const env=await setup({html:''});const {w,d,$,$$,type}=env;try{
  assert.ok($('.cs-reader').hasAttribute('data-empty'));assert.equal($$('.cs-reader-tick').length,0);
  d.querySelector('#thread').innerHTML=thread(bread.slice(0,2));await wait(320);
  assert.ok(!$('.cs-reader').hasAttribute('data-empty'));assert.equal($$('.cs-reader-tick').length,2);
  await type('pizza');assert.equal($('.cs-reader-count').textContent,'1 of 2');
  w.history.pushState({},'',`/c/${uuid('2')}`);d.querySelector('#thread').innerHTML=thread([['Second chat','<p>Hi</p>']]);w.dispatchEvent(new w.PopStateEvent('popstate'));await wait(80);
  assert.equal($('.cs-reader-search-input').value,'');assert.equal($('.cs-reader-count').textContent,'');assert.deepEqual($$('.cs-reader-outline-text').map(n=>n.textContent),['Second chat']);
  w.history.pushState({},'','/');await wait(900);assert.equal($('.cs-reader'),null,'no outline outside a chat');
  w.history.pushState({},'',`/c/${uuid('3')}`);await wait(900);assert.equal($$('.cs-reader').length,1);
  const main=d.querySelector('main'),fresh=d.createElement('main');fresh.innerHTML=`<div id="thread">${thread(bread)}</div>`;main.replaceWith(fresh);await wait(900);
  assert.equal($$('.cs-reader-tick').length,3,'a replaced thread is observed again');
 }finally{env.close();}
});
test('a jump requested from the library scrolls to the saved turn once it renders, and never to a stand-in',async()=>{
 const chat=uuid('1'),hash=pure().ChatTidyLibrary.hash,request=turn=>w=>w.ChatTidyLibrary.requestJump({key:'k',site:'chatgpt',chatId:chat,turn});
 for(const turn of [{id:'u1',index:0,hash:'x'},{id:null,index:7,hash:hash('What about pizza?')}]){
  const env=await setup({html:'',before:request(turn)});const {w,d,scrolled}=env;try{
   assert.equal(await w.ChatTidyLibrary.takeJump('chatgpt',chat),null,'taken once');await wait(300);
   d.querySelector('#thread').innerHTML=thread(bread);await wait(320);
   const target=d.querySelectorAll('[data-message-author-role="user"]')[1];
   assert.equal(scrolled.at(-1),target);assert.ok(target.firstElementChild.hasAttribute('data-cs-flash'));
  }finally{env.close();}
 }
 // A windowed site shows only later turns: the saved one (u0) is missing, and turn index 0 is someone else.
 const later=[['Third','<p>c</p>'],['Fourth','<p>d</p>']].map(([q,a],i)=>message('user','u'+(i+2),q)+message('assistant','a'+(i+2),a)).join('');
 const env=await setup({html:later,before:request({id:'u0',index:0,hash:hash('How do I bake bread?')})});const {d,scrolled}=env;try{
  let pulled=0;Object.defineProperty(d.documentElement,'scrollTop',{configurable:true,get:()=>0,set:()=>{pulled++;}});
  await wait(2000);assert.equal(scrolled.length,0,'no stand-in turn by position');assert.equal(pulled,0);
  await wait(1400);assert.equal(pulled,1,'the thread is scrolled to the top once to load older turns');assert.equal(scrolled.length,0);
  d.querySelector('#thread').insertAdjacentHTML('afterbegin',message('user','u0','How do I bake bread?')+message('assistant','a0','<p>Flour.</p>'));await wait(1000);
  assert.equal(scrolled.at(-1),d.querySelector('[data-message-id="u0"]'),'found once the site loads it');assert.equal(pulled,1);
 }finally{env.close();}
 const other=await setup({before:w=>w.ChatTidyLibrary.requestJump({key:'k',site:'chatgpt',chatId:uuid('2'),turn:{id:'u1'}})});try{
  await wait(100);assert.equal(other.scrolled.length,0);assert.ok(await other.w.ChatTidyLibrary.takeJump('chatgpt',uuid('2')),'a jump for another chat stays');
 }finally{other.close();}
});
test('a jump that never finds its turn gives up silently after about 8 s and puts the reader back',{timeout:15000},async()=>{
 const env=await setup({before:w=>w.ChatTidyLibrary.requestJump({key:'k',site:'chatgpt',chatId:uuid('1'),turn:{id:'gone',index:1,hash:'nope'}})});const {d,scrolled}=env;try{
  // The reader sat 600px down a 2000px page; older history (300px) loads above while the jump looks for its turn.
  let top=600,height=2000;const writes=[];
  Object.defineProperty(d.documentElement,'scrollTop',{configurable:true,get:()=>top,set:v=>{writes.push(v);top=v;}});
  Object.defineProperty(d.documentElement,'scrollHeight',{configurable:true,get:()=>height});
  await wait(3200);assert.deepEqual(writes,[0],'pulled to the top once');height=2300;
  await wait(5400);d.querySelector('#thread').insertAdjacentHTML('beforeend',message('user','gone','Late'));await wait(1200);
  assert.equal(scrolled.length,0);assert.deepEqual(writes,[0,900],'back at the same distance from the bottom');
 }finally{env.close();}
});
test('wired through content.js: sidebar syncs leave the search alone, a language change rebuilds, disabling removes it',async()=>{
 const url=`https://chatgpt.com/c/${uuid('1')}`;
 const dom=new JSDOM(`<!doctype html><title>Plan trip - ChatGPT</title><body><nav><h2>聊天</h2><div id="history"><div class="row"><a href="/c/${uuid('2')}"><span>Chat 2</span></a></div></div></nav><main><div id="thread">${thread(bread)}</div></main></body>`,{url,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document;
 w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{width:100,height:20}]};w.HTMLElement.prototype.scrollIntoView=function(){};
 const store={language:'en'},listeners=[];
 w.chrome={runtime:{id:'test',onMessage:{addListener(){}}},storage:{onChanged:{addListener:fn=>listeners.push(fn),removeListener:fn=>{const i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);}},local:{
  get:async defaults=>Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,k in store?plain(store[k]):v])),
  set:async values=>{const changes={};for(const [k,v] of Object.entries(values)){changes[k]={newValue:plain(v)};store[k]=plain(v);}for(const fn of [...listeners])fn(changes,'local');},remove:async()=>{}}}};
 w.ChatTidyBatch={run:async job=>({completed:job.ids}),cancel(){}};
 try{
  for(const f of ['core','i18n','library','reader-sites','reader','content'])w.eval(fs.readFileSync(`src/${f}.js`,'utf8'));
  await wait(200);
  assert.equal(d.querySelectorAll('.cs-reader').length,1);assert.equal(d.querySelectorAll('.cs-reader-tick').length,3);
  const input=d.querySelector('.cs-reader-search-input');input.value='bread';input.dispatchEvent(new w.Event('input',{bubbles:true}));await wait(220);
  assert.equal(d.querySelector('.cs-reader-count').textContent,'1 of 3');
  d.querySelector('.cs-checkbox').click();await wait(150);
  assert.match(d.querySelector('.cs-toolbar .cs-count').textContent,/1/);assert.equal(d.querySelector('.cs-reader-count').textContent,'1 of 3','the sidebar count never writes into the reader');
  await w.chrome.storage.local.set({language:'fr'});await wait(120);
  assert.equal(d.querySelectorAll('.cs-reader').length,1);assert.equal(d.querySelector('.cs-reader-panel-title').firstChild.textContent,w.ChatTidyI18n.t('fr','outlineTitle'));
  assert.equal(d.querySelector('.cs-reader-count').textContent,w.ChatTidyI18n.t('fr','searchCount',{current:1,total:3}),'the search survives the rebuild');
  await w.chrome.storage.local.set({enabled:false});await wait(120);
  assert.equal(d.querySelectorAll('.cs-reader,[data-cs-owned]').length,0);
  await w.chrome.storage.local.set({enabled:true});await wait(150);assert.equal(d.querySelectorAll('.cs-reader-tick').length,3);
 }finally{dom.window.close();}
});
