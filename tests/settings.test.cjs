const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
async function popup(site='chatgpt',initial={}){
 const dom=new JSDOM(fs.readFileSync('popup.html','utf8'),{url:'https://extension.test',runScripts:'outside-only'}),w=dom.window;
 const saved={language:'en',...initial};w.matchMedia=()=>({matches:false,addEventListener(){}});
 w.chrome={runtime:{getManifest:()=>JSON.parse(fs.readFileSync('manifest.json','utf8'))},storage:{local:{get:async defaults=>({...defaults,...saved}),set:async data=>Object.assign(saved,data)}},tabs:{query:async()=>[{id:1}],sendMessage:async()=>({site})}};
 for(const name of ['core','i18n','popup'])w.eval(fs.readFileSync('src/'+name+'.js','utf8'));await new Promise(r=>setTimeout(r,0));return {w,d:w.document,saved};
}
test('settings secondary page and local theme survive reopening',async()=>{
 const {w,d,saved}=await popup();try{assert.ok(d.querySelector('#open-settings'),'settings entry');d.querySelector('#open-settings').click();assert.equal(d.querySelector('#settings-page').hidden,false);assert.equal(d.querySelector('#main-page').hidden,true);const theme=d.querySelector('#theme');assert.equal(theme.value,'system');theme.value='dark';theme.dispatchEvent(new w.Event('change'));await new Promise(r=>setTimeout(r,0));assert.equal(saved.theme,'dark');assert.equal(d.documentElement.dataset.theme,'dark');const again=await popup('chatgpt',saved);assert.equal(again.d.querySelector('#theme').value,'dark');again.w.close();d.querySelector('#back-settings').click();assert.equal(d.querySelector('#main-page').hidden,false);}finally{w.close();}
});
test('Bots settings are Grok-only with false defaults and local persistence',async()=>{
 for(const site of ['chatgpt','claude','grok']){const {w,d,saved}=await popup(site);try{const block=d.querySelector('#grok-bots-options');assert.ok(block,'Bots options');assert.equal(block.hidden,site!=='grok');for(const key of ['grokHideBots','grokCollapseBots']){const input=d.getElementById(key);assert.equal(input.checked,false);if(site==='grok'){input.checked=true;input.dispatchEvent(new w.Event('change'));await new Promise(r=>setTimeout(r,0));assert.equal(saved[key],true);}}}finally{w.close();}}
});
test('settings page describes per-site capabilities as a translated list',async()=>{
 const {w,d}=await popup('chatgpt',{language:'zh-CN'});try{const about=d.querySelector('#settings-page .about');assert.ok(about,'about section');assert.equal(about.tagName,'DETAILS');assert.equal(about.open,false,'collapsed by default');assert.equal(about.querySelector('summary'),about.querySelector('.about-title'));const items=[...about.querySelectorAll('ul li')].map(li=>li.textContent);assert.equal(items.length,7);for(const name of ['ChatGPT','Claude','Grok','Gemini','Kimi','Qwen','Z.ai'])assert.ok(items.some(text=>text.startsWith(name)),name);assert.match(about.querySelector('.about-title').textContent,/ChatGPT.*Claude.*Grok.*Gemini.*Kimi.*Qwen.*Z\.ai/);assert.match(items.find(text=>text.startsWith('Kimi')),/批量删除/);}finally{w.close();}
});
test('archive button only appears on ChatGPT and Qwen',async()=>{
 for(const site of ['chatgpt','claude','grok','gemini','kimi','qwen']){const {w,d}=await popup(site);try{assert.equal(d.querySelector('#open-archive').hidden,!['chatgpt','qwen'].includes(site));}finally{w.close();}}
});
test('hide support removes the whole section including its collapsed heading',async()=>{
 const {w,d,saved}=await popup();try{const section=d.querySelector('.support-section');assert.ok(section);assert.equal(section.hidden,false);const input=d.getElementById('hideSupport');assert.equal(input.checked,false);input.checked=true;input.dispatchEvent(new w.Event('change'));await new Promise(r=>setTimeout(r,0));assert.equal(section.hidden,true);assert.equal(saved.hideSupport,true);const again=await popup('chatgpt',saved);assert.equal(again.d.querySelector('.support-section').hidden,true);again.w.close();}finally{w.close();}
});
test('support cards keep their two-column card layout styles',()=>{
 if(!fs.readFileSync('popup.html','utf8').includes('support-section'))return; // the Safari build ships no support cards
 const css=fs.readFileSync('src/popup.css','utf8');assert.match(css,/\.support-cards\{[^}]*display:grid;grid-template-columns:repeat\(2,/,'two-column grid');assert.match(css,/\.support-card\{[^}]*display:flex[^}]*text-decoration:none/,'card link styled as a card');assert.match(css,/\.support-arrow\{[^}]*margin-left:auto/,'arrow pushed right');
});

test('popup displays the installed manifest version across language changes',async()=>{
 const {w,d}=await popup();try{const version=JSON.parse(fs.readFileSync('manifest.json','utf8')).version;assert.equal(d.querySelector('#extension-version').textContent,version);const language=d.querySelector('#language');language.value='zh-CN';language.dispatchEvent(new w.Event('change'));await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelector('#extension-version').textContent,version);}finally{w.close();}
});
test('concurrency offers exactly 1, 3, 5, 10 and 15, defaults to 5 and stores numbers',async()=>{
 const {w,d,saved}=await popup();try{
  const inputs=[...d.querySelectorAll('input[name="concurrency"]')];
  assert.deepEqual(inputs.map(input=>Number(input.value)),Array.from(w.ChatTidyCore.concurrencyOptions));assert.deepEqual(inputs.map(input=>input.value),['1','3','5','10','15']);
  assert.equal(d.querySelector('input[name="concurrency"]:checked').value,'5');
  const fifteen=inputs.at(-1);fifteen.checked=true;fifteen.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));
  assert.equal(saved.concurrency,15);assert.equal(d.querySelector('input[name="concurrency"]:checked').value,'15');
  assert.match(d.getElementById('concurrency-note').textContent,/Default 5/);
 }finally{w.close();}
 // Values no longer offered (the old default 2) show the default the deletion falls back to; 1 and 3 stay selected.
 for(const [stored,shown] of [[2,'5'],[0,'5'],[20,'5'],['5','5'],[null,'5'],[1,'1'],[3,'3'],[10,'10']]){
  const {w,d}=await popup('chatgpt',{concurrency:stored});try{assert.equal(d.querySelector('input[name="concurrency"]:checked')?.value,shown,'stored '+JSON.stringify(stored));}finally{w.close();}
 }
});

// Chat enhancements and the library page. This harness also loads src/library.js and fires storage change events.
async function popupWith(site='chatgpt',initial={}){
 const dom=new JSDOM(fs.readFileSync('popup.html','utf8'),{url:'https://extension.test',runScripts:'outside-only'}),w=dom.window;
 const saved={language:'en',...initial},listeners=new Set(),created=[];w.matchMedia=()=>({matches:false,addEventListener(){}});
 const set=async data=>{const changes={};for(const [k,v] of Object.entries(data)){changes[k]={newValue:v};saved[k]=v;}for(const fn of listeners)fn(changes,'local');};
 w.chrome={runtime:{getManifest:()=>JSON.parse(fs.readFileSync('manifest.json','utf8'))},storage:{local:{get:async defaults=>({...defaults,...saved}),set,remove:async key=>{delete saved[key];}},onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}},
  tabs:{query:async()=>site?[{id:1}]:[],sendMessage:async()=>({site}),create:async options=>{created.push({...options,jump:saved.readerJump?.key||null});return {id:2};}}};
 for(const name of ['core','i18n','library','popup'])w.eval(fs.readFileSync('src/'+name+'.js','utf8'));await new Promise(r=>setTimeout(r,0));return {w,d:w.document,saved,created,set};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
const day=86400000,now=Date.now();
const seeded={
 'chatgpt:c1':{key:'chatgpt:c1',type:'chat',site:'chatgpt',chatId:'c1',url:'https://chatgpt.com/c/c1',title:'Kyoto trip plan',tags:['travel','japan'],note:'Book the ryokan first',savedAt:now-9*day,updatedAt:now-2*day},
 'claude:c2#id:m1':{key:'claude:c2#id:m1',type:'answer',site:'claude',chatId:'c2',url:'https://claude.ai/chat/c2',title:'Rust lifetimes',tags:['code'],note:'',savedAt:now-day,updatedAt:now-60000,turn:{id:'m1',index:1,hash:'h1'},question:'Why does the borrow checker reject this?',excerpt:'Because the reference outlives its owner.'},
 'gemini:c3':{key:'gemini:c3',type:'chat',site:'gemini',chatId:'c3',url:'https://gemini.google.com/app/c3',title:'',tags:['travel'],note:'',savedAt:now-40*day,updatedAt:now-30*day}
};
const visible=d=>[...d.querySelectorAll('#library-list .library-item')].map(li=>li.dataset.key);
test('chat enhancement settings save to storage with their defaults',async()=>{
 const {w,d,saved}=await popupWith();try{
  const expected={outline:true,codeTools:true,codeLineNumbers:true,codeFold:true,codeDanger:true,compactSidebar:false,hideClutter:false,focusMode:false};
  for(const [key,value] of Object.entries(expected)){const input=d.getElementById(key);assert.equal(input.getAttribute('role'),'switch',key);assert.equal(input.checked,value,key);input.checked=!value;input.dispatchEvent(new w.Event('change'));await tick();assert.equal(saved[key],!value,key);if(key==='codeTools'){input.checked=true;input.dispatchEvent(new w.Event('change'));await tick();}}
  const width=d.getElementById('chatWidth');assert.deepEqual([...width.options].map(o=>o.value),['default','wide','full']);assert.deepEqual([...width.options].map(o=>o.textContent),['Site default','Wide','Full width']);assert.equal(width.value,'default');
  width.value='full';width.dispatchEvent(new w.Event('change'));await tick();assert.equal(saved.chatWidth,'full');
  const again=await popupWith('chatgpt',saved);try{assert.equal(again.d.getElementById('chatWidth').value,'full');assert.equal(again.d.getElementById('focusMode').checked,true);assert.equal(again.d.getElementById('outline').checked,false);}finally{again.w.close();}
  const bad=await popupWith('chatgpt',{chatWidth:'huge'});try{assert.equal(bad.d.getElementById('chatWidth').value,'default','unknown stored width shows the default');}finally{bad.w.close();}
 }finally{w.close();}
});
test('home keeps every original element and adds one chat enhancements entry before the guide',async()=>{
 const {w,d}=await popupWith();try{
  const order=[...d.getElementById('main-page').children].map(n=>n.id||n.className||n.tagName.toLowerCase());
  assert.deepEqual(order,['open-archive','settings','open-enhance','details','refresh','privacy','support-section']);
  const entry=d.getElementById('open-enhance');assert.equal(entry.tagName,'BUTTON');assert.match(entry.className,/\bnavigation\b/);
  assert.equal(entry.querySelector('.copy>span').textContent,'Chat enhancements');assert.equal(entry.querySelector('small').textContent,'Outline, search, bookmarks, code blocks and page layout');
  assert.equal(d.querySelector('#main-page input#outline,#main-page input#codeTools,#main-page #open-library'),null,'no feature switches or library row on the home page');
  assert.ok(d.querySelector('section.settings #enabled')&&d.querySelector('section.settings #concurrency'),'original settings untouched');
  assert.ok(d.querySelector('script[src="src/library.js"]').compareDocumentPosition(d.querySelector('script[src="src/popup.js"]'))&4,'library loads before popup');
  const zh=await popupWith('chatgpt',{language:'zh-CN'});try{assert.equal(zh.d.querySelector('#open-enhance .copy>span').textContent,'对话增强');assert.equal(zh.d.querySelector('#open-enhance small').textContent,'目录、搜索、收藏、代码块和页面布局');}finally{zh.w.close();}
 }finally{w.close();}
});
test('chat enhancements page explains where each feature appears, in order',async()=>{
 const {w,d}=await popupWith('chatgpt',{language:'zh-CN'});try{
  d.getElementById('open-enhance').click();const page=d.getElementById('enhance-page');
  assert.equal(page.hidden,false);assert.equal(d.getElementById('main-page').hidden,true);assert.equal(d.activeElement,d.getElementById('back-enhance'));
  assert.deepEqual([...page.children].map(n=>n.id||n.className||n.tagName.toLowerCase()),['back-enhance','enhance-title','page-intro','outline-feature','open-library','code-feature','layout-feature']);
  assert.equal(d.getElementById('enhance-title').textContent,'对话增强');assert.match(page.querySelector('.page-intro').textContent,/打开某个对话后/);
  const text=id=>d.querySelector('#'+id+' .feature-text').textContent;
  assert.equal(d.getElementById('outline-title').textContent,'对话目录与搜索');assert.match(text('outline-feature'),/^打开任意对话后，聊天区右侧出现一列细刻度/);
  assert.equal(d.querySelector('#open-library .copy>span').textContent,'我的收藏');assert.match(d.querySelector('#open-library small').textContent,/^在目录里收藏的对话和回答都在这里/);
  assert.equal(d.getElementById('code-title').textContent,'代码块增强');assert.match(text('code-feature'),/超过 24 行自动折叠/);assert.match(text('code-feature'),/rm -rf \//);
  assert.equal(d.getElementById('layout-title').textContent,'页面布局');assert.match(text('layout-feature'),/恢复网站原样/);
  for(const id of ['outline-feature','code-feature','layout-feature']){const art=d.querySelector('#'+id+' svg.ill');assert.ok(art,id+' illustration');assert.equal(art.getAttribute('aria-hidden'),'true');}
  assert.deepEqual([...d.querySelectorAll('#outline-feature input')].map(i=>i.id),['outline']);
  assert.deepEqual([...d.querySelectorAll('#code-feature input')].map(i=>i.id),['codeTools','codeLineNumbers','codeFold','codeDanger']);
  assert.deepEqual([...d.querySelectorAll('#code-options input')].map(i=>i.id),['codeLineNumbers','codeFold','codeDanger'],'sub-options sit under the master switch');
  assert.deepEqual([...d.querySelectorAll('#layout-feature select,#layout-feature input')].map(i=>i.id),['chatWidth','compactSidebar','hideClutter','focusMode']);
  const hints=[...d.querySelectorAll('#layout-feature [data-feature] small')].map(s=>s.textContent);assert.equal(hints.length,4);
  for(const [i,feature] of ['chatWidth','compactSidebar','hideClutter','focusMode'].entries())assert.equal(hints[i],w.ChatTidyCore.supports('chatgpt',feature)?w.ChatTidyI18n.t('zh-CN',feature+'Hint'):'此网站暂不支持',feature);
  d.getElementById('back-enhance').click();assert.equal(d.getElementById('main-page').hidden,false);assert.equal(page.hidden,true);assert.equal(d.activeElement,d.getElementById('open-enhance'));
 }finally{w.close();}
});
test('settings page is back to its original contents',async()=>{
 const {d}=await popupWith();try{
  const page=d.getElementById('settings-page');assert.deepEqual([...page.children].map(n=>n.id||n.className||n.tagName.toLowerCase()),['back-settings','h2','settings','about']);
  assert.deepEqual([...page.querySelectorAll('select,input')].map(n=>n.id),['theme','hideSupport','grokHideBots','grokCollapseBots']);
  assert.equal(page.querySelector('[data-feature],#chatWidth,#codeTools'),null,'no reading tool controls in settings');
 }finally{d.defaultView.close();}
});
test('code sub-options are inactive while the code block master switch is off',async()=>{
 const {w,d,saved}=await popupWith();try{
  for(const key of ['codeLineNumbers','codeFold','codeDanger'])assert.equal(d.getElementById(key).disabled,false);
  const code=d.getElementById('codeTools');code.checked=false;code.dispatchEvent(new w.Event('change'));await tick();assert.equal(saved.codeTools,false);
  for(const key of ['codeLineNumbers','codeFold','codeDanger'])assert.equal(d.getElementById(key).disabled,true,key);assert.ok(d.getElementById('code-options').hasAttribute('data-off'));
  code.checked=true;code.dispatchEvent(new w.Event('change'));await tick();assert.equal(d.getElementById('codeFold').disabled,false);assert.equal(d.getElementById('code-options').hasAttribute('data-off'),false);
  const off=await popupWith('chatgpt',{codeTools:false});try{assert.equal(off.d.getElementById('codeDanger').disabled,true,'reopened popup keeps them inactive');}finally{off.w.close();}
 }finally{w.close();}
});
test('features a site lacks keep their row with a not-available hint',async()=>{
 for(const site of ['chatgpt','claude',null,'example']){const {w,d}=await popupWith(site);try{
  const rows=[...d.querySelectorAll('[data-feature]')];assert.deepEqual(rows.map(r=>r.dataset.feature),['outline','codeTools','chatWidth','compactSidebar','hideClutter','focusMode']);
  for(const row of rows){const off=!!site&&!w.ChatTidyCore.supports(site,row.dataset.feature);assert.equal(row.classList.contains('unsupported'),off,site+' '+row.dataset.feature);if(off)assert.equal(row.querySelector('small').textContent,'Not available on this site yet');}
  if(site==='example')assert.equal(rows.every(r=>r.classList.contains('unsupported')),true);
  if(!site)assert.equal(d.querySelector('[data-feature="compactSidebar"] small').textContent,'Tighter rows in the chat list on the left, so more chats fit on screen.');
  assert.equal(d.querySelector('[data-feature="outline"] small').textContent,site==='example'?'Not available on this site yet':'','titles carry no hint unless the site lacks the feature');
 }finally{w.close();}}
});
test('library page lists bookmarks newest first and filters by type, tag and text',async()=>{
 const {w,d}=await popupWith('chatgpt',{library:seeded});try{
  assert.equal(d.getElementById('library-count').textContent,'3');
  d.getElementById('open-enhance').click();d.getElementById('open-library').click();assert.equal(d.getElementById('library-page').hidden,false);assert.equal(d.getElementById('enhance-page').hidden,true);assert.equal(d.activeElement,d.getElementById('library-search'),'quick find starts in the search field');
  assert.deepEqual(visible(d),['claude:c2#id:m1','chatgpt:c1','gemini:c3']);
  const [answer,chat,untitled]=d.querySelectorAll('.library-item');
  assert.equal(answer.querySelector('.item-title').textContent,'Rust lifetimes');assert.equal(answer.querySelector('.item-question').textContent,'Why does the borrow checker reject this?');assert.equal(answer.querySelector('.item-site').textContent,'Claude');
  assert.equal(chat.querySelector('.item-question'),null);assert.equal(chat.querySelector('.item-note').textContent,'Book the ryokan first');assert.deepEqual([...chat.querySelectorAll('.item-tag')].map(n=>n.textContent),['travel','japan']);assert.match(chat.querySelector('.item-date').textContent,/2/);
  assert.equal(untitled.querySelector('.item-title').textContent,'Untitled chat');assert.equal(untitled.querySelector('.item-site').textContent,'Gemini');
  assert.equal(answer.querySelector('.item-remove').title,'Remove bookmark');
  assert.deepEqual([...d.querySelectorAll('[data-count]')].map(n=>n.textContent),['3','2','1']);
  const radio=v=>d.querySelector(`input[name="libraryType"][value="${v}"]`);
  radio('answer').checked=true;radio('answer').dispatchEvent(new w.Event('change'));assert.deepEqual(visible(d),['claude:c2#id:m1']);
  radio('chat').checked=true;radio('chat').dispatchEvent(new w.Event('change'));assert.deepEqual(visible(d),['chatgpt:c1','gemini:c3']);
  radio('all').checked=true;radio('all').dispatchEvent(new w.Event('change'));
  const chips=[...d.querySelectorAll('.tag-chip')];assert.deepEqual(chips.map(c=>c.firstChild.textContent+c.lastChild.textContent),['travel2','code1','japan1']);
  chips[0].click();assert.deepEqual(visible(d),['chatgpt:c1','gemini:c3']);assert.equal(d.querySelector('.tag-chip[aria-pressed="true"]').dataset.tag,'travel');
  d.querySelector('.tag-chip[aria-pressed="true"]').click();assert.equal(d.querySelector('.tag-chip[aria-pressed="true"]'),null,'tap again clears');assert.equal(visible(d).length,3);
  const search=d.getElementById('library-search');assert.equal(search.placeholder,'Search titles, tags and notes');
  search.value='RYOKAN';search.dispatchEvent(new w.Event('input'));assert.deepEqual(visible(d),['chatgpt:c1']);assert.equal(d.querySelector('.item-note mark').textContent,'ryokan','match highlighted');
  assert.deepEqual([...d.querySelectorAll('[data-count]')].map(n=>n.textContent),['1','1','0'],'counts follow the query');
  search.value='nothing like this';search.dispatchEvent(new w.Event('input'));assert.deepEqual(visible(d),[]);const empty=d.getElementById('library-empty');assert.equal(empty.hidden,false);assert.equal(empty.textContent,'No bookmarks match');assert.equal(empty.dataset.state,'no-match');
  d.getElementById('back-library').click();assert.equal(d.getElementById('enhance-page').hidden,false,'back returns to chat enhancements');assert.equal(d.getElementById('library-page').hidden,true);assert.equal(d.activeElement,d.getElementById('open-library'));
 }finally{w.close();}
});
test('library opens items in a new tab, asks answers to jump, removes bookmarks and follows live changes',async()=>{
 const {w,d,saved,created,set}=await popupWith('chatgpt',{library:seeded});try{
  d.getElementById('open-library').click();
  d.querySelector('[data-key="chatgpt:c1"] .item-open').click();await tick();
  d.querySelector('[data-key="claude:c2#id:m1"] .item-open').click();await tick();
  assert.equal(JSON.stringify(created),JSON.stringify([{url:'https://chatgpt.com/c/c1',active:true,jump:null},{url:'https://claude.ai/chat/c2',active:true,jump:'claude:c2#id:m1'}]),'answers request the jump before the tab opens');
  assert.equal(JSON.stringify(saved.readerJump.turn),JSON.stringify({id:'m1',index:1,hash:'h1'}));
  d.querySelector('[data-key="chatgpt:c1"] .item-remove').click();await tick();await tick();
  assert.deepEqual(Object.keys(saved.library).sort(),['claude:c2#id:m1','gemini:c3']);assert.deepEqual(visible(d),['claude:c2#id:m1','gemini:c3']);assert.equal(d.getElementById('library-count').textContent,'2');
  assert.equal(d.activeElement.className,'item-remove','focus stays in the list');
  // Another tab bookmarks an answer while the popup is open.
  await set({library:{...saved.library,'kimi:k1':{key:'kimi:k1',type:'chat',site:'kimi',chatId:'k1',url:'https://www.kimi.com/chat/k1',title:'Fresh',tags:[],note:'',savedAt:Date.now(),updatedAt:Date.now()}}});
  assert.deepEqual(visible(d),['kimi:k1','claude:c2#id:m1','gemini:c3']);
  for(const key of ['kimi:k1','claude:c2#id:m1','gemini:c3']){d.querySelector(`[data-key="${key}"] .item-remove`).click();await tick();await tick();}
  assert.equal(Object.keys(saved.library).length,0);const empty=d.getElementById('library-empty');assert.equal(empty.hidden,false);assert.equal(empty.dataset.state,'empty');assert.match(empty.textContent,/^Nothing saved yet/);
  assert.equal(d.getElementById('library-tools').hidden,true,'no search tools over an empty library');assert.equal(d.getElementById('library-count').textContent,'');
 }finally{w.close();}
});
test('an empty library opens on the back button and Enter in search opens the first match',async()=>{
 const empty=await popupWith('chatgpt');try{empty.d.getElementById('open-library').click();assert.equal(empty.d.activeElement,empty.d.getElementById('back-library'));assert.equal(empty.d.getElementById('library-empty').hidden,false);}finally{empty.w.close();}
 const {w,d,created}=await popupWith('chatgpt',{library:seeded});try{
  d.getElementById('open-library').click();const search=d.getElementById('library-search');search.value='kyoto';search.dispatchEvent(new w.Event('input'));
  search.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();assert.equal(created.length,1);assert.equal(created[0].url,'https://chatgpt.com/c/c1');
 }finally{w.close();}
});
test('popup styles keep long library rows inside the 440px popup',()=>{
 const css=fs.readFileSync('src/popup.css','utf8');
 assert.match(css,/\.library-tools\{position:sticky;top:0/,'search stays pinned while the list scrolls');
 for(const name of ['item-title','item-question'])assert.match(css,new RegExp('\\.'+name+'[^{]*\\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap'),name);
 assert.match(css,/\.item-open\{[^}]*min-width:0/);assert.match(css,/\.tag-filter\{[^}]*flex-wrap:wrap/);
 assert.match(css,/input\[role="switch"\]:focus-visible/);assert.match(css,/:is\(\.tag-chip,\.item-remove\):focus-visible/);
});
test('only one popup page shows at a time, and settings returns to the page it was opened from',async()=>{
 const {w,d}=await popupWith('chatgpt');try{
  const pages=['main-page','settings-page','enhance-page','library-page'],shown=()=>pages.filter(id=>!d.getElementById(id).hidden);
  assert.deepEqual(shown(),['main-page']);
  d.getElementById('open-enhance').click();assert.deepEqual(shown(),['enhance-page']);
  d.getElementById('open-settings').click();assert.deepEqual(shown(),['settings-page'],'the gear never stacks settings on another page');
  d.getElementById('back-settings').click();assert.deepEqual(shown(),['enhance-page'],'back returns to where settings was opened');
  d.getElementById('open-library').click();assert.deepEqual(shown(),['library-page']);
  d.getElementById('open-settings').click();assert.deepEqual(shown(),['settings-page']);
  d.getElementById('back-settings').click();assert.deepEqual(shown(),['library-page']);
  d.getElementById('back-library').click();d.getElementById('back-enhance').click();assert.deepEqual(shown(),['main-page']);
  d.getElementById('open-settings').click();d.getElementById('back-settings').click();assert.deepEqual(shown(),['main-page']);
  assert.equal(d.activeElement,d.getElementById('open-settings'),'focus returns to the gear');
 }finally{w.close();}
});
