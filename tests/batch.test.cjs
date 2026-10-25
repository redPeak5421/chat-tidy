const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const many=n=>Array.from({length:n},(_,i)=>String(i).padStart(8,'0')+'-1111-4111-8111-111111111111');
// Lets pending fetches, microtasks and zero-delay timers settle.
const tick=async()=>{for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,5));await new Promise(r=>setImmediate(r));}};
// Records every delay batch.js asks for while still running timers immediately.
function timers(s){const delays=[];s.context.setTimeout=(fn,ms)=>{delays.push(ms);return setTimeout(fn,0);};return delays;}
function setup(responses,settings={}){
 const calls=[],progress=[];let origin='https://chatgpt.com';let busy=false;
 const context={chrome:{storage:{local:{get:async defaults=>({...defaults,...settings}),set:async values=>Object.assign(settings,values)}}},
 location:{get href(){return origin+'/';}},navigator:{locks:{request:async(name,options,callback)=>{if(busy)return callback(null);busy=true;try{return await callback({name});}finally{busy=false;}}}},
 AbortSignal,URL,setTimeout:fn=>setTimeout(fn,0),fetch:async(path,options)=>{
 const url=origin+path;calls.push({url,options,source:'content'});const next=responses.shift();if(next instanceof Error)throw next;if(next.wait)await next.wait;
 return {headers:{get:()=>next.retryAfter||null},ok:next.status===undefined||next.status>=200&&next.status<300,status:next.status||200,json:async()=>next.body};}};
 const sandbox=vm.createContext(context);
 for(const file of ['core','batch'])vm.runInContext(fs.readFileSync('src/'+file+'.js','utf8'),sandbox);
 const sender={url:origin+'/'};
 const send=(message,source=sender)=>{origin=new URL(source.url).origin;if(message.type==='cs-cancel'){context.ChatTidyBatch.cancel();return Promise.resolve({ok:true});}
 return context.ChatTidyBatch.run({action:message.type==='cs-archive'?'archive':'delete',ids:message.ids,organizationId:message.organizationId,onProgress:ids=>progress.push(ids)});};
 return {send,calls,progress,sender,settings,context};
}
test('background authenticates once and PATCHes precisely the approved IDs',async()=>{
 const s=setup([{body:{accessToken:'test-token'}},{body:{success:true}},{body:{success:true}}]);
 const result=await s.send({type:'cs-delete',jobId:'batch',ids});assert.equal(result.completed.length,2);assert.equal(s.progress.length,2);
 assert.equal(s.calls[0].url,'https://chatgpt.com/api/auth/session');
 for(let i=0;i<2;i++){const call=s.calls[i+1];assert.equal(call.url,'https://chatgpt.com/backend-api/conversation/'+ids[i]);assert.equal(call.options.method,'PATCH');assert.deepEqual(JSON.parse(call.options.body),{is_visible:false});assert.equal(call.options.headers.Authorization,'Bearer test-token');}
 assert.ok(!JSON.stringify(s.progress).includes('test-token'));
});
test('rejects unsupported origins and malformed or duplicate IDs without network requests',async()=>{
 const s=setup([]);const unsupported=await s.send({type:'cs-delete',ids},{url:'https://evil.test/'});
 assert.equal(unsupported.error,'unsupported-site');
 for(const bad of [['../../delete-all'],[ids[0],ids[0]],[]]){
 const result=await s.send({type:'cs-delete',ids:bad});assert.equal(result.error,'invalid-request');}
 assert.equal(s.calls.length,0);
});
test('stops at a failed request and reports only acknowledged completions',async()=>{
 const s=setup([{body:{accessToken:'token'}},{body:{success:true}},{status:429,retryAfter:'120'}],{concurrency:1});const result=await s.send({type:'cs-delete',jobId:'b',ids});assert.equal(result.error,'rate-limit');assert.deepEqual(Array.from(result.completed),[ids[0]]);
});
test('expired login and unexpected success body never claim deletion',async()=>{
 for(const responses of [[{body:{}}],[{body:{accessToken:'token'}},{body:{}}]]){const s=setup(responses);const result=await s.send({type:'cs-delete',jobId:'b',ids});assert.equal(result.completed.length,0);assert.ok(result.error);}
});
test('cancel prevents subsequent requests while preserving the in-flight result',async()=>{
 const s=setup([{body:{accessToken:'token'}},{body:{success:true}}]);const pending=s.send({type:'cs-delete',jobId:'b',ids});await s.send({type:'cs-cancel',jobId:'b'});const result=await pending;assert.equal(result.cancelled,true);assert.equal(s.calls.length,0);
});

test('launches only the configured number of requests in flight',async()=>{
 let release;const gate=new Promise(r=>release=r);const list=many(4);
 const s=setup([{body:{accessToken:'t'}},{body:{success:true},wait:gate},{body:{success:true},wait:gate},{body:{success:true},wait:gate},{body:{success:true}}],{concurrency:3});
 const pending=s.send({type:'cs-delete',jobId:'b',ids:list});await new Promise(r=>setImmediate(r));
 assert.equal(s.calls.length,4);release();const result=await pending;assert.equal(result.completed.length,4);assert.equal(s.calls.length,5);
});
test('long 429 collects in-flight success, starts nothing new, shares cooldown and reduces concurrency',async()=>{
 const list=many(4);const s=setup([{body:{accessToken:'t'}},{status:429,retryAfter:'120'},{body:{success:true}},{body:{success:true}}],{concurrency:3});
 const before=Date.now();const result=await s.send({type:'cs-delete',jobId:'b',ids:list});
 assert.equal(result.error,'rate-limit');assert.deepEqual(Array.from(result.completed),list.slice(1,3));assert.equal(s.settings.concurrency,1);assert.ok(result.retryAt>=before+120000);assert.equal(s.calls.length,4);
 const again=await s.send({type:'cs-delete',jobId:'c',ids});assert.equal(again.error,'cooldown');assert.equal(s.calls.length,4);
});
test('stop waits for in-flight successes without starting remaining requests',async()=>{
 let release;const gate=new Promise(r=>release=r);const s=setup([{body:{accessToken:'t'}},...Array(5).fill({body:{success:true},wait:gate})]);
 const pending=s.send({type:'cs-delete',jobId:'b',ids:many(8)});await new Promise(r=>setImmediate(r));
 await s.send({type:'cs-cancel',jobId:'b'});release();const result=await pending;assert.equal(result.cancelled,true);assert.equal(result.completed.length,5);assert.equal(s.calls.length,6);
});

test('Claude deletes only selected IDs in the explicitly selected workspace',async()=>{
 const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const s=setup([{body:{deleted:ids}}]);
 const result=await s.send({type:'cs-delete',jobId:'claude',ids,organizationId:org},{...s.sender,url:'https://claude.ai/new'});
 assert.equal(result.completed.length,2);assert.equal(s.calls.length,1);
 assert.equal(s.calls[0].url,'https://claude.ai/api/organizations/'+org+'/chat_conversations/delete_many');
 assert.equal(s.calls[0].source,'content');assert.equal(s.calls[0].options.method,'POST');
 assert.deepEqual(JSON.parse(s.calls[0].options.body),{conversation_uuids:ids});
 assert.equal(s.calls[0].options.headers.Authorization,undefined);
});
test('Claude rejects missing workspaces and unacknowledged deletes',async()=>{
 const s=setup([{body:{deleted:[]}}],{concurrency:1});const sender={...s.sender,url:'https://claude.ai/'};
 const invalid=await s.send({type:'cs-delete',jobId:'c',ids},sender);
 assert.equal(invalid.error,'invalid-request');assert.equal(s.calls.length,0);
 const result=await s.send({type:'cs-delete',jobId:'c',ids,organizationId:ids[0]},sender);
 assert.equal(result.completed.length,0);assert.equal(result.error,'unexpected-response');assert.equal(s.calls.length,1);
});
test('Grok uses the native soft-delete endpoint without ChatGPT credentials',async()=>{
 const s=setup([{body:{}},{body:{}}]);
 const result=await s.send({type:'cs-delete',jobId:'grok',ids},{...s.sender,url:'https://grok.com/'});
 assert.equal(result.completed.length,2);
 for(let i=0;i<2;i++){
  assert.equal(s.calls[i].url,'https://grok.com/rest/app-chat/conversations/soft/'+ids[i]);
  assert.equal(s.calls[i].options.method,'DELETE');assert.equal(s.calls[i].options.headers?.Authorization,undefined);
 }
});
test('Grok rejects error payloads even with HTTP success',async()=>{
 const s=setup([{body:{error:'denied'}}],{concurrency:1});
 const result=await s.send({type:'cs-delete',jobId:'g',ids},{...s.sender,url:'https://grok.com/'});
 assert.equal(result.completed.length,0);assert.equal(result.error,'unexpected-response');
});

test('Claude uses native groups of 20 and preserves partial acknowledgments',async()=>{
 const many=Array.from({length:21},(_,i)=>String(i).padStart(8,'0')+'-1111-4111-8111-111111111111');
 const s=setup([{body:{deleted:many.slice(0,20)}},{body:{deleted:[many[20]]}}]);
 const result=await s.send({type:'cs-delete',jobId:'c',ids:many,organizationId:ids[0]},{...s.sender,url:'https://claude.ai/'});
 assert.equal(result.completed.length,21);assert.deepEqual(s.calls.map(c=>JSON.parse(c.options.body).conversation_uuids.length),[20,1]);
 const partial=setup([{body:{deleted:[ids[0],'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']}}]);
 const failed=await partial.send({type:'cs-delete',jobId:'p',ids,organizationId:ids[0]},{...partial.sender,url:'https://claude.ai/'});
 assert.deepEqual(Array.from(failed.completed),[ids[0]]);assert.equal(failed.error,'unexpected-response');
});
test('Claude 403 stops after one native batch and never retries through the worker',async()=>{
 const many=Array.from({length:21},(_,i)=>String(i).padStart(8,'0')+'-1111-4111-8111-111111111111');
 const s=setup([{status:403}],{concurrency:1});
 const result=await s.send({type:'cs-delete',jobId:'c',ids:many,organizationId:ids[0]},{...s.sender,url:'https://claude.ai/'});
 assert.equal(result.error,'forbidden');assert.equal(result.completed.length,0);assert.equal(s.calls.length,1);assert.equal(s.calls[0].source,'content');
});
test('Claude 429 honors Retry-After and prevents the next group',async()=>{
 const many=Array.from({length:21},(_,i)=>String(i).padStart(8,'0')+'-1111-4111-8111-111111111111');
 const s=setup([{status:429,retryAfter:'120'}],{concurrency:1});const before=Date.now();
 const result=await s.send({type:'cs-delete',jobId:'c',ids:many,organizationId:ids[0]},{...s.sender,url:'https://claude.ai/'});
 assert.equal(result.error,'rate-limit');assert.equal(s.calls.length,1);assert.ok(s.settings.claudeDeleteCooldownUntil>=before+120000);
});
test('ChatGPT archive sets only is_archived and never sends deletion payload',async()=>{
 const s=setup([{body:{accessToken:'t'}},{body:{success:true}},{body:{success:true}}]);
 const result=await s.send({type:'cs-archive',jobId:'a',ids});
 assert.equal(result.completed.length,2);
 for(const call of s.calls.slice(1))assert.deepEqual(JSON.parse(call.options.body),{is_archived:true});
});
test('unsupported native archive never makes a network or delete request',async()=>{
 for(const url of ['https://claude.ai/','https://grok.com/']){
 const s=setup([]);const result=await s.send({type:'cs-archive',jobId:'a',ids,organizationId:ids[0]},{...s.sender,url});
 assert.equal(result.error,'unsupported-action');assert.equal(s.calls.length,0);
 }
});
test('Claude mixed deletion separates native chat batches from individual Cowork tasks regardless of concurrency',async()=>{
 const task='cse_01AAAAAAAAAAAAAAAAAAAAAA';
 for(const concurrency of [1,3]){
 const s=setup([{body:{deleted:ids}},{body:{deleted:[task]}}],{concurrency});
 const result=await s.send({type:'cs-delete',jobId:'c',ids:[...ids,task],organizationId:ids[0]},{...s.sender,url:'https://claude.ai/'});
 assert.equal(result.completed.length,3);assert.deepEqual(JSON.parse(s.calls[0].options.body).conversation_uuids,ids);assert.equal(s.calls[1].url,'https://claude.ai/v1/code/sessions/'+task);
 }
});
test('Claude archive accepts Cowork IDs only and keeps their case',async()=>{
 const task='cse_01AAAAAAAAAAAAAAAAAAAAAA';const s=setup([{body:{deleted:[task]}}]);
 const result=await s.send({type:'cs-archive',jobId:'a',ids:[task],organizationId:ids[0]},{...s.sender,url:'https://claude.ai/'});
 assert.deepEqual(Array.from(result.completed),[task]);
});

test('all requests are direct same-origin fetches with no extension messaging',async()=>{
 const s=setup([{body:{accessToken:'t'}},{body:{success:true}}]);
 await s.send({type:'cs-delete',ids:[ids[0]]});
 for(const {options} of s.calls){assert.equal(options.credentials,'same-origin');assert.equal(options.mode,'same-origin');assert.equal(options.redirect,'error');}
});
test('native lock rejects overlapping batches and releases after completion',async()=>{
 let release;const wait=new Promise(r=>release=r);const s=setup([{body:{accessToken:'t'},wait},{body:{success:true}}]);
 const pending=s.send({type:'cs-delete',ids:[ids[0]]});await new Promise(r=>setImmediate(r));
 const other=await s.send({type:'cs-delete',ids:[ids[1]]});assert.equal(other.error,'busy');
 release();assert.equal((await pending).completed.length,1);
});
test('workspace validity is rechecked after login and before each wave',async()=>{
 const s=setup([{body:{deleted:[ids[0]]}}],{concurrency:1});s.context.location={href:'https://claude.ai/'};
 const result=await s.context.ChatTidyBatch.run({action:'delete',ids,organizationId:ids[0],canRun:()=>false});
 assert.equal(result.error,'workspace-changed');assert.equal(s.calls.length,0);
});

test('missing native locks fails closed without sending a request',async()=>{
 const s=setup([]);s.context.navigator.locks=undefined;
 const result=await s.send({type:'cs-delete',ids});assert.equal(result.error,'connection-lost');assert.equal(s.calls.length,0);
});
test('invalidating the context during login prevents destructive requests',async()=>{
 let release;const gate=new Promise(r=>release=r);let valid=true;
 const s=setup([{body:{accessToken:'t'},wait:gate}]);
 const pending=s.context.ChatTidyBatch.run({ids,canRun:()=>valid});await new Promise(r=>setImmediate(r));
 valid=false;release();const result=await pending;assert.equal(result.error,'workspace-changed');assert.equal(s.calls.length,1);assert.equal(result.completed.length,0);
});
test('workspace changes after a Claude group stop all later groups',async()=>{
 const many=Array.from({length:21},(_,i)=>String(i).padStart(8,'0')+'-1111-4111-8111-111111111111');
 const s=setup([{body:{deleted:many.slice(0,20)}}],{concurrency:1});s.context.location={href:'https://claude.ai/'};let valid=true;
 const result=await s.context.ChatTidyBatch.run({ids:many,organizationId:ids[0],canRun:()=>valid,onProgress:()=>{valid=false;}});
 assert.equal(result.error,'workspace-changed');assert.equal(result.completed.length,20);assert.equal(s.calls.length,1);
});
test('restore only clears archive flag and is rejected on other sites',async()=>{
 const s=setup([{body:{accessToken:'t'}},{body:{success:true}}]);const result=await s.context.ChatTidyBatch.run({ids:[ids[0]],action:'restore'});assert.equal(result.completed.length,1);assert.deepEqual(JSON.parse(s.calls[1].options.body),{is_archived:false});
 const other=setup([]);await other.send({ids:[]},{url:'https://grok.com/'});assert.equal((await other.context.ChatTidyBatch.run({ids,action:'restore'})).error,'unsupported-action');assert.equal(other.calls.length,0);
});
test('ChatGPT checks the account before the first request and again beside the pool every 10 requests per slot',async()=>{
 // The recheck runs beside the requests instead of pausing them: the one slot keeps working with the token of the checked
 // account while the check is in flight, and the mismatch stops every later launch.
 const list=many(14);const s=setup([{body:{accessToken:'t',user:{id:'a'}}},...Array(10).fill({body:{success:true}}),{body:{accessToken:'u',user:{id:'b'}}},{body:{success:true}}],{concurrency:1});
 const result=await s.context.ChatTidyBatch.run({ids:list,action:'restore',expectedUserId:'a'});assert.equal(result.error,'account-changed');
 assert.equal(s.calls[11].url,'https://chatgpt.com/api/auth/session','the check follows the tenth request');
 assert.equal(s.calls.filter(c=>c.options.method==='PATCH').length,11);assert.equal(result.completed.length,11);assert.equal(s.calls.length,13);
 for(const call of s.calls.filter(c=>c.options.method==='PATCH'))assert.equal(call.options.headers.Authorization,'Bearer t');
 const first=setup([{body:{accessToken:'t',user:{id:'b'}}}]);
 assert.equal((await first.context.ChatTidyBatch.run({ids,expectedUserId:'a'})).error,'account-changed');assert.equal(first.calls.length,1);
});

test('ChatGPT move patches gizmo_id with the chosen project and validates the target',async()=>{
 const s=setup([{body:{accessToken:'t'}},{body:{success:true}},{body:{success:true}}]);
 const result=await s.context.ChatTidyBatch.run({ids,action:'move',target:'g-p-abc123'});
 assert.equal(result.completed.length,2);
 for(const call of s.calls.slice(1)){assert.equal(call.options.method,'PATCH');assert.deepEqual(JSON.parse(call.options.body),{gizmo_id:'g-p-abc123'});}
 const bad=setup([]);assert.equal((await bad.context.ChatTidyBatch.run({ids,action:'move',target:'../g-p-x'})).error,'invalid-request');assert.equal((await bad.context.ChatTidyBatch.run({ids,action:'move'})).error,'invalid-request');assert.equal(bad.calls.length,0);
});
test('Claude move updates each conversation record with project_uuid and accepts an empty 202',async()=>{
 const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',project='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const s=setup([{status:202,body:undefined},{status:202,body:undefined}],{concurrency:1});await s.send({ids:[]},{url:'https://claude.ai/'});
 const result=await s.context.ChatTidyBatch.run({ids,action:'move',target:project,organizationId:org});
 assert.equal(result.completed.length,2);assert.equal(s.calls.length,2);
 assert.equal(s.calls[0].url,'https://claude.ai/api/organizations/'+org+'/chat_conversations/'+ids[0]);assert.equal(s.calls[0].options.method,'PUT');assert.deepEqual(JSON.parse(s.calls[0].options.body),{project_uuid:project});
 const task='cse_01AAAAAAAAAAAAAAAAAAAAAA';const mixed=setup([]);mixed.context.location={href:'https://claude.ai/'};
 assert.equal((await mixed.context.ChatTidyBatch.run({ids:[ids[0],task],action:'move',target:project,organizationId:org})).error,'unsupported-action');assert.equal(mixed.calls.length,0);
});
test('move and archive stay unavailable on Grok, Gemini and Kimi',async()=>{
 for(const url of ['https://grok.com/','https://www.kimi.com/']){
 const s=setup([]);s.context.location={href:url};
 assert.equal((await s.context.ChatTidyBatch.run({ids,action:'move',target:'x'})).error,'unsupported-action');
 assert.equal((await s.context.ChatTidyBatch.run({ids,action:'archive'})).error,'unsupported-action');assert.equal(s.calls.length,0);
 }
});
test('Qwen deletes, toggles archive per chat and moves in native groups through the site module',async()=>{
 const s=setup([]);s.context.location={href:'https://chat.qwen.ai/'};
 const log=[];s.context.ChatTidyQwen={session:async()=>'user-a',api:{remove:async id=>log.push(['remove',id]),toggleArchive:async id=>log.push(['archive',id]),addToProject:async(project,group)=>log.push(['move',project,group.slice()])}};
 const many=Array.from({length:21},(_,i)=>String(i).padStart(8,'0')+'-1111-4111-8111-111111111111');
 let result=await s.context.ChatTidyBatch.run({ids,action:'delete',expectedUserId:'user-a'});assert.equal(result.completed.length,2);
 result=await s.context.ChatTidyBatch.run({ids:[ids[0]],action:'archive'});assert.equal(result.completed.length,1);
 result=await s.context.ChatTidyBatch.run({ids:[ids[0]],action:'restore'});assert.equal(result.completed.length,1);
 result=await s.context.ChatTidyBatch.run({ids:many,action:'move',target:'proj-1'});assert.equal(result.completed.length,21);
 assert.deepEqual(log.map(entry=>entry[0]),['remove','remove','archive','archive','move','move']);
 assert.equal(log[4][2].length,20);assert.equal(log[5][2].length,1);assert.equal(log[4][1],'proj-1');
 assert.equal((await s.context.ChatTidyBatch.run({ids,action:'delete',expectedUserId:'user-b'})).error,'account-changed');
 assert.equal(s.calls.length,0,'no raw fetches bypass the site module');
});

test('pool refills a free slot at once, so one slow request never blocks the others',async()=>{
 let release;const gate=new Promise(r=>release=r);const list=many(6);const ok={body:{success:true}};
 const s=setup([{body:{accessToken:'t'}},{body:{success:true},wait:gate},ok,ok,ok,ok,ok],{concurrency:3});const delays=timers(s);
 const pending=s.send({type:'cs-delete',ids:list});await tick();
 assert.equal(s.calls.length,7,'five requests finished beside the slow one');assert.equal(s.progress.length,5);
 release();const result=await pending;assert.equal(result.completed.length,6);assert.equal(result.error,undefined);
 assert.deepEqual(delays,[],'no fixed pause between requests');
});
test('stop during a pool run starts nothing new and keeps in-flight acknowledgments',async()=>{
 let release;const gate=new Promise(r=>release=r);const list=many(6);
 const s=setup([{body:{accessToken:'t'}},{body:{success:true},wait:gate},{body:{success:true},wait:gate},{body:{success:true},wait:gate}],{concurrency:3});
 const pending=s.send({type:'cs-delete',ids:list});await tick();assert.equal(s.calls.length,4);
 await s.send({type:'cs-cancel'});release();const result=await pending;
 assert.equal(result.cancelled,true);assert.equal(result.completed.length,3);assert.equal(s.calls.length,4);
});
test('a short Retry-After pauses the pool, halves requests in flight and continues without a cooldown',async()=>{
 let release;const gate=new Promise(r=>release=r);const list=many(4);const ok={body:{success:true}};
 const s=setup([{body:{accessToken:'t'}},{status:429,retryAfter:'2'},ok,{body:{success:true},wait:gate},ok,ok],{concurrency:3});const delays=timers(s);
 const pending=s.send({type:'cs-delete',ids:list});await tick();
 assert.equal(delays.length,1);assert.ok(delays[0]>1900&&delays[0]<=2000);
 assert.equal(s.calls.length,4,'3 halves to 1: the slow request in flight holds the only slot after the backoff');
 release();const result=await pending;
 assert.equal(s.calls[4].url,'https://chatgpt.com/backend-api/conversation/'+list[0],'the limited request is retried first');
 assert.equal(result.error,undefined);assert.equal(result.completed.length,4);assert.equal(s.calls.length,6);
 assert.equal(s.settings.concurrency,3,'the stored setting is untouched');assert.equal(s.settings.deleteCooldownUntil,undefined);
});
test('a 429 without Retry-After backs off once, then stops with the shared cooldown',async()=>{
 const s=setup([{body:{accessToken:'t'}},{status:429},{status:429}],{concurrency:1});const delays=timers(s);const before=Date.now();
 const result=await s.send({type:'cs-delete',ids});
 assert.equal(result.error,'rate-limit');assert.equal(result.completed.length,0);assert.equal(s.calls.length,3);
 assert.equal(delays.length,1);assert.ok(delays[0]>4900&&delays[0]<=5000);
 assert.equal(s.settings.concurrency,1);assert.ok(s.settings.deleteCooldownUntil>=before+60000);assert.equal(result.retryAt,s.settings.deleteCooldownUntil);
});
test('short rate limits retry at most three times before the cooldown stop',async()=>{
 const limit={status:429,retryAfter:'1'};const s=setup([{body:{accessToken:'t'}},limit,limit,limit,limit],{concurrency:1});const delays=timers(s);
 const result=await s.send({type:'cs-delete',ids:[ids[0]]});
 assert.equal(result.error,'rate-limit');assert.equal(s.calls.length,5);assert.equal(delays.length,3);assert.ok(s.settings.deleteCooldownUntil>Date.now());
});
test('a long Retry-After stops at once and stores the server window',async()=>{
 const s=setup([{status:429,retryAfter:'45'}],{concurrency:1});const delays=timers(s);s.context.location={href:'https://grok.com/'};const before=Date.now();
 const result=await s.context.ChatTidyBatch.run({ids});
 assert.equal(result.error,'rate-limit');assert.equal(s.calls.length,1);assert.deepEqual(delays,[]);
 assert.equal(s.settings.concurrency,1);assert.ok(s.settings.grokDeleteCooldownUntil>=before+60000);
});
test('Claude native groups run up to the concurrency setting',async()=>{
 let release;const gate=new Promise(r=>release=r);const list=many(61);
 const s=setup([0,20,40].map(i=>({body:{deleted:list.slice(i,i+20)},wait:gate})).concat({body:{deleted:[list[60]]}}),{concurrency:3});const delays=timers(s);
 const pending=s.send({type:'cs-delete',ids:list,organizationId:ids[0]},{url:'https://claude.ai/'});await tick();
 assert.equal(s.calls.length,3);release();const result=await pending;
 assert.equal(result.completed.length,61);assert.deepEqual(s.calls.map(c=>JSON.parse(c.options.body).conversation_uuids.length),[20,20,20,1]);assert.deepEqual(delays,[]);
});
test('Claude Cowork tasks stay one request at a time at any concurrency',async()=>{
 let release;const gate=new Promise(r=>release=r);const tasks=['A','B','C'].map(c=>'cse_01'+c.repeat(22));
 const s=setup([{status:204,wait:gate},{status:204},{status:204}],{concurrency:3});
 const pending=s.send({type:'cs-delete',ids:tasks,organizationId:ids[0]},{url:'https://claude.ai/'});await tick();
 assert.equal(s.calls.length,1);release();const result=await pending;
 assert.equal(result.completed.length,3);assert.deepEqual(s.calls.map(c=>c.url),tasks.map(t=>'https://claude.ai/v1/code/sessions/'+t));
});
test('z.ai deletes each chat through the site module and offers delete only',async()=>{
 const s=setup([]);s.context.location={href:'https://chat.z.ai/'};const core=s.context.ChatTidyCore,original=core.siteForUrl;
 // Falls back to a local site record until core.js lists z.ai.
 core.siteForUrl=url=>original(url)||(new URL(url).origin==='https://chat.z.ai'?{id:'zai',name:'Z.ai',origin:'https://chat.z.ai',route:'/c/'}:null);
 const log=[];s.context.ChatTidyZai={remove:async id=>{log.push(id);}};
 const result=await s.context.ChatTidyBatch.run({ids});assert.deepEqual(Array.from(result.completed),ids);assert.deepEqual(log,ids);
 for(const action of ['archive','restore','move'])assert.equal((await s.context.ChatTidyBatch.run({ids,action,target:'x'})).error,'unsupported-action');
 assert.equal((await s.context.ChatTidyBatch.run({ids:['../chats/']})).error,'invalid-request');assert.equal(log.length,2);
 s.context.ChatTidyZai.remove=async()=>{const e=Error('rate-limit');e.retryAt=Date.now()+90000;throw e;};
 const limited=await s.context.ChatTidyBatch.run({ids});assert.equal(limited.error,'rate-limit');assert.ok(s.settings.zaiDeleteCooldownUntil>Date.now()+80000);
 assert.equal(s.calls.length,0,'no raw fetches bypass the site module');
});
function zai(s){
 s.context.location={href:'https://chat.z.ai/'};const core=s.context.ChatTidyCore,original=core.siteForUrl;
 core.siteForUrl=url=>original(url)||(new URL(url).origin==='https://chat.z.ai'?{id:'zai',name:'Z.ai',origin:'https://chat.z.ai',route:'/c/'}:null);
 const log=[];s.context.ChatTidyZai={session:async()=>'user-a',remove:async id=>{log.push(id);}};return log;
}
test('z.ai batch checks the expected account before any deletion',async()=>{
 const s=setup([]);const log=zai(s);
 assert.equal((await s.context.ChatTidyBatch.run({ids,expectedUserId:'user-b'})).error,'account-changed');assert.equal(log.length,0);
 assert.equal((await s.context.ChatTidyBatch.run({ids,expectedUserId:'user-a'})).completed.length,2);assert.equal(log.length,2);
});
test('a 429 beside a real failure keeps the cooldown but reports the failure',async()=>{
 const s=setup([{body:{accessToken:'t'}},{body:{}},{status:429,retryAfter:'120'}],{concurrency:3});const before=Date.now();
 const result=await s.send({type:'cs-delete',ids:many(2)});
 assert.equal(result.error,'unexpected-response');assert.ok(result.retryAt>=before+120000);assert.equal(s.calls.length,3);
 assert.equal(s.settings.concurrency,1);assert.equal(s.settings.deleteCooldownUntil,result.retryAt);
});
test('non-Error rejections from a site module still produce a failure message',async()=>{
 for(const [value,message] of [['boom','boom'],[undefined,'unexpected-response'],[null,'unexpected-response'],[Error('forbidden'),'forbidden']]){
  const s=setup([]);zai(s);s.context.ChatTidyZai.remove=async()=>{throw value;};
  const result=await s.context.ChatTidyBatch.run({ids});assert.equal(result.error,message);assert.equal(result.completed.length,0);
 }
 const s=setup([]);zai(s);s.context.ChatTidyZai.session=async()=>{throw 'offline';};
 assert.equal((await s.context.ChatTidyBatch.run({ids,expectedUserId:'user-a'})).error,'offline');
});

// Real-timer harness: each deletion takes `latency` ms of real time and the peak of simultaneous deletions is recorded.
// ChatGPT session reads are answered at once and are not counted as deletions.
const origins={chatgpt:'https://chatgpt.com',claude:'https://claude.ai',grok:'https://grok.com',gemini:'https://gemini.google.com',kimi:'https://www.kimi.com',qwen:'https://chat.qwen.ai',zai:'https://chat.z.ai'};
function harness(site,settings,latency=100){
 const s=setup([],settings);s.context.location={href:origins[site]+'/'};
 const meter={inflight:0,max:0,deletes:0,sessions:0};
 const reply=body=>({ok:true,status:200,headers:{get:()=>null},json:async()=>body});
 const work=async body=>{meter.deletes++;meter.inflight++;meter.max=Math.max(meter.max,meter.inflight);try{await new Promise(r=>setTimeout(r,latency));return body;}finally{meter.inflight--;}};
 s.context.fetch=async(path,options)=>{
  if(path==='/api/auth/session'){meter.sessions++;return reply({accessToken:'t',user:{id:'a'}});}
  return reply(await work(site==='claude'?{deleted:JSON.parse(options.body).conversation_uuids}:site==='chatgpt'?{success:true}:{}));
 };
 s.context.ChatTidyGemini={session:()=>({}),prepare:async v=>v,remove:()=>work()};
 s.context.ChatTidyKimi={session:()=>({}),remove:()=>work()};
 s.context.ChatTidyQwen={session:async()=>'a',api:{remove:()=>work()}};
 s.context.ChatTidyZai={session:async()=>'a',remove:()=>work()};
 const ids=n=>site==='gemini'?Array.from({length:n},(_,i)=>i.toString(16).padStart(8,'0')):many(n);
 const run=n=>s.context.ChatTidyBatch.run({ids:ids(n),organizationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expectedUserId:['chatgpt','qwen','zai'].includes(site)?'a':undefined});
 return {s,meter,run};
}
test('concurrency options are exactly 1, 3, 5, 10 and 15 with 5 as the default',()=>{
 const s=setup([]);assert.deepEqual(Array.from(s.context.ChatTidyCore.concurrencyOptions),[1,3,5,10,15]);
 assert.equal(s.context.ChatTidyCore.settings.concurrency,5);assert.ok(Object.isFrozen(s.context.ChatTidyCore.concurrencyOptions));
});
test('real timers: 45 deletions at 100 ms each take ceil(45/N) rounds with N requests truly in flight',async t=>{
 const latency=100,total=45;
 const runs=await Promise.all([15,10,5,3,1].map(async concurrency=>{
  const {meter,run}=harness('chatgpt',{concurrency},latency);const started=performance.now();
  const result=await run(total);return {concurrency,result,meter,elapsed:performance.now()-started};
 }));
 for(const {concurrency,result,meter,elapsed} of runs){
  const rounds=Math.ceil(total/concurrency);
  t.diagnostic(`concurrency ${concurrency}: ${Math.round(elapsed)} ms for ${total} deletions (${rounds} rounds = ${rounds*latency} ms ideal), peak in flight ${meter.max}, account checks ${meter.sessions}`);
  assert.equal(result.error,undefined);assert.equal(result.completed.length,total);
  assert.equal(meter.max,Math.min(concurrency,total),'requests in flight at once');
  assert.ok(elapsed>=rounds*latency-5,'never faster than the rounds allow');
  assert.ok(elapsed<rounds*latency+Math.max(latency,rounds*4),`${Math.round(elapsed)} ms is within one round of ${rounds*latency} ms`);
 }
});
for(const site of Object.keys(origins))test(`${site}: the pool keeps the configured number of deletions in flight`,async()=>{
 for(const concurrency of [3,15]){
  const {meter,run}=harness(site,{concurrency},10);const items=concurrency*2;
  const result=await run(site==='claude'?items*20:items);
  assert.equal(result.error,undefined);assert.equal(result.completed.length,site==='claude'?items*20:items);
  assert.equal(meter.max,concurrency,site+' at '+concurrency);assert.equal(meter.deletes,items);
 }
});
test('stored concurrency outside 1, 3, 5, 10, 15 falls back to 5',async()=>{
 for(const value of [2,0,20,'5','15',null,-1,7.5,'abc',undefined]){
  const {meter,run}=harness('grok',value===undefined?{}:{concurrency:value},10);
  const result=await run(20);assert.equal(result.completed.length,20);assert.equal(meter.max,5,'stored '+JSON.stringify(value));
 }
 for(const value of [1,3,10,15]){const {meter,run}=harness('grok',{concurrency:value},10);await run(20);assert.equal(meter.max,value);}
});
test('short 429s halve the requests in flight from 15 to 7, then to 3, and finish without a cooldown',async()=>{
 const s=setup([],{concurrency:15});s.context.location={href:'https://grok.com/'};
 let calls=0,limits=0,inflight=0;const peak=[0,0,0];
 s.context.fetch=async()=>{
  const call=++calls;inflight++;peak[limits]=Math.max(peak[limits],inflight);
  await new Promise(r=>setTimeout(r,20));inflight--;
  if(call===1||call===20){limits++;return {ok:false,status:429,headers:{get:()=>'1'}};}
  return {ok:true,status:200,headers:{get:()=>null},json:async()=>({})};
 };
 const result=await s.context.ChatTidyBatch.run({ids:many(60)});
 assert.equal(result.error,undefined);assert.equal(result.completed.length,60);assert.deepEqual(peak,[15,7,3]);
 assert.equal(s.settings.concurrency,15,'the stored setting is untouched');assert.equal(s.settings.grokDeleteCooldownUntil,undefined);
});
test('ChatGPT account rechecks run beside the pool instead of pausing it',async()=>{
 const s=setup([],{concurrency:3});let checks=0,checking=0,inflight=0,max=0,beside=0;
 const reply=body=>({ok:true,status:200,headers:{get:()=>null},json:async()=>body});
 s.context.fetch=async path=>{
  if(path==='/api/auth/session'){checks++;if(checks===1)return reply({accessToken:'t',user:{id:'a'}});checking++;await new Promise(r=>setTimeout(r,60));checking--;return reply({user:{id:'a'}});}
  inflight++;max=Math.max(max,inflight);if(checking)beside++;await new Promise(r=>setTimeout(r,10));inflight--;return reply({success:true});
 };
 const result=await s.context.ChatTidyBatch.run({ids:many(90),expectedUserId:'a'});
 assert.equal(result.error,undefined);assert.equal(result.completed.length,90);assert.equal(max,3);
 assert.ok(checks>=3,'rechecked every 30 requests at 3 in flight');assert.ok(beside>=6,'deletions kept starting while a check was in flight');
});
test('429s from requests launched before a backoff join it instead of halving again',async()=>{
 // 15 in flight; four of them answer 429 Retry-After: 1 one after another. Only the first starts an episode (15 -> 7).
 const s=setup([],{concurrency:15});s.context.location={href:'https://grok.com/'};const delays=timers(s);
 let calls=0,inflight=0,limited=false,after=0;const late={1:10,2:30,3:50,4:70};
 s.context.fetch=async()=>{
  const call=++calls;inflight++;if(limited)after=Math.max(after,inflight);
  await new Promise(r=>setTimeout(r,late[call]??(call<=15?100:10)));inflight--;
  if(late[call]){limited=true;return {ok:false,status:429,headers:{get:()=>'1'}};}
  return {ok:true,status:200,headers:{get:()=>null},json:async()=>({})};
 };
 const result=await s.context.ChatTidyBatch.run({ids:many(60)});
 assert.equal(result.error,undefined);assert.equal(result.completed.length,60);assert.equal(calls,64,'the four limited requests are retried once each');
 assert.equal(after,7,'halved once to 7, never to 3 or 1');assert.equal(delays.length,4,'each 429 extends the same pause');
 assert.equal(s.settings.concurrency,15);assert.equal(s.settings.grokDeleteCooldownUntil,undefined);
});
test('a 429 that arrives after Stop is reported without lowering concurrency or writing a cooldown',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const s=setup([{body:{accessToken:'t'}},{body:{success:true},wait:gate},{status:429,retryAfter:'120',wait:gate},{body:{success:true},wait:gate}],{concurrency:3});
 const pending=s.send({type:'cs-delete',ids:many(4)});await tick();
 await s.send({type:'cs-cancel'});release();const result=await pending;
 assert.deepEqual(Object.keys(result).sort(),['cancelled','completed','error','retryAt']);
 assert.equal(result.cancelled,true);assert.equal(result.completed.length,2);assert.equal(result.error,'rate-limit');assert.equal(result.retryAt,undefined);
 assert.equal(s.settings.concurrency,3);assert.equal(s.settings.deleteCooldownUntil,undefined);assert.equal(s.calls.length,4);
});
test('a rate-limited ChatGPT account check pauses briefly and is retried instead of stopping',async()=>{
 const s=setup([],{concurrency:1});const delays=timers(s);let sessions=0;const reply=body=>({ok:true,status:200,headers:{get:()=>null},json:async()=>body});
 s.context.fetch=async path=>{if(path!=='/api/auth/session')return reply({success:true});sessions++;
  if(sessions===2)return {ok:false,status:429,headers:{get:()=>'2'}};return reply({accessToken:'t',user:{id:'a'}});};
 const result=await s.context.ChatTidyBatch.run({ids:many(25),expectedUserId:'a'});
 assert.equal(result.error,undefined);assert.equal(result.completed.length,25);assert.equal(sessions,4,'initial, limited, retried right after the pause, then 10 requests later');
 assert.ok(delays.some(ms=>ms>1900&&ms<=2000),'the server window paused the pool');assert.equal(s.settings.deleteCooldownUntil,undefined);
});
test('bulk groups get a 60 s window, single-chat requests 20 s, and a timed-out group stays unconfirmed',async()=>{
 const seen=[];const task='cse_01AAAAAAAAAAAAAAAAAAAAAA';const list=many(41);
 const s=setup([{body:{deleted:list.slice(0,20)}},{body:{deleted:list.slice(20,40)}},{body:{deleted:[list[40]]}},{status:204}],{concurrency:3});
 s.context.AbortSignal={timeout:ms=>{seen.push(ms);return AbortSignal.timeout(ms);}};
 const result=await s.send({type:'cs-delete',ids:[...list,task],organizationId:ids[0]},{url:'https://claude.ai/'});
 assert.equal(result.completed.length,42);assert.deepEqual(seen,[60000,60000,60000,20000]);
 const grok=setup([{body:{}}]);grok.context.AbortSignal=s.context.AbortSignal;seen.length=0;
 await grok.send({type:'cs-delete',ids:[ids[0]]},{url:'https://grok.com/'});assert.deepEqual(seen,[20000]);
 // A group whose request times out or loses the network is reported as a failure and none of its IDs count as deleted.
 const lost=setup([{body:{deleted:list.slice(0,20)}},Error('timeout'),{body:{deleted:[list[40]]}}],{concurrency:3});
 const failed=await lost.send({type:'cs-delete',ids:list,organizationId:ids[0]},{url:'https://claude.ai/'});
 assert.equal(failed.error,'network');assert.equal(lost.calls.length,3,'no silent retry');
 assert.deepEqual(Array.from(failed.completed).sort(),[...list.slice(0,20),list[40]].sort());assert.ok(list.slice(20,40).every(id=>!failed.completed.includes(id)));
});
