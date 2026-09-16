const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const uuid=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const row=title=>`<div class="chat-item-drag"><a aria-label="chat-item" class="chat-item-drag-link"><div class="chat-item-drag-link-content"><span class="chat-item-title-text">${title}</span></div></a></div>`;
// The website's "All chats" block: div.list-folder > collapsible (header with .folder-button) + content wrapper; the React prop id="finsh" never reaches the DOM.
const section=inner=>`<div class="list-folder"><div class="collapsible-full"><div class="collapsible-full"><div><div class="collapsible-full"><div class="folder-button"><div class="folder-name">所有对话</div><div class="folder-button-icon-container"><span aria-hidden="true">▾</span></div></div></div></div></div><div><div class="folder-content">${inner}</div></div></div></div>`;
function setup(markup='<body></body>'){
 const dom=new JSDOM(markup,{url:'https://chat.qwen.ai/',runScripts:'outside-only'});const w=dom.window;w.AbortSignal=AbortSignal;
 const calls=[];const routes={};
 w.fetch=async(url,options={})=>{calls.push({url,options});const key=(options.method||'GET')+' '+url.split('?')[0];const handler=routes[key]||routes[url.split('?')[0]];
  if(!handler)return {ok:false,status:404,headers:{get:()=>null},json:async()=>({})};
  const body=typeof handler==='function'?handler(url,options):handler;return {ok:true,status:200,headers:{get:()=>null},json:async()=>body};};
 for(const f of ['core','qwen'])w.eval(fs.readFileSync('src/'+f+'.js','utf8'));return {w,d:w.document,calls,routes};
}
test('Qwen IDs accept only /c routes on chat.qwen.ai',()=>{
 const {w}=setup();try{
 assert.equal(w.ChatTidyCore.siteForUrl('https://chat.qwen.ai/c/x').id,'qwen');
 assert.equal(w.ChatTidyCore.chatId('/c/'+uuid('1'),'https://chat.qwen.ai'),uuid('1'));
 for(const bad of ['/p/'+uuid('1'),'/c/short','https://qwen.ai/c/'+uuid('1')])assert.equal(w.ChatTidyCore.chatId(bad,'https://chat.qwen.ai'),null);
 }finally{w.close();}
});
test('Qwen requests are same-origin JSON calls that unwrap the success envelope and surface API codes',async()=>{
 const {w,calls,routes}=setup();try{
 routes['DELETE /api/v2/chats/'+uuid('1')]={success:true,data:true};
 await w.ChatTidyQwen.api.remove(uuid('1'));
 assert.equal(calls[0].options.method,'DELETE');assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.headers.source,'web');assert.equal(calls[0].options.headers.Authorization,undefined);
 routes['POST /api/v2/chats/'+uuid('2')+'/archive']={success:true,data:true};
 await w.ChatTidyQwen.api.toggleArchive(uuid('2'));assert.equal(calls[1].options.method,'POST');
 routes['GET /api/v2/chats/archived']={success:true,data:[{id:uuid('3'),title:'Saved',created_at:1},{id:'bad',title:'x'}]};
 assert.deepEqual((await w.ChatTidyQwen.api.archived()).map(item=>item.id),[uuid('3')]);
 routes['GET /api/v2/projects/']={success:true,data:[{id:'proj-1',name:'Alpha'},{id:'proj-2'}]};
 assert.deepEqual(JSON.parse(JSON.stringify(await w.ChatTidyQwen.api.projects())),[{id:'proj-1',name:'Alpha'}]);
 routes['POST /api/v2/projects/']=(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.name,'New');assert.deepEqual(body.files,[]);return {success:true,data:{id:'proj-3',name:'New'}};};
 assert.deepEqual(JSON.parse(JSON.stringify(await w.ChatTidyQwen.api.createProject('New'))),{id:'proj-3',name:'New'});
 routes['POST /api/v2/projects/add_chat']=(url,options)=>{assert.deepEqual(JSON.parse(options.body),{chat_ids:[uuid('1'),uuid('2')],project_id:'proj-3'});return {success:true,data:true};};
 await w.ChatTidyQwen.api.addToProject('proj-3',[uuid('1'),uuid('2')]);
 routes['GET /api/v1/auths/']={id:'user-a',email:'a@example.test',role:'user'};
 assert.equal(await w.ChatTidyQwen.session(),'user-a');
 routes['GET /api/v1/auths/']={code:'Unauthorized',message:'x'};await assert.rejects(w.ChatTidyQwen.session(),/api-Unauthorized/);
 routes['GET /api/v1/auths/']={id:'user-a',email:'a@example.test',role:'user'};
 routes['DELETE /api/v2/chats/'+uuid('9')]={success:false,data:{code:'Not_Found'}};
 await assert.rejects(w.ChatTidyQwen.api.remove(uuid('9')),/api-Not_Found/);
 w.fetch=async()=>({ok:false,status:401,headers:{get:()=>null},json:async()=>({})});
 await assert.rejects(w.ChatTidyQwen.api.remove(uuid('9')),/login/);
 }finally{w.close();}
});
test('Qwen sidebar rows map to IDs by section and title order across pinned and paged lists',async()=>{
 const long='L'.repeat(120);
 const markup=`<div id="sidebar"><div class="session-list">${section(row('Pinned one')+`<div class="list-folder-pt"><div class="list-folder-chats">Today</div>${row('Alpha')}${row('Beta')}<div class="list-folder-chats">Yesterday</div>${row('Beta')}${row(long.slice(0,97)+'...')}</div>`)}<div class="project-list-wrapper">${row('Alpha')}</div></div></div>`;
 const {w,routes,calls}=setup(markup);try{
 routes['GET /api/v2/chats/pinned']={success:true,data:[{id:uuid('a'),title:'Pinned one',pinned:true}]};
 routes['GET /api/v2/chats/']={success:true,data:[{id:uuid('1'),title:'Alpha',time_range:'Today'},{id:uuid('2'),title:'Beta',time_range:'Today'},{id:uuid('3'),title:'Beta',time_range:'Yesterday'},{id:uuid('4'),title:long,time_range:'Yesterday'},{id:uuid('5'),title:'In project',project_id:'p',time_range:'Yesterday'}]};
 let changes=0;const rows=w.ChatTidyQwen.create({changed:()=>changes++});
 assert.equal(rows.scan().length,0);await new Promise(r=>setTimeout(r,20));
 assert.ok(changes>=1);
 const mapped=rows.scan();
 assert.deepEqual(Array.from(mapped.map(item=>item.id)),[uuid('a'),uuid('1'),uuid('2'),uuid('3'),uuid('4')]);
 assert.equal(mapped.find(item=>item.id===uuid('3')).link.textContent.trim(),'Beta');
 assert.equal(mapped.find(item=>item.id===uuid('4')).title,long);
 rows.forget([uuid('2')]);w.document.querySelectorAll('.chat-item-drag')[2].classList.add('cs-deleted-row');
 assert.deepEqual(Array.from(rows.scan().map(item=>item.id)),[uuid('a'),uuid('1'),uuid('3'),uuid('4')]);
 assert.equal(calls.filter(c=>c.url.startsWith('/api/v2/chats/?')).length,1,'a complete page is not refetched');
 // A row the website list does not know (a chat created after the fetch) disables its whole section and refreshes the list.
 w.document.querySelector('.list-folder-pt').insertAdjacentHTML('afterbegin',row('Mystery'));
 const before=calls.length;const partial=rows.scan();
 assert.deepEqual(Array.from(partial.map(item=>item.id)),[uuid('a')],'only the pinned section keeps its IDs');
 await new Promise(r=>setTimeout(r,20));assert.ok(calls.length>before,'the list is refetched');
 }finally{w.close();}
});
test('Qwen mapping loads further pages only while rows outnumber known chats',async()=>{
 const titles=Array.from({length:60},(_,i)=>'Chat '+i);
 const markup=`<div id="sidebar"><div class="session-list">${section(`<div class="list-folder-pt">${titles.map(row).join('')}${row('Chat 60')}</div>`)}</div></div>`;
 const {w,routes,calls}=setup(markup);try{
 routes['GET /api/v2/chats/pinned']={success:true,data:[]};
 routes['GET /api/v2/chats/']=url=>({success:true,data:url.includes('page=1')?titles.map((title,i)=>({id:uuid(String(i%10)).replace(/^./,'f'),title})):[{id:uuid('e'),title:'Chat 60'}]});
 const rows=w.ChatTidyQwen.create({changed:()=>{}});
 rows.scan();await new Promise(r=>setTimeout(r,20));
 rows.scan();await new Promise(r=>setTimeout(r,20));
 const mapped=rows.scan();
 assert.equal(mapped.length,61);assert.equal(mapped.at(-1).id,uuid('e'));
 assert.deepEqual(calls.filter(c=>c.url.startsWith('/api/v2/chats/?')).map(c=>new URL(c.url,'https://chat.qwen.ai').searchParams.get('page')),['1','2']);
 }finally{w.close();}
});
test('Qwen mapping skips rows hidden after deletion so a same-titled neighbour keeps its own ID',async()=>{
 const markup=`<div id="sidebar"><div class="session-list">${section(`<div class="list-folder-pt">${row('Beta')}${row('Beta')}</div>`)}</div></div>`;
 const {w,routes}=setup(markup);try{
 routes['GET /api/v2/chats/pinned']={success:true,data:[]};
 routes['GET /api/v2/chats/']={success:true,data:[{id:uuid('1'),title:'Beta'},{id:uuid('2'),title:'Beta'}]};
 const rows=w.ChatTidyQwen.create({changed:()=>{}});rows.scan();await new Promise(r=>setTimeout(r,20));
 assert.deepEqual(Array.from(rows.scan().map(item=>item.id)),[uuid('1'),uuid('2')]);
 rows.forget([uuid('1')]);w.document.querySelectorAll('.chat-item-drag')[0].classList.add('cs-deleted-row');
 const mapped=rows.scan();assert.equal(mapped.length,1);assert.equal(mapped[0].id,uuid('2'));assert.equal(mapped[0].link,w.document.querySelectorAll('a.chat-item-drag-link')[1]);
 }finally{w.close();}
});
test('Qwen mapping retries a failed page instead of skipping it',async()=>{
 const titles=Array.from({length:60},(_,i)=>'Chat '+i);
 const markup=`<div id="sidebar"><div class="session-list">${section(`<div class="list-folder-pt">${titles.map(row).join('')}${row('Chat 7')}</div>`)}</div></div>`;
 const {w,routes,calls}=setup(markup);try{
 let fail=true;routes['GET /api/v2/chats/pinned']={success:true,data:[]};
 routes['GET /api/v2/chats/']=url=>{if(url.includes('page=1')){if(fail){fail=false;throw Error('boom');}return {success:true,data:titles.map((title,i)=>({id:uuid(String(i%10)).replace(/^./,'f'),title}))};}return {success:true,data:[{id:uuid('e'),title:'Chat 7'}]};};
 const rows=w.ChatTidyQwen.create({changed:()=>{}});
 rows.scan();await new Promise(r=>setTimeout(r,20));
 assert.equal(rows.scan().length,0,'nothing is mapped while page 1 is unknown');
 // The failure backs off for 15 seconds; simulate the clock moving on by re-creating after the backoff would elapse.
 const later=w.ChatTidyQwen.create({changed:()=>{}});later.scan();await new Promise(r=>setTimeout(r,20));later.scan();await new Promise(r=>setTimeout(r,20));
 const mapped=later.scan();assert.equal(mapped.length,61);
 assert.equal(mapped[7].id,'f'+uuid('7').slice(1));assert.equal(mapped[60].id,uuid('e'),'the duplicate title at the end keeps its own ID');
 assert.deepEqual(calls.filter(c=>c.url.startsWith('/api/v2/chats/?')).map(c=>new URL(c.url,'https://chat.qwen.ai').searchParams.get('page')),['1','1','2']);
 }finally{w.close();}
});
