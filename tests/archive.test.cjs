const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
async function setup(){const dom=new JSDOM('<body></body>',{url:'https://chatgpt.com/',runScripts:'outside-only'}),w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.AbortSignal=AbortSignal;const calls=[];
 w.fetch=async(path)=>{calls.push(path);return {ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'test',user:{id:'account-a'}}:{items:[{id:ids[0],title:'Fictional archive',create_time:'2026-01-01'}],offset:0,limit:30,total:1}}};w.ChatTidyBatch={run:async job=>({completed:job.ids}),cancel(){}};
 for(const f of ['core','i18n'])w.eval(fs.readFileSync('src/'+f+'.js','utf8'));if(fs.existsSync('src/archive.js'))w.eval(fs.readFileSync('src/archive.js','utf8'));return {dom,w,d:w.document,calls};}
test('archive manager loads only archived list, confirms delete and restores selected records',async()=>{
 const {dom,w,d,calls}=await setup();try{assert.ok(w.ChatTidyArchive,'archive module');const manager=w.ChatTidyArchive.create({t:(k,v)=>w.ChatTidyI18n.t('en',k,v)});await manager.open();assert.ok(calls.some(p=>p.includes('is_archived=true')));const box=d.querySelector('.cs-archive-checkbox');assert.ok(box);box.click();d.querySelector('[data-archive-action="delete"]').click();assert.ok(d.querySelector('.cs-archive-confirm'));d.querySelector('[data-archive-cancel]').click();assert.ok(d.querySelector('.cs-archive-checkbox'));d.querySelector('[data-archive-action="restore"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelectorAll('.cs-archive-checkbox').length,0);manager.destroy();}finally{dom.window.close();}
});
test('native archive table receives scoped checkboxes and shared controls',async()=>{
 const {dom,w,d}=await setup();try{assert.ok(w.ChatTidyArchive,'archive module');d.body.innerHTML=`<div data-testid="modal-archived-conversations"><table><tbody><tr><td><a href="/c/${ids[0]}">Saved chat</a></td><td>date</td><td><button>restore</button></td></tr></tbody></table></div><main><a href="/c/${ids[1]}">Other</a></main>`;const manager=w.ChatTidyArchive.create({t:k=>k});manager.scan();assert.equal(d.querySelectorAll('.cs-archive-checkbox').length,1);assert.ok(d.querySelector('[data-archive-action="restore"]'));assert.equal(d.querySelector('main input'),null);manager.destroy();assert.equal(d.querySelectorAll('.cs-archive-checkbox').length,0);}finally{dom.window.close();}
});
test('native select all excludes successfully removed archive rows',async()=>{
 const {dom,w,d}=await setup();try{d.body.innerHTML=`<div data-testid="modal-archived-conversations"><table><tbody>${ids.map(id=>`<tr><td><a href="/c/${id}">Saved</a></td></tr>`).join('')}</tbody></table></div>`;const manager=w.ChatTidyArchive.create({t:k=>k});manager.scan();d.querySelector('.cs-archive-checkbox').click();d.querySelector('[data-archive-action="restore"]').click();await new Promise(r=>setTimeout(r,0));d.querySelector('[data-archive-action="all"]').click();assert.equal(d.querySelectorAll('.cs-archive-removed input:checked').length,0);manager.destroy();}finally{dom.window.close();}
});
test('closing and reopening shows freshly re-archived conversations',async()=>{
 const {dom,w,d}=await setup();try{const manager=w.ChatTidyArchive.create({t:k=>k});await manager.open();d.querySelector('.cs-archive-checkbox').click();d.querySelector('[data-archive-action="restore"]').click();await new Promise(r=>setTimeout(r,0));d.querySelector('.cs-archive-close').click();await manager.open();assert.equal(d.querySelectorAll('.cs-archive-checkbox').length,1);manager.destroy();}finally{dom.window.close();}
});
test('pagination preserves selection and select-all is limited to loaded chats',async()=>{
 const {dom,w,d}=await setup();try{w.fetch=async path=>({ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'t',user:{id:'a'}}:{items:[{id:ids[path.includes('offset=30')?1:0],title:'Page fixture'}],offset:path.includes('offset=30')?30:0,limit:30,total:31}});const manager=w.ChatTidyArchive.create({t:k=>k});await manager.open();d.querySelector('[data-archive-action="all"]').click();assert.equal(d.querySelectorAll('input:checked').length,1);d.querySelector('.cs-archive-more').click();await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelectorAll('.cs-archive-checkbox').length,2);assert.equal(d.querySelectorAll('input:checked').length,1);manager.destroy();}finally{w.close();}
});
test('native selection is rejected after account changes',async()=>{
 const {dom,w,d}=await setup();try{let user='a',writes=0;w.fetch=async()=>({ok:true,json:async()=>({accessToken:'t',user:{id:user}})});w.ChatTidyBatch.run=async()=>{writes++;return {completed:[]};};d.body.innerHTML=`<div data-testid="modal-archived-conversations"><table><tbody><tr><td><a href="/c/${ids[0]}">A archive</a></td></tr></tbody></table></div>`;const manager=w.ChatTidyArchive.create({t:k=>k});manager.scan();await new Promise(r=>setTimeout(r,0));d.querySelector('input').click();user='b';d.querySelector('[data-archive-action="restore"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(writes,0);assert.match(d.querySelector('.cs-archive-status').textContent,/account-changed/);manager.destroy();}finally{w.close();}
});
test('reopening during an in-flight operation loads once the old operation settles',async()=>{
 const {dom,w,d}=await setup();try{let finish;w.ChatTidyBatch.run=()=>new Promise(resolve=>finish=resolve);const manager=w.ChatTidyArchive.create({t:k=>k});await manager.open();d.querySelector('input').click();d.querySelector('[data-archive-action="restore"]').click();await new Promise(r=>setTimeout(r,0));d.querySelector('.cs-archive-close').click();await manager.open();finish({completed:[ids[0]]});await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelectorAll('.cs-archive-checkbox').length,1);manager.destroy();}finally{w.close();}
});
test('partial failure preserves only unfinished selections for retry',async()=>{
 const {dom,w,d}=await setup();try{w.fetch=async path=>({ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'t',user:{id:'a'}}:{items:ids.map(id=>({id,title:'Fixture'})),offset:0,limit:30,total:2}});w.ChatTidyBatch.run=async()=>({completed:[ids[0]],error:'http-500'});const manager=w.ChatTidyArchive.create({t:k=>k});await manager.open();d.querySelector('[data-archive-action="all"]').click();d.querySelector('[data-archive-action="restore"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(d.querySelectorAll('input:checked').length,1);assert.equal(d.querySelector('input:checked').dataset.id,ids[1]);assert.match(d.querySelector('.cs-archive-status').textContent,/http-500/);manager.destroy();}finally{w.close();}
});
test('Qwen archive manager lists the site archive, restores through the executor and has no native deep link',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://chat.qwen.ai/',runScripts:'outside-only'}),w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.AbortSignal=AbortSignal;
 try{
 const runs=[];w.ChatTidyBatch={run:async job=>{runs.push(job);return {completed:job.ids}},cancel(){}};
 w.ChatTidyQwen={session:async()=>'user-a',api:{archived:async()=>[{id:ids[0],title:'Saved one'},{id:ids[1],title:''}]}};
 for(const f of ['core','i18n','archive'])w.eval(fs.readFileSync('src/'+f+'.js','utf8'));
 const manager=w.ChatTidyArchive.create({t:(k,v)=>w.ChatTidyI18n.t('en',k,v),site:{id:'qwen',name:'Qwen'}});await manager.open();
 const d=w.document;assert.equal(d.querySelectorAll('.cs-archive-checkbox').length,2);assert.match(d.querySelector('.cs-archive-manager').textContent,/Untitled chat/);
 assert.equal(d.querySelector('.cs-archive-footer a'),null);assert.equal(d.querySelector('.cs-archive-more').hidden,true);
 d.querySelector('.cs-archive-checkbox').click();d.querySelector('[data-archive-action="restore"]').click();await new Promise(r=>setTimeout(r,0));
 assert.equal(runs.length,1);assert.equal(runs[0].action,'restore');assert.deepEqual(Array.from(runs[0].ids),[ids[0]]);assert.equal(runs[0].expectedUserId,'user-a');
 assert.equal(d.querySelectorAll('.cs-archive-checkbox').length,1);
 d.querySelector('.cs-archive-checkbox').click();d.querySelector('[data-archive-action="delete"]').click();assert.match(d.querySelector('.cs-archive-confirm').textContent,/Qwen/);
 manager.destroy();
 }finally{w.close();}
});
