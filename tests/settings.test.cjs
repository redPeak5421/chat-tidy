const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
async function popup(site='chatgpt',initial={}){
 const dom=new JSDOM(fs.readFileSync('popup.html','utf8'),{url:'https://extension.test',runScripts:'outside-only'}),w=dom.window;
 const saved={language:'en',...initial};w.matchMedia=()=>({matches:false,addEventListener(){}});
 w.chrome={storage:{local:{get:async defaults=>({...defaults,...saved}),set:async data=>Object.assign(saved,data)}},tabs:{query:async()=>[{id:1}],sendMessage:async()=>({site})}};
 for(const name of ['i18n','popup'])w.eval(fs.readFileSync('src/'+name+'.js','utf8'));await new Promise(r=>setTimeout(r,0));return {w,d:w.document,saved};
}
test('settings secondary page and local theme survive reopening',async()=>{
 const {w,d,saved}=await popup();try{assert.ok(d.querySelector('#open-settings'),'settings entry');d.querySelector('#open-settings').click();assert.equal(d.querySelector('#settings-page').hidden,false);assert.equal(d.querySelector('#main-page').hidden,true);const theme=d.querySelector('#theme');assert.equal(theme.value,'system');theme.value='dark';theme.dispatchEvent(new w.Event('change'));await new Promise(r=>setTimeout(r,0));assert.equal(saved.theme,'dark');assert.equal(d.documentElement.dataset.theme,'dark');const again=await popup('chatgpt',saved);assert.equal(again.d.querySelector('#theme').value,'dark');again.w.close();d.querySelector('#back-settings').click();assert.equal(d.querySelector('#main-page').hidden,false);}finally{w.close();}
});
test('Bots settings are Grok-only with false defaults and local persistence',async()=>{
 for(const site of ['chatgpt','claude','grok']){const {w,d,saved}=await popup(site);try{const block=d.querySelector('#grok-bots-options');assert.ok(block,'Bots options');assert.equal(block.hidden,site!=='grok');for(const key of ['grokHideBots','grokCollapseBots']){const input=d.getElementById(key);assert.equal(input.checked,false);if(site==='grok'){input.checked=true;input.dispatchEvent(new w.Event('change'));await new Promise(r=>setTimeout(r,0));assert.equal(saved[key],true);}}}finally{w.close();}}
});
test('settings page describes per-site capabilities as a translated list',async()=>{
 const {w,d}=await popup('chatgpt',{language:'zh-CN'});try{const about=d.querySelector('#settings-page .about');assert.ok(about,'about section');assert.equal(about.tagName,'DETAILS');assert.equal(about.open,false,'collapsed by default');assert.equal(about.querySelector('summary'),about.querySelector('.about-title'));const items=[...about.querySelectorAll('ul li')].map(li=>li.textContent);assert.equal(items.length,6);for(const name of ['ChatGPT','Claude','Grok','Gemini','Kimi','Qwen'])assert.ok(items.some(text=>text.startsWith(name)),name);assert.match(about.querySelector('.about-title').textContent,/ChatGPT.*Claude.*Grok.*Gemini.*Kimi.*Qwen/);assert.match(items.find(text=>text.startsWith('Kimi')),/批量删除/);}finally{w.close();}
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
