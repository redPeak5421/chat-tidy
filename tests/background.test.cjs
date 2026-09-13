const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
function setup(responses,settings={}){
 let listener;const calls=[],progress=[];
 const context={chrome:{storage:{local:{get:async defaults=>({...defaults,...settings}),set:async values=>Object.assign(settings,values)}},runtime:{id:'extension',onMessage:{addListener:fn=>listener=fn}},tabs:{sendMessage:async(tab,event)=>progress.push(event)}},AbortSignal,setTimeout:fn=>setTimeout(fn,0),URL,
 fetch:async(url,options)=>{calls.push({url,options});const next=responses.shift();if(next instanceof Error)throw next;if(next.wait)await next.wait;return {headers:{get:()=>next.retryAfter||null},ok:next.status===undefined||next.status===200,status:next.status||200,json:async()=>next.body};}};
 vm.runInNewContext(fs.readFileSync('src/background.js','utf8'),context);
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
