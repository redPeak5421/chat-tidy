const {test,expect}=require('@playwright/test');
// The popup at Chrome's 440px width with a seeded library: the chat enhancements page, the library page and settings in both themes.
const day=86400000;
function seed(now){
 const rows=[
  ['chat','chatgpt','https://chatgpt.com/c/','Kyoto trip plan: ryokan, rail passes and a rainy-day backup',['travel','japan'],'Book the ryokan before the rail pass',2*day],
  ['answer','claude','https://claude.ai/chat/','Rust lifetimes',['code','rust'],'',60000,'Why does the borrow checker reject a reference that clearly outlives the loop body?'],
  ['chat','gemini','https://gemini.google.com/app/','',['travel'],'',30*day],
  ['answer','chatgpt','https://chatgpt.com/c/','每周食谱',['food'],'少油少盐的版本',3*3600000,'能不能帮我把这份食谱改成适合一个人做、并且十五分钟内完成的版本？'],
  ['chat','kimi','https://www.kimi.com/chat/','Reading list for the winter',['books'],'',5*day],
  ['answer','qwen','https://chat.qwen.ai/c/','Garden soil pH',['garden','travel'],'Try the vinegar test',400*day,'How do I tell whether my soil is too acidic for blueberries?'],
  ['chat','zai','https://chat.z.ai/c/','Photography: night sky exposure settings without a tripod',['photo'],'',8*day],
  ['answer','grok','https://grok.com/c/','Weekend ideas',[],'',20*60000,'What can we do this weekend that is free and indoors?']
 ];
 return Object.fromEntries(rows.map(([type,site,base,title,tags,note,age,question],i)=>{const chatId='c'+i,key=type==='answer'?`${site}:${chatId}#id:m${i}`:`${site}:${chatId}`;
  return [key,{key,type,site,chatId,url:base+chatId,title,tags,note,savedAt:now-age-day,updatedAt:now-age,...type==='answer'?{turn:{id:'m'+i,index:i,hash:'h'+i},question,excerpt:'…'}:{}}];}));
}
async function open(page,context,{dark=false,library=true,language='en'}={}){
 await context.route('https://fixture.test/**',route=>{const p=new URL(route.request().url()).pathname.slice(1)||'popup.html';if(!/^(popup\.html|src\/[\w.-]+|icons\/[\w.-]+)$/.test(p))return route.abort();return route.fulfill({path:p,contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':undefined});});
 await page.addInitScript(([items,language])=>{globalThis.saved={language,...items?{library:items}:{}};const listeners=new Set();globalThis.created=[];
  globalThis.chrome={storage:{local:{get:async d=>({...d,...saved}),set:async d=>{const c={};for(const [k,v] of Object.entries(d)){saved[k]=v;c[k]={newValue:v};}listeners.forEach(fn=>fn(c,'local'));},remove:async k=>{delete saved[k];}},onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}},
   tabs:{query:async()=>[{id:1}],sendMessage:async()=>({site:'chatgpt'}),create:async o=>{created.push(o);return {id:2};}}};},[library?seed(Date.now()):null,language]);
 await page.emulateMedia({colorScheme:dark?'dark':'light',reducedMotion:'reduce'});
 await page.setViewportSize({width:440,height:600});await page.goto('https://fixture.test/popup.html');
 await expect(page.locator('#open-enhance')).toBeVisible();
}
const toLibrary=async page=>{await page.locator('#open-enhance').click();await page.locator('#open-library').click();};
const bottom=page=>page.locator('.popup-shell').evaluate(n=>n.scrollTop=n.scrollHeight);
const fits=page=>page.evaluate(()=>{const shell=document.querySelector('.popup-shell'),page=[...document.querySelectorAll('main>[id$="-page"]')].find(n=>!n.hidden);
 const overflow=[...page.querySelectorAll('*')].filter(n=>n.getClientRects().length&&n.getBoundingClientRect().right>innerWidth+0.5).map(n=>n.className||n.tagName);
 return {page:document.documentElement.scrollWidth<=innerWidth,shell:shell.scrollWidth<=shell.clientWidth,overflow};});
for(const dark of [false,true]){
 const theme=dark?'dark':'light';
 test(`popup home, chat enhancements, settings and library pages fit 440px (${theme})`,async({page,context},info)=>{
  await open(page,context,{dark});
  expect(await fits(page)).toEqual({page:true,shell:true,overflow:[]});
  await page.screenshot({path:info.outputPath(`home-${theme}.png`)});
  await page.locator('.popup-shell').evaluate(n=>n.scrollTop=n.scrollHeight);await page.screenshot({path:info.outputPath(`home-scrolled-${theme}.png`)});
  await page.locator('#open-settings').click();
  expect(await fits(page)).toEqual({page:true,shell:true,overflow:[]});
  await bottom(page);await page.screenshot({path:info.outputPath(`settings-${theme}.png`)});
  await page.locator('#back-settings').click();await page.locator('#open-enhance').click();await expect(page.locator('#back-enhance')).toBeFocused();
  expect(await fits(page)).toEqual({page:true,shell:true,overflow:[]});
  await page.locator('#back-enhance').blur();await page.screenshot({path:info.outputPath(`enhance-${theme}.png`)});
  await page.locator('#open-library').scrollIntoViewIfNeeded();await page.locator('#code-feature').evaluate(n=>n.scrollIntoView({block:'start'}));await page.screenshot({path:info.outputPath(`enhance-code-${theme}.png`)});
  await page.locator('#codeTools').uncheck();await expect(page.locator('#codeFold')).toBeDisabled();await page.screenshot({path:info.outputPath(`enhance-code-off-${theme}.png`)});
  await page.locator('#codeTools').check();await expect(page.locator('#codeFold')).toBeEnabled();
  await bottom(page);await page.screenshot({path:info.outputPath(`enhance-layout-${theme}.png`)});
  // Illustrations stay crisp: each drawing keeps its 128x84 box beside its text.
  expect(await page.locator('.ill').evaluateAll(list=>list.map(n=>{const r=n.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];}))).toEqual([[128,84],[128,84],[128,84]]);
  await page.locator('#open-library').click();
  await expect(page.locator('#library-search')).toBeFocused();await expect(page.locator('.library-item')).toHaveCount(8);
  expect(await fits(page)).toEqual({page:true,shell:true,overflow:[]});
  await page.locator('#library-search').blur();await page.screenshot({path:info.outputPath(`library-${theme}.png`)});
  // Long lists scroll inside the shell while the search and type filter stay pinned at its top.
  const scrolled=await page.locator('.popup-shell').evaluate(n=>{const scrollable=n.scrollHeight>n.clientHeight;n.scrollTop=n.scrollHeight;return {scrollable,top:Math.round(document.getElementById('library-tools').getBoundingClientRect().top-n.getBoundingClientRect().top),last:Math.round(document.querySelector('.library-item:last-child').getBoundingClientRect().bottom)};});
  expect(scrolled.scrollable).toBe(true);expect(scrolled.top).toBe(0);expect(scrolled.last).toBeLessThanOrEqual(600);
  await page.screenshot({path:info.outputPath(`library-scrolled-${theme}.png`)});
  await page.locator('.tag-chip',{hasText:'travel'}).click();await expect(page.locator('.library-item')).toHaveCount(3);
  await page.locator('#library-search').fill('ryokan');await expect(page.locator('.library-item')).toHaveCount(1);await page.locator('.library-item .item-remove').focus();
  await page.screenshot({path:info.outputPath(`library-filtered-${theme}.png`)});
  await page.locator('#library-search').fill('zzz');await expect(page.locator('#library-empty')).toBeVisible();await page.screenshot({path:info.outputPath(`library-no-match-${theme}.png`)});
  await page.locator('#back-library').click();await expect(page.locator('#enhance-page')).toBeVisible();await expect(page.locator('#open-library')).toBeFocused();
 });
}
test('library rows open tabs and remove bookmarks with the keyboard',async({page,context},info)=>{
 await open(page,context);await toLibrary(page);
 await page.locator('.library-item').first().locator('.item-open').focus();await page.keyboard.press('Enter');
 await expect.poll(()=>page.evaluate(()=>created.length)).toBe(1);expect(await page.evaluate(()=>[created[0].url,saved.readerJump?.key])).toEqual(['https://claude.ai/chat/c1','claude:c1#id:m1']);
 await page.keyboard.press('Tab');await expect(page.locator('.library-item').first().locator('.item-remove')).toBeFocused();
 const outline=await page.locator('.library-item').first().locator('.item-remove').evaluate(n=>getComputedStyle(n).outlineStyle);expect(outline).toBe('solid');
 await page.keyboard.press('Enter');await expect(page.locator('.library-item')).toHaveCount(7);await expect(page.locator('.library-item').first().locator('.item-remove')).toBeFocused();
 expect(await page.evaluate(()=>Object.keys(saved.library).length)).toBe(7);
});
test('empty library explains how to save (light and dark)',async({page,context},info)=>{
 await open(page,context,{library:false});await toLibrary(page);await expect(page.locator('#library-empty')).toBeVisible();await expect(page.locator('#library-tools')).toBeHidden();
 await page.screenshot({path:info.outputPath('library-empty-light.png')});await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:info.outputPath('library-empty-dark.png')});
});
test('chat enhancements read in plain Chinese and fit the popup (light and dark)',async({page,context},info)=>{
 await open(page,context,{language:'zh-CN'});
 await page.screenshot({path:info.outputPath('home-zh-light.png')});
 await page.locator('#open-enhance').click();await expect(page.locator('#enhance-title')).toHaveText('对话增强');
 expect(await fits(page)).toEqual({page:true,shell:true,overflow:[]});
 await page.locator('#back-enhance').blur();await page.screenshot({path:info.outputPath('enhance-zh-light.png')});
 await page.locator('.popup-shell').evaluate(n=>n.scrollTop=n.scrollHeight);await page.screenshot({path:info.outputPath('enhance-zh-bottom-light.png')});
 await page.emulateMedia({colorScheme:'dark'});await page.locator('.popup-shell').evaluate(n=>n.scrollTop=0);await page.screenshot({path:info.outputPath('enhance-zh-dark.png')});
 await page.locator('#open-library').click();await page.locator('#back-library').click();await expect(page.locator('#enhance-page')).toBeVisible();
});
