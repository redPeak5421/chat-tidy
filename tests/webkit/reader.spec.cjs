const {test,expect}=require('@playwright/test');
const chat='11111111-1111-4111-8111-111111111111';
const questions=['How should I structure a small Express API?','What is the difference between a cache and a buffer?','Can you show a Redis cache example for sessions?','Why does my React effect run twice in development?','Explain database indexes like I am new to SQL','How do I invalidate a cache when the data changes?','What are good defaults for HTTP cache headers?','Write a regular expression for ISO dates','How do I profile a slow Node.js endpoint?','Compare WebSockets and server-sent events','Is it safe to store tokens in localStorage?','How do I paginate a large Postgres table?','Summarize the trade-offs of a CDN cache','What should a code review checklist include?'];
const answer=(q,i)=>`<p>Short answer for "${q.toLowerCase()}". ${i%3===1?'A cache keeps recent results close so the next read is cheap.':'Start with the simplest version and measure.'}</p><p>${'Details follow in a second paragraph that keeps the answer long enough to scroll. '.repeat(3+i%4)}</p>`;
const page_=(dark,full)=>`<!doctype html><meta charset="utf-8"><title>Backend notes - ChatGPT</title><style>
:root{color-scheme:${dark?'dark':'light'}}body{margin:0;height:100vh;display:flex;overflow:hidden;font:16px/1.65 ui-sans-serif,system-ui,-apple-system,sans-serif;background:${dark?'#212121':'#fff'};color:${dark?'#ececec':'#0d0d0d'}}
nav{width:260px;flex:none;background:${dark?'#181818':'#f9f9f9'};padding:12px;box-sizing:border-box;font-size:14px}nav div{padding:7px 10px;border-radius:8px;opacity:.8}
main{flex:1;min-width:0;display:flex;flex-direction:column}#page-header{height:52px;flex:none;display:flex;align-items:center;padding:0 16px;font-size:18px}
#scroll{flex:1;overflow-y:auto}.turn{max-width:${full?'none':'768px'};margin:0 auto;padding:10px ${full?'24px':'32px'};box-sizing:border-box}pre{position:relative;padding:12px;background:#0000000d;border-radius:8px}pre .copy{position:absolute;top:6px;right:6px}
[data-message-author-role=user]{display:flex;justify-content:flex-end;margin-top:28px}[data-message-author-role=user] .whitespace-pre-wrap{max-width:70%;background:${dark?'#303030':'#f4f4f4'};border-radius:18px;padding:10px 18px}
.composer{flex:none;height:96px;display:flex;align-items:center;justify-content:center}.composer div{width:min(720px,90%);height:52px;border-radius:26px;background:${dark?'#303030':'#fff'};box-shadow:0 0 0 1px ${dark?'#ffffff1a':'#0000001a'},0 4px 12px #0000000d}
</style><nav>${['Backend notes','Trip to Kyoto','Recipe scaling','Tax questions'].map(t=>`<div>${t}</div>`).join('')}</nav><main><div id="page-header">ChatGPT</div><div id="scroll">${questions.map((q,i)=>`<article class="turn"><div data-message-author-role="user" data-message-id="u${i}"><div class="whitespace-pre-wrap">${q}</div></div><div data-message-author-role="assistant" data-message-id="a${i}"><div class="markdown">${answer(q,i)}</div></div></article>`).join('')}</div><div class="composer"><div></div></div></main>`;
async function load(page,context,{dark=false,theme,full=false}={}){
 await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:page_(dark,full)}));
 await page.goto(`https://chatgpt.com/c/${chat}`);
 await page.evaluate(()=>{
  const store={},listeners=[];globalThis.__store=store;
  globalThis.chrome={runtime:{id:'test'},storage:{onChanged:{addListener:fn=>listeners.push(fn),removeListener(){}},local:{
   get:async d=>d==null?structuredClone(store):typeof d==='string'?(d in store?{[d]:structuredClone(store[d])}:{}):Array.isArray(d)?Object.fromEntries(d.filter(k=>k in store).map(k=>[k,structuredClone(store[k])])):Object.fromEntries(Object.entries(d).map(([k,v])=>[k,k in store?structuredClone(store[k]):v])),
   set:async v=>{const changes={};for(const [k,val] of Object.entries(v)){changes[k]={oldValue:store[k],newValue:structuredClone(val)};store[k]=structuredClone(val);}listeners.forEach(fn=>fn(changes,'local'));},
   remove:async k=>{const changes={};for(const key of [].concat(k))if(key in store){changes[key]={oldValue:store[key]};delete store[key];}listeners.forEach(fn=>fn(changes,'local'));}}}};
 });
 for(const f of ['core','i18n','library','reader-sites','reader'])await page.addScriptTag({path:`src/${f}.js`});
 await page.addStyleTag({path:'src/reader.css'});
 await page.evaluate(theme=>{
  if(theme)document.documentElement.dataset.csTheme=theme;
  const site=ChatTidyCore.siteForUrl(location.href);
  globalThis.__reader=ChatTidyReader.create({t:(k,v)=>ChatTidyI18n.t('en',k,v),site,adapter:ChatTidyReaderSites.get('chatgpt'),library:ChatTidyLibrary,titleOf:()=>''});
  __reader.update({...ChatTidyCore.settings,language:'en'});
 },theme);
 await expect(page.locator('.cs-reader-tick')).toHaveCount(questions.length);
}
const userTop=(page,i)=>page.evaluate(i=>{const s=document.querySelector('#scroll').getBoundingClientRect();return document.querySelectorAll('[data-message-author-role=user]')[i].getBoundingClientRect().top-s.top;},i);

test('the rail sits on the right edge of the chat, follows the reading position and jumps to a question',async({page,context})=>{
 await load(page,context);
 const rail=await page.locator('.cs-reader-rail').boundingBox(),scroll=await page.locator('#scroll').boundingBox(),view=page.viewportSize();
 expect(rail.x).toBeGreaterThan(scroll.x+scroll.width-60);expect(rail.x+rail.width).toBeLessThanOrEqual(scroll.x+scroll.width);
 expect(rail.y).toBeGreaterThanOrEqual(scroll.y);expect(rail.y+rail.height).toBeLessThanOrEqual(Math.min(view.height,scroll.y+scroll.height));
 await expect(page.locator('.cs-reader-tick').first()).toHaveAttribute('aria-current','true');
 const tick=page.locator('.cs-reader-tick').nth(9),box=await tick.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await expect(page.locator('.cs-reader-rail-label')).toHaveAttribute('data-show','');await expect(page.locator('.cs-reader-rail-text')).toHaveText(questions[9]);
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await expect.poll(()=>userTop(page,9)).toBeLessThan(40);expect(await userTop(page,9)).toBeGreaterThan(-40);
 await expect(page.locator('[data-message-author-role=user]').nth(9).locator('.whitespace-pre-wrap')).toHaveAttribute('data-cs-flash','');
 await page.screenshot({path:'artifacts/worker-reader/reader-jump-flash-light.png'});
 await expect(page.locator('.cs-reader-tick').nth(9)).toHaveAttribute('aria-current','true');
 await page.locator('#scroll').evaluate(n=>n.scrollTop=0);await expect(page.locator('.cs-reader-tick').first()).toHaveAttribute('aria-current','true');
});
test('the panel opens from the rail, search highlights and steps through matches, and an answer bookmark is saved',async({page,context})=>{
 await load(page,context);
 await page.locator('.cs-reader-rail-open').click();const panel=page.locator('.cs-reader-panel');await expect(panel).toBeVisible();
 await expect(page.locator('.cs-reader-search-input')).toBeFocused();
 const p=await panel.boundingBox(),view=page.viewportSize();expect(p.x+p.width).toBeLessThanOrEqual(view.width);expect(p.y).toBeGreaterThanOrEqual(0);expect(p.y+p.height).toBeLessThanOrEqual(view.height);
 const total=await page.evaluate(()=>[...document.querySelectorAll('[data-message-author-role]')].reduce((n,m)=>n+(m.textContent.toLowerCase().match(/cache/g)||[]).length,0));
 await page.keyboard.type('Cache');
 await expect(page.locator('.cs-reader-count')).toHaveText(`1 of ${total}`);
 expect(await page.evaluate(()=>CSS.highlights.get('cs-search').size)).toBe(total);
 const first=await page.evaluate(()=>[...CSS.highlights.get('cs-search-current')][0].getBoundingClientRect().top);
 await page.keyboard.press('Enter');await expect(page.locator('.cs-reader-count')).toHaveText(`2 of ${total}`);
 await page.keyboard.press('Enter');await page.keyboard.press('Enter');await expect(page.locator('.cs-reader-count')).toHaveText(`4 of ${total}`);
 await expect.poll(()=>page.evaluate(()=>{const r=[...CSS.highlights.get('cs-search-current')][0].getBoundingClientRect(),s=document.querySelector('#scroll').getBoundingClientRect();return Math.abs(r.top+r.height/2-(s.top+s.height/2));})).toBeLessThan(60);
 expect(await page.evaluate(()=>[...CSS.highlights.get('cs-search-current')][0].toString().toLowerCase())).toBe('cache');
 expect(first).not.toBeNaN();
 const rows=page.locator('.cs-reader-outline-row');expect(await rows.count()).toBeLessThan(questions.length);
 await page.keyboard.press('Shift+Enter');await expect(page.locator('.cs-reader-count')).toHaveText(`3 of ${total}`);
 const row=rows.first();await row.hover();await row.locator('.cs-reader-outline-mark').click();
 await expect(row.locator('.cs-reader-outline-mark')).toHaveAttribute('aria-pressed','true');
 const saved=await page.evaluate(async()=>Object.values(await ChatTidyLibrary.load()));
 expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({type:'answer',site:'chatgpt',chatId:chat,title:'Backend notes',question:questions[+await row.getAttribute('data-index')]});
 await page.locator('.cs-reader-search-input').press('Escape');await expect(rows).toHaveCount(questions.length);expect(await page.evaluate(()=>CSS.highlights.has('cs-search'))).toBe(false);
 await page.locator('.cs-reader-panel-head .cs-reader-icon').last().click();await expect(panel).toBeHidden();await expect(page.locator('.cs-reader-rail')).toBeVisible();
 expect(await page.evaluate(()=>__store.readerPanelOpen)).toBe(false);
 await page.evaluate(()=>__reader.update({...ChatTidyCore.settings,language:'en',outline:false}));
 await expect(page.locator('[data-cs-owned]')).toHaveCount(0);
});
test('in a full-width layout the rail leaves message content uncovered and only its ticks take the pointer',async({page,context})=>{
 await load(page,context,{full:true});
 await page.locator('.markdown').nth(2).evaluate(n=>n.insertAdjacentHTML('beforeend','<pre><button class="copy">Copy</button><code>npm install</code></pre>'));
 await page.evaluate(()=>__reader.update({...ChatTidyCore.settings,language:'en',chatWidth:'full'}));await page.waitForTimeout(100);
 const rail=await page.locator('.cs-reader-rail').boundingBox(),scroll=await page.locator('#scroll').boundingBox();
 const edge=await page.evaluate(()=>Math.max(...[...document.querySelectorAll('[data-message-author-role] > div')].map(n=>n.getBoundingClientRect().right)));
 expect(rail.x).toBeGreaterThanOrEqual(edge);expect(rail.x+rail.width).toBeLessThanOrEqual(scroll.x+scroll.width);
 expect(await page.locator('.cs-reader-rail').evaluate(n=>getComputedStyle(n).pointerEvents)).toBe('none');
 const gap=await page.evaluate(()=>{const open=document.querySelector('.cs-reader-rail-open').getBoundingClientRect(),ticks=document.querySelector('.cs-reader-rail-ticks').getBoundingClientRect(),x=open.left+open.width/2,y=(open.bottom+ticks.top)/2-2;return !!document.elementFromPoint(x,y)?.closest('.cs-reader');});
 expect(gap).toBe(false);
 const tick=await page.locator('.cs-reader-tick').nth(3).boundingBox();await page.mouse.move(tick.x+tick.width/2,tick.y+tick.height/2);
 await expect(page.locator('.cs-reader-rail-label')).toHaveAttribute('data-show','');
 await page.mouse.move(400,300);await expect(page.locator('.cs-reader-rail-label')).not.toHaveAttribute('data-show','');
 await page.screenshot({path:'artifacts/worker-reader/reader-rail-full-width.png'});
});
for(const theme of ['light','dark'])test(`reader screenshots (${theme})`,async({page,context})=>{
 await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
 await load(page,context,{dark:theme==='dark',theme});
 await page.locator('#scroll').evaluate(n=>n.scrollTop=n.scrollHeight*.32);
 const tick=page.locator('.cs-reader-tick').nth(7),box=await tick.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await expect(page.locator('.cs-reader-rail-label')).toHaveAttribute('data-show','');await page.waitForTimeout(250);
 await page.screenshot({path:`artifacts/worker-reader/reader-rail-${theme}.png`});
 await page.locator('.cs-reader-rail-open').click();await page.keyboard.type('cache');await expect(page.locator('.cs-reader-count')).not.toHaveText('');
 await page.locator('.cs-reader-outline-row').nth(1).locator('.cs-reader-outline-mark').click({force:true});
 await expect(page.locator('.cs-reader-outline-row').nth(1).locator('.cs-reader-outline-mark')).toHaveAttribute('aria-pressed','true');
 await page.locator('.cs-reader-search-input').press('Enter');await page.waitForTimeout(400);await page.mouse.move(10,10);
 await page.screenshot({path:`artifacts/worker-reader/reader-panel-${theme}.png`});
 await page.evaluate(()=>ChatTidyLibrary.put({type:'chat',site:'claude',chatId:'x',title:'Other',tags:['backend','caching','reading list']}));
 await page.locator('.cs-reader-tags-button').click();await page.keyboard.type('backend');await page.keyboard.press('Enter');
 await page.locator('.cs-reader-note').fill('Compare with the CDN notes from last week.');await page.waitForTimeout(600);
 await page.screenshot({path:`artifacts/worker-reader/reader-tags-${theme}.png`});
 await page.locator('.cs-reader-panel').screenshot({path:`artifacts/worker-reader/reader-panel-crop-${theme}.png`});
 await page.keyboard.press('Escape');await page.locator('.cs-reader-search-input').fill('');await expect(page.locator('.cs-reader-outline-row')).toHaveCount(questions.length);
 const row=page.locator('.cs-reader-outline-row').nth(3);await row.hover();await row.locator('.cs-reader-outline-tag').click();
 await page.keyboard.type('caching');await page.keyboard.press('Enter');await expect(row.locator('.cs-reader-outline-tag')).toHaveAttribute('data-filled','');
 const anchored=async()=>page.evaluate(()=>{const a=document.querySelector('.cs-reader-outline-tag[aria-expanded="true"]').getBoundingClientRect(),p=document.querySelector('.cs-reader-tags-pop').getBoundingClientRect();return Math.abs(p.top-(a.bottom+6))<1||Math.abs(p.bottom-(a.top-6))<1;});
 expect(await anchored()).toBe(true);
 await page.locator('.cs-reader-outline').evaluate(n=>n.scrollTop=40);await expect.poll(anchored).toBe(true);
 await page.mouse.move(10,10);await page.waitForTimeout(250);
 await page.locator('.cs-reader-panel').screenshot({path:`artifacts/worker-reader/reader-answer-tags-${theme}.png`});
 await page.locator('.cs-reader-outline').evaluate(n=>n.scrollTop=n.scrollHeight);await expect(page.locator('.cs-reader-tags-pop')).toHaveCount(0);
});
