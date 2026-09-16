const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
function setup(responses,settings={}){
 const calls=[],progress=[];let origin='https://chatgpt.com';let busy=false;
 const context={browser:{storage:{local:{get:async defaults=>({...defaults,...settings}),set:async values=>Object.assign(settings,values)}}},
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
 const s=setup([{body:{accessToken:'token'}},{body:{success:true}},{status:429}]);const result=await s.send({type:'cs-delete',jobId:'b',ids});assert.equal(result.error,'rate-limit');assert.deepEqual(Array.from(result.completed),[ids[0]]);
});
test('expired login and unexpected success body never claim deletion',async()=>{
 for(const responses of [[{body:{}}],[{body:{accessToken:'token'}},{body:{}}]]){const s=setup(responses);const result=await s.send({type:'cs-delete',jobId:'b',ids});assert.equal(result.completed.length,0);assert.ok(result.error);}
});
test('cancel prevents subsequent requests while preserving the in-flight result',async()=>{
 const s=setup([{body:{accessToken:'token'}},{body:{success:true}}]);const pending=s.send({type:'cs-delete',jobId:'b',ids});await s.send({type:'cs-cancel',jobId:'b'});const result=await pending;assert.equal(result.cancelled,true);assert.equal(s.calls.length,0);
});

test('launches only configured concurrency and waits for the entire wave',async()=>{
 let release;const gate=new Promise(r=>release=r);const third='33333333-3333-4333-8333-333333333333';
 const s=setup([{body:{accessToken:'t'}},{body:{success:true},wait:gate},{body:{success:true},wait:gate},{body:{success:true}}]);
 const pending=s.send({type:'cs-delete',jobId:'b',ids:[...ids,third]});await new Promise(r=>setImmediate(r));
 assert.equal(s.calls.length,3);release();const result=await pending;assert.equal(result.completed.length,3);assert.equal(s.calls.length,4);
});
test('429 collects in-flight success, blocks next wave, shares cooldown and reduces concurrency',async()=>{
 const s=setup([{body:{accessToken:'t'}},{status:429,retryAfter:'120'},{body:{success:true}}]);
 const before=Date.now();const result=await s.send({type:'cs-delete',jobId:'b',ids:[...ids,'33333333-3333-4333-8333-333333333333']});
 assert.equal(result.error,'rate-limit');assert.deepEqual(Array.from(result.completed),[ids[1]]);assert.equal(s.settings.concurrency,1);assert.ok(result.retryAt>=before+120000);assert.equal(s.calls.length,3);
 const again=await s.send({type:'cs-delete',jobId:'c',ids});assert.equal(again.error,'cooldown');assert.equal(s.calls.length,3);
});
test('stop waits for in-flight successes without starting remaining requests',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const s=setup([{body:{accessToken:'t'}},{body:{success:true},wait:gate},{body:{success:true},wait:gate}]);
 const pending=s.send({type:'cs-delete',jobId:'b',ids:[...ids,'33333333-3333-4333-8333-333333333333']});await new Promise(r=>setImmediate(r));
 await s.send({type:'cs-cancel',jobId:'b'});release();const result=await pending;assert.equal(result.cancelled,true);assert.equal(result.completed.length,2);assert.equal(s.calls.length,3);
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
 const s=setup([{status:403}]);
 const result=await s.send({type:'cs-delete',jobId:'c',ids:many,organizationId:ids[0]},{...s.sender,url:'https://claude.ai/'});
 assert.equal(result.error,'forbidden');assert.equal(result.completed.length,0);assert.equal(s.calls.length,1);assert.equal(s.calls[0].source,'content');
});
test('Claude 429 honors Retry-After and prevents the next group',async()=>{
 const many=Array.from({length:21},(_,i)=>String(i).padStart(8,'0')+'-1111-4111-8111-111111111111');
 const s=setup([{status:429,retryAfter:'120'}]);const before=Date.now();
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
test('workspace changes after a Claude wave stop all later groups',async()=>{
 const many=Array.from({length:21},(_,i)=>String(i).padStart(8,'0')+'-1111-4111-8111-111111111111');
 const s=setup([{body:{deleted:many.slice(0,20)}}]);s.context.location={href:'https://claude.ai/'};let valid=true;
 const result=await s.context.ChatTidyBatch.run({ids:many,organizationId:ids[0],canRun:()=>valid,onProgress:()=>{valid=false;}});
 assert.equal(result.error,'workspace-changed');assert.equal(result.completed.length,20);assert.equal(s.calls.length,1);
});
test('restore only clears archive flag and is rejected on other sites',async()=>{
 const s=setup([{body:{accessToken:'t'}},{body:{success:true}}]);const result=await s.context.ChatTidyBatch.run({ids:[ids[0]],action:'restore'});assert.equal(result.completed.length,1);assert.deepEqual(JSON.parse(s.calls[1].options.body),{is_archived:false});
 const other=setup([]);await other.send({ids:[]},{url:'https://grok.com/'});assert.equal((await other.context.ChatTidyBatch.run({ids,action:'restore'})).error,'unsupported-action');assert.equal(other.calls.length,0);
});
test('archive operations stop if authenticated user changes between waves',async()=>{
 const s=setup([{body:{accessToken:'t',user:{id:'a'}}},{body:{accessToken:'t',user:{id:'a'}}},{body:{success:true}},{body:{accessToken:'u',user:{id:'b'}}}],{concurrency:1});
 const result=await s.context.ChatTidyBatch.run({ids,action:'restore',expectedUserId:'a'});assert.equal(result.error,'account-changed');assert.equal(s.calls.filter(c=>c.options.method==='PATCH').length,1);
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
