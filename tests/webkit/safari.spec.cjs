const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
async function fixture(context,page,{full=true}={}){
 await page.goto('https://chatgpt.com/');
 await page.evaluate(()=>{globalThis.browser={storage:{local:{get:async defaults=>({...defaults,enabled:true,language:'en'}),set:async()=>{}},onChanged:{addListener:()=>{}}},runtime:{id:'fixture',onMessage:{addListener:()=>{}}}};});
 for(const name of full?['core','batch','i18n','content']:['core','batch'])await page.addScriptTag({path:`src/${name}.js`});
 if(full)await page.addStyleTag({path:'src/content.css'});
}
async function routes(context,handler){
 await context.route('https://chatgpt.com/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path==='/')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><nav style="width:280px"><h2>Chats</h2>${ids.map(id=>`<div><a style="padding:12px" href="/c/${id}">Fixture ${id.slice(0,4)}</a></div>`).join('')}</nav>`});
 return handler(route,path);
 });
}
test('selection, native modal, same-origin deletion and progress work without a message bridge',async({page,context},info)=>{
 const calls=[];await routes(context,async(route,path)=>{calls.push({path,method:route.request().method(),body:route.request().postData()});await route.fulfill({json:path==='/api/auth/session'?{accessToken:'fixture-token'}:{success:true}});});
 await fixture(context,page);
 await expect(page.locator('.cs-checkbox')).toHaveCount(2);
 if(info.project.name==='desktop')await page.locator('nav h2').hover();
 await page.locator('.cs-toggle').click();await page.locator('[data-cs-action="all"]').click();
 await page.locator('.cs-toggle').click();await page.locator('[data-cs-action="delete"]').click();
 await expect(page.locator('dialog')).toBeVisible();expect(calls).toHaveLength(0);
 await page.locator('[data-cs-confirm]').click();await expect(page.locator('.cs-status')).toContainText('Removed 2');
 expect(calls.map(c=>c.path)).toEqual(['/api/auth/session',...ids.map(id=>'/backend-api/conversation/'+id)]);
 for(const call of calls.slice(1)){expect(call.method).toBe('PATCH');expect(JSON.parse(call.body)).toEqual({is_visible:false});}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/webkit/${info.project.name}-completion.png`});
});
test('native Web Locks exclude a second page and release for its next batch',async({page,context})=>{
 let release,started;const gate=new Promise(r=>release=r),arrived=new Promise(r=>started=r);let sessions=0;
 await routes(context,async(route,path)=>{if(path==='/api/auth/session'&&sessions++===0){started();await gate;}await route.fulfill({json:path==='/api/auth/session'?{accessToken:'fixture-token'}:{success:true}});});
 await fixture(context,page,{full:false});const second=await context.newPage();await fixture(context,second,{full:false});
 const first=page.evaluate(ids=>ChatTidyBatch.run({ids}),[ids[0]]);await arrived;
 const busy=await second.evaluate(ids=>ChatTidyBatch.run({ids}),[ids[1]]);expect(busy.error).toBe('busy');expect(sessions).toBe(1);
 release();expect((await first).completed).toEqual([ids[0]]);
 expect((await second.evaluate(ids=>ChatTidyBatch.run({ids}),[ids[1]])).completed).toEqual([ids[1]]);
});
test('popup fits a compact Safari viewport and saves translated settings',async({page,context},info)=>{
 await context.route('https://fixture.test/**',async route=>{
 const path=new URL(route.request().url()).pathname.slice(1)||'popup.html';
 if(!['popup.html',...fs.readdirSync('src').map(p=>'src/'+p),...fs.readdirSync('icons').map(p=>'icons/'+p)].includes(path))return route.abort();
 await route.fulfill({path,contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':undefined});
 });
 await page.addInitScript(()=>{globalThis.saved={};globalThis.browser={storage:{local:{get:async d=>d,set:async d=>Object.assign(saved,d)}},tabs:{query:async()=>[]}};});
 if(info.project.name==='desktop')await page.setViewportSize({width:440,height:650});
 await page.goto('https://fixture.test/popup.html');await page.locator('#language').selectOption('ja');
 await expect.poll(()=>page.evaluate(()=>saved.language)).toBe('ja');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('#concurrency')).toBeVisible();
 await page.screenshot({path:`artifacts/webkit/${info.project.name}-popup.png`});
});
