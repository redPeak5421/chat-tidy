const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
function setup(responses,settings={}){
 let listener;const calls=[],progress=[];
 const context={chrome:{storage:{local:{get:async defaults=>({...defaults,...settings}),set:async values=>Object.assign(settings,values)}},runtime:{id:'extension',onMessage:{addListener:fn=>listener=fn}},tabs:{sendMessage:async(tab,event)=>progress.push(event)}},AbortSignal,setTimeout:fn=>setTimeout(fn,0),URL,
 fetch:async(url,options)=>{calls.push({url,options});const next=responses.shift();if(next instanceof Error)throw next;if(next.wait)await next.wait;return {headers:{get:()=>next.retryAfter||null},ok:next.status===undefined||next.status===200,status:next.status||200,json:async()=>next.body};}};
 const sandbox=vm.createContext(context);context.importScripts=()=>vm.runInContext(fs.readFileSync('src/core.js','utf8'),sandbox);
 vm.runInContext(fs.readFileSync('src/background.js','utf8'),sandbox);
 const sender={id:'extension',tab:{id:7},frameId:0,url:'https://chatgpt.com/'};
 const send=(message,source=sender)=>new Promise(resolve=>{if(listener(message,source,resolve)!==true)resolve(undefined)});
 return {send,calls,progress,sender,settings};
}
test('background authenticates once and PATCHes precisely the approved IDs',async()=>{
 const s=setup([{body:{accessToken:'test-token'}},{body:{success:true}},{body:{success:true}}]);
 const result=await s.send({type:'cs-delete',jobId:'batch',ids});assert.equal(result.completed.length,2);assert.equal(s.progress.length,2);
 assert.equal(s.calls[0].url,'https://chatgpt.com/api/auth/session');
 for(let i=0;i<2;i++){const call=s.calls[i+1];assert.equal(call.url,'https://chatgpt.com/backend-api/conversation/'+ids[i]);assert.equal(call.options.method,'PATCH');assert.deepEqual(JSON.parse(call.options.body),{is_visible:false});assert.equal(call.options.headers.Authorization,'Bearer test-token');}
 assert.ok(!JSON.stringify(s.progress).includes('test-token'));
});
test('rejects hostile origins, frames and malformed IDs without network requests',async()=>{
 const s=setup([]);for(const sender of [{...s.sender,url:'https://evil.test/'},{...s.sender,frameId:1},{...s.sender,id:'other'}])await s.send({type:'cs-delete',jobId:'b',ids},sender);
 const invalid=await s.send({type:'cs-delete',jobId:'b',ids:['../../delete-all']});assert.equal(invalid.error,'invalid-request');assert.equal(s.calls.length,0);
});
test('stops at a failed request and reports only acknowledged completions',async()=>{
 const s=setup([{body:{accessToken:'token'}},{body:{success:true}},{status:429}]);const result=await s.send({type:'cs-delete',jobId:'b',ids});assert.equal(result.error,'rate-limit');assert.deepEqual(Array.from(result.completed),[ids[0]]);
});
test('expired login and unexpected success body never claim deletion',async()=>{
 for(const responses of [[{body:{}}],[{body:{accessToken:'token'}},{body:{}}]]){const s=setup(responses);const result=await s.send({type:'cs-delete',jobId:'b',ids});assert.equal(result.completed.length,0);assert.ok(result.error);}
});
test('cancel prevents subsequent requests while preserving the in-flight result',async()=>{
 const s=setup([{body:{accessToken:'token'}},{body:{success:true}}]);const pending=s.send({type:'cs-delete',jobId:'b',ids});await s.send({type:'cs-cancel',jobId:'b'});const result=await pending;assert.equal(result.cancelled,true);assert.equal(s.calls.length,1);
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
 assert.equal(s.calls[0].options.method,'POST');
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
