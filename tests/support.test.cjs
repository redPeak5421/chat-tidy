const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('Safari popup has no payment entry and settings still persist',async()=>{
 const dom=new JSDOM(fs.readFileSync('popup.html','utf8'),{url:'https://extension.test/',runScripts:'outside-only'}),w=dom.window,saved={};
 try{
 w.browser={storage:{local:{get:async d=>d,set:async d=>Object.assign(saved,d)}},tabs:{query:async()=>[]}};
 w.eval(fs.readFileSync('src/i18n.js','utf8'));w.eval(fs.readFileSync('src/popup.js','utf8'));await new Promise(r=>setTimeout(r,0));
 assert.equal(w.document.querySelector('[data-support],.support-section,iframe'),null);
 const urls=[...w.document.querySelectorAll('a[href]')].map(a=>a.href);
 assert.deepEqual(urls,['https://github.com/redPeak5421/chat-tidy']);
 const language=w.document.querySelector('#language');language.value='fr';language.dispatchEvent(new w.Event('change'));await new Promise(r=>setTimeout(r,0));
 assert.equal(saved.language,'fr');assert.equal(w.document.querySelector('[data-i18n="help"]').textContent,'Mode d’emploi');
 }finally{w.close();}
});
test('packaged source trees contain no donation pages, links, translations or assets',()=>{
 const banned=/ko-fi\.com|afdian\.com|kofi-logo|afdian-logo|data-support|supportPanel|supportTitle|supportHint|supportOfficial|supportOpenError|afdianName/;
 function check(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())check(file);else{assert.doesNotMatch(entry.name,/^(support\.(html|js|css)|(?:kofi|afdian)-logo\.png)$/);if(/\.(?:js|html|css|json|svg)$/.test(file))assert.doesNotMatch(fs.readFileSync(file,'utf8'),banned,file);}}}
 for(const dir of ['src','icons','_locales'])check(dir);
});
