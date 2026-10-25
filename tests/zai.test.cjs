const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const uuid=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
// Live z.ai markup: each row is a wrapper div holding a button[data-selected] with the title in .truncate and a nested menu button.
// The HTML parser cannot nest buttons, so the native menu button is added through the DOM as the Svelte app does.
const row=title=>`<div class="w-full relative group"><button draggable="false" data-selected="false"><div class="flex"><div dir="auto" class="truncate">${title}</div></div><span class="contents"></span></button></div>`;
const nest=d=>d.querySelectorAll('button[data-selected] > span.contents').forEach(span=>{const menu=d.createElement('button');menu.className='chatItemMenu';menu.textContent='⋯';span.append(menu);});
const sidebar=titles=>`<div id="sidebar"><div class="panel"><div class="label">最近</div><button id="chat-group-tab-zai-web" hidden><span>最近</span></button><div class="wrap"><div class="AgentChatList">${titles.map(row).join('')}</div></div></div></div>`;
function setup(markup='<body></body>',{token='tok'}={}){
 const dom=new JSDOM(markup,{url:'https://chat.z.ai/',runScripts:'outside-only'});const w=dom.window;w.AbortSignal=AbortSignal;
 if(token)w.localStorage.setItem('token',token);nest(w.document);
 const calls=[];const routes={};
 w.fetch=async(url,options={})=>{calls.push({url,options});const key=(options.method||'GET')+' '+url.split('?')[0];const handler=routes[key];
  if(!(key in routes))return {ok:false,status:404,headers:{get:()=>null},json:async()=>({detail:'missing'})};
  const body=typeof handler==='function'?handler(url,options):handler;
  if(body&&body.__status)return {ok:false,status:body.__status,headers:{get:name=>name==='Retry-After'?body.retryAfter??null:null},json:async()=>({})};
  return {ok:true,status:200,headers:{get:()=>null},json:async()=>body};};
 for(const f of ['core','zai'])w.eval(fs.readFileSync('src/'+f+'.js','utf8'));return {w,d:w.document,calls,routes};
}
test('Z.ai resolves as its own site with no archive, manager or move',()=>{
 const {w}=setup();try{
 const site=w.ChatTidyCore.siteForUrl('https://chat.z.ai/c/'+uuid('1'));assert.equal(site.id,'zai');assert.equal(site.name,'Z.ai');
 for(const feature of ['archive','manager','move'])assert.equal(w.ChatTidyCore.supports(site,feature),false,feature);
 assert.equal(w.ChatTidyCore.chatId('/c/'+uuid('1'),'https://chat.z.ai'),uuid('1'));
 assert.equal(w.ChatTidyCore.siteForUrl('https://z.ai/'),null);
 }finally{w.close();}
});
test('Z.ai delete validates a UUID before building the path and never calls the delete-all collection route',async()=>{
 const {w,calls,routes}=setup();try{
 routes['DELETE /api/v1/chats/']=()=>{throw Error('the collection route must never be called');};
 for(const bad of ['','  ',undefined,null,42,'../','all','?x=1','/'+uuid('1'),uuid('1')+'/',uuid('1')+'?','x'+uuid('1'),uuid('1').slice(0,35),{toString:()=>uuid('1')}])
  await assert.rejects(w.ChatTidyZai.remove(bad),/invalid-request/,String(bad));
 assert.equal(calls.length,0,'no request is sent for an invalid ID');
 routes['DELETE /api/v1/chats/'+uuid('a')]=true;
 await w.ChatTidyZai.remove(uuid('a').toUpperCase());
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/v1/chats/'+uuid('a'));
 const options=calls[0].options;assert.equal(options.method,'DELETE');assert.equal(options.credentials,'same-origin');assert.equal(options.mode,'same-origin');assert.equal(options.redirect,'error');assert.ok(options.signal);
 assert.equal(options.headers.Authorization,'Bearer tok');
 assert.ok(calls.every(call=>call.url!=='/api/v1/chats/'));
 }finally{w.close();}
});
test('Z.ai omits the bearer header when the page has no token and refuses other origins',async()=>{
 const {w,calls,routes}=setup('<body></body>',{token:''});try{
 routes['DELETE /api/v1/chats/'+uuid('1')]=true;await w.ChatTidyZai.remove(uuid('1'));assert.equal(calls[0].options.headers.Authorization,undefined);
 }finally{w.close();}
 const other=new JSDOM('',{url:'https://z.ai/',runScripts:'outside-only'});try{
  const ow=other.window;ow.AbortSignal=AbortSignal;let sent=0;ow.fetch=async()=>{sent++;return {ok:true,json:async()=>true};};
  for(const f of ['core','zai'])ow.eval(fs.readFileSync('src/'+f+'.js','utf8'));
  await assert.rejects(ow.ChatTidyZai.remove(uuid('1')),/invalid-request/);assert.equal(sent,0);
 }finally{other.window.close();}
});
test('Z.ai delete accepts only a literal true acknowledgement',async()=>{
 const {w,routes}=setup();try{
 for(const body of [false,{success:false},{detail:'Not found'},{error:'x'},null,'true',1,[]]){
  routes['DELETE /api/v1/chats/'+uuid('2')]=body;await assert.rejects(w.ChatTidyZai.remove(uuid('2')),/unexpected-response/,JSON.stringify(body));
 }
 w.fetch=async()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>{throw SyntaxError('bad json');}});
 await assert.rejects(w.ChatTidyZai.remove(uuid('2')),/unexpected-response/);
 }finally{w.close();}
});
test('Z.ai maps HTTP errors, rate limits with Retry-After and network failures',async()=>{
 const {w,routes}=setup();try{
 const path='DELETE /api/v1/chats/'+uuid('3');
 routes[path]={__status:401};await assert.rejects(w.ChatTidyZai.remove(uuid('3')),/login/);
 routes[path]={__status:403};await assert.rejects(w.ChatTidyZai.remove(uuid('3')),/forbidden/);
 routes[path]={__status:500};await assert.rejects(w.ChatTidyZai.remove(uuid('3')),/http-500/);
 routes[path]={__status:429,retryAfter:'12'};
 let error=await w.ChatTidyZai.remove(uuid('3')).catch(e=>e);assert.equal(error.message,'rate-limit');assert.equal(error.retryAfter,12000);assert.ok(error.retryAt>=Date.now()+59000);
 routes[path]={__status:429,retryAfter:'120'};error=await w.ChatTidyZai.remove(uuid('3')).catch(e=>e);assert.equal(error.retryAfter,120000);assert.ok(error.retryAt>=Date.now()+119000);
 routes[path]={__status:429,retryAfter:new Date(Date.now()+20000).toUTCString()};error=await w.ChatTidyZai.remove(uuid('3')).catch(e=>e);assert.ok(error.retryAfter>15000&&error.retryAfter<=20000);
 routes[path]={__status:429};error=await w.ChatTidyZai.remove(uuid('3')).catch(e=>e);assert.equal(error.retryAfter,undefined);assert.ok(error.retryAt>=Date.now()+59000);
 w.fetch=async()=>{throw TypeError('Failed to fetch');};await assert.rejects(w.ChatTidyZai.remove(uuid('3')),/network/);
 }finally{w.close();}
});
test('Z.ai exposes no raw request helper, so only the single-chat delete can write',()=>{
 const {w}=setup();try{assert.equal(w.ChatTidyZai.request,undefined);assert.deepEqual(Object.keys(w.ChatTidyZai).sort(),['chats','create','remove','session']);}finally{w.close();}
});
test('Z.ai session returns the signed-in user ID from the auths endpoint',async()=>{
 const {w,routes,calls}=setup();try{
 routes['GET /api/v1/auths/']={id:'user-a',email:'a@example.test'};assert.equal(await w.ChatTidyZai.session(),'user-a');assert.equal(calls[0].options.method,'GET');
 routes['GET /api/v1/auths/']={detail:'x'};await assert.rejects(w.ChatTidyZai.session(),/login/);
 }finally{w.close();}
});
test('Z.ai sidebar rows map by title and order from the website list and fail closed on a mismatch',async()=>{
 const {w,d,routes,calls}=setup(sidebar(['Alpha','Beta','Beta']));try{
 routes['GET /api/v1/chats/']=url=>url.includes('page=1')?[{id:uuid('1'),title:'Alpha'},{id:uuid('2'),title:'Beta'},{id:uuid('3'),title:'Beta'},{id:'bad',title:'Ignored'}]:[];
 let changes=0;const rows=w.ChatTidyZai.create({changed:()=>changes++});
 assert.equal(rows.scan().length,0);await new Promise(r=>setTimeout(r,20));assert.ok(changes>=1);
 const query=new URL(calls[0].url,'https://chat.z.ai');assert.equal(query.pathname,'/api/v1/chats/');assert.equal(query.searchParams.get('channel'),'zai-web');assert.equal(query.searchParams.get('type'),'all');assert.equal(query.searchParams.get('project_id'),'none');
 // Two chats share the title Beta: neither row may get an ID, because only the title links a row to a chat.
 const mapped=rows.scan();assert.deepEqual(Array.from(mapped.map(item=>item.id)),[uuid('1')]);
 const buttons=[...d.querySelectorAll('button[data-selected]')];assert.equal(mapped[0].link,buttons[0]);assert.equal(rows.idOf(buttons[1]),null);assert.equal(rows.idOf(buttons[2]),null);
 // Once one Beta is deleted and hidden, the remaining one is unambiguous and maps to its own ID.
 rows.forget([uuid('2')]);buttons[1].parentElement.classList.add('cs-deleted-row');
 assert.deepEqual(Array.from(rows.scan().map(item=>item.id)),[uuid('1'),uuid('3')]);
 // A chat removed natively elsewhere leaves the list stale: nothing may be mapped by shifted position.
 buttons[0].parentElement.remove();
 const before=calls.length;assert.equal(rows.scan().length,0,'count mismatch maps nothing');await new Promise(r=>setTimeout(r,20));assert.ok(calls.length>before,'the list is refetched');
 }finally{w.close();}
});
test('Z.ai same-title chats that swap places never hand one row the other chat\'s ID',async()=>{
 const {w,d,routes}=setup(sidebar(['T','T','X']));try{
 const rowsEls=[...d.querySelectorAll('button[data-selected]')],[A,B,C]=rowsEls;
 let list=[{id:uuid('1'),title:'T'},{id:uuid('2'),title:'T'},{id:uuid('3'),title:'X'}];routes['GET /api/v1/chats/']=url=>url.includes('page=1')?list.slice():[];
 const rows=w.ChatTidyZai.create();rows.scan();await new Promise(r=>setTimeout(r,20));rows.scan();
 assert.equal(rows.idOf(A),null);assert.equal(rows.idOf(B),null);assert.equal(rows.idOf(C),uuid('3'));
 // Chat B is continued: the website moves it to the top, in the sidebar and in its list.
 d.querySelector('.AgentChatList').prepend(B.parentElement);list=[list[1],list[0],list[2]];
 rows.scan();assert.equal(rows.idOf(B),null);assert.equal(rows.idOf(A),null);
 const fresh=await rows.reload();assert.deepEqual(Array.from(fresh.map(item=>item.id)),[uuid('3')]);assert.equal(rows.idOf(B),null);
 }finally{w.close();}
});
test('Z.ai mapping skips a title mismatch and loads further pages only while rows outnumber known chats',async()=>{
 const {w,d,routes,calls}=setup(sidebar(['One','Two','Three']));try{
 routes['GET /api/v1/chats/']=url=>url.includes('page=1')?[{id:uuid('1'),title:'One'},{id:uuid('2'),title:'Two'}]:url.includes('page=2')?[{id:uuid('3'),title:'Three'}]:[];
 const rows=w.ChatTidyZai.create();rows.scan();await new Promise(r=>setTimeout(r,20));
 assert.equal(rows.scan().length,0,'two known chats for three rows: wait for the next page');await new Promise(r=>setTimeout(r,20));
 assert.equal(rows.scan().length,3);
 assert.deepEqual(calls.map(c=>new URL(c.url,'https://chat.z.ai').searchParams.get('page')),['1','2']);
 d.querySelectorAll('.truncate')[1].textContent='Renamed';assert.equal(rows.scan().length,0,'a renamed row maps nothing until the list is refetched');
 await new Promise(r=>setTimeout(r,20));rows.scan();await new Promise(r=>setTimeout(r,20));
 // The refetched list still says "Two": the renamed row stays unmapped, its unique neighbours keep their own IDs.
 const fresh=rows.scan();assert.deepEqual(Array.from(fresh.map(item=>item.id)),[uuid('1'),uuid('3')]);assert.equal(rows.idOf(d.querySelectorAll('button[data-selected]')[1]),null);
 }finally{w.close();}
});
test('Z.ai reload refetches the list before a run so approved IDs reflect the server now',async()=>{
 const {w,routes,calls}=setup(sidebar(['Alpha','Beta']));try{
 let list=[{id:uuid('1'),title:'Alpha'},{id:uuid('2'),title:'Beta'}];routes['GET /api/v1/chats/']=url=>url.includes('page=1')?list:[];
 const rows=w.ChatTidyZai.create();rows.scan();await new Promise(r=>setTimeout(r,20));assert.equal(rows.scan().length,2);
 list=[{id:uuid('1'),title:'Alpha'},{id:uuid('9'),title:'Beta'}];
 const before=calls.length;const fresh=await rows.reload();assert.ok(calls.length>before);
 assert.deepEqual(Array.from(fresh.map(item=>item.id)),[uuid('1'),uuid('9')]);
 }finally{w.close();}
});

// Measured live: one row whose title the list does not confirm (a placeholder title, a rename in progress) used to
// leave every row without an ID, so neither checkboxes nor the toolbar appeared.
const flush=()=>new Promise(r=>setTimeout(r,20));
const settle=async rows=>{for(let i=0;i<4;i++){rows.scan();await flush();}return rows.scan();};
test('Z.ai maps confirmed rows around a placeholder row and leaves the placeholder without an ID',async()=>{
 const {w,d,routes}=setup(sidebar(['New chat','Fixture alpha','Fixture beta']));try{
 routes['GET /api/v1/chats/']=url=>url.includes('page=1')?[{id:uuid('1'),title:''},{id:uuid('2'),title:'Fixture alpha'},{id:uuid('3'),title:'Fixture beta'}]:[];
 const rows=w.ChatTidyZai.create();rows.scan();await flush();
 const buttons=[...d.querySelectorAll('button[data-selected]')];
 assert.deepEqual(Array.from(rows.scan().map(item=>item.link)),buttons.slice(1));
 assert.equal(rows.idOf(buttons[0]),null);assert.equal(rows.idOf(buttons[1]),uuid('2'));assert.equal(rows.idOf(buttons[2]),uuid('3'));
 }finally{w.close();}
});
test('Z.ai never maps duplicate titles or far-away matches when the list and the sidebar disagree',async()=>{
 const {w,d,routes}=setup(sidebar(['Extra','Same','Same','Gamma','Lone']));try{
 const filler=Array.from({length:8},(_,i)=>({id:uuid(String.fromCharCode(97+i)),title:'Hidden '+i}));
 routes['GET /api/v1/chats/']=url=>url.includes('page=1')?[{id:uuid('1'),title:'Same'},{id:uuid('2'),title:'Same'},{id:uuid('3'),title:'Gamma'},...filler,{id:uuid('4'),title:'Lone'}]:[];
 const rows=w.ChatTidyZai.create();rows.scan();await flush();
 const buttons=[...d.querySelectorAll('button[data-selected]')];const mapped=rows.scan();
 // "Same" is ambiguous; "Lone" sits beyond the part of the list five rows (one unknown) can be showing.
 assert.deepEqual(Array.from(mapped.map(item=>item.id)),[uuid('3')]);assert.equal(mapped[0].link,buttons[3]);
 for(const i of [0,1,2,4])assert.equal(rows.idOf(buttons[i]),null,'row '+i);
 }finally{w.close();}
});
test('Z.ai drops a unique-title match that contradicts the sidebar order',async()=>{
 const {w,d,routes}=setup(sidebar(['Odd','Delta','Alpha','Beta']));try{
 routes['GET /api/v1/chats/']=url=>url.includes('page=1')?[{id:uuid('1'),title:'Alpha'},{id:uuid('2'),title:'Beta'},{id:uuid('3'),title:'Delta'}]:[];
 const rows=w.ChatTidyZai.create();
 assert.deepEqual(Array.from((await settle(rows)).map(item=>item.id)),[uuid('1'),uuid('2')]);assert.equal(rows.idOf(d.querySelectorAll('button[data-selected]')[1]),null);
 }finally{w.close();}
});
test('Z.ai never maps partially against a list fetched before the sidebar changed, and retries a throttled refetch',async()=>{
 const {w,d,routes,calls}=setup(sidebar(['Alpha','Beta']));try{
 let list=[{id:uuid('1'),title:'Alpha'},{id:uuid('2'),title:'Beta'}];routes['GET /api/v1/chats/']=url=>url.includes('page=1')?list:[];
 let changes=0;const rows=w.ChatTidyZai.create({changed:()=>changes++});rows.scan();await flush();assert.equal(rows.scan().length,2);
 // A chat appears at the top before the cached list knows it; Alpha and Beta are unique, yet nothing maps until a refetch.
 d.querySelector('.AgentChatList').insertAdjacentHTML('afterbegin',row('Untitled'));
 list=[{id:uuid('9'),title:''},...list];
 const before=calls.length;assert.equal(rows.scan().length,0);
 assert.deepEqual(Array.from((await settle(rows)).map(item=>item.id)),[uuid('1'),uuid('2')]);assert.ok(calls.filter(c=>c.url.includes('page=1')).length>=2,'page 1 is refetched');assert.ok(calls.length>before);
 // A second change inside the throttle window waits, then retries by itself.
 const timers=[];const realTimeout=w.setTimeout;w.setTimeout=(fn,ms)=>{timers.push({fn,ms});return 1;};
 d.querySelector('.AgentChatList').insertAdjacentHTML('afterbegin',row('Another'));
 const firstPages=()=>calls.filter(c=>c.url.includes('page=1')).length,count=firstPages();
 for(let i=0;i<3;i++){assert.equal(rows.scan().length,0);await flush();}
 assert.equal(firstPages(),count,'no refetch inside the throttle window');assert.equal(timers.length,1,'one retry is scheduled');assert.ok(timers[0].ms>0&&timers[0].ms<=10000);
 w.setTimeout=realTimeout;const seen=changes;timers[0].fn();assert.equal(changes,seen+1,'the retry asks for a new scan');
 }finally{w.close();}
});
