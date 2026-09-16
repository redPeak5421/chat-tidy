const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const id='19e5dd98-dfe2-88b1-8000-09dfc2e50343';
function setup(){
 const dom=new JSDOM('<body></body>',{url:'https://www.kimi.com/chat/'+id,runScripts:'outside-only'});const w=dom.window;w.AbortSignal=AbortSignal;
 w.localStorage.setItem('access_token','fixture-token');w.localStorage.setItem('msh_user_id','user-1');w.localStorage.setItem('volcano-token-info',JSON.stringify({userId:'user-1',webId:'web-1',ssid:'ssid-1'}));
 for(const f of ['core','kimi'])w.eval(fs.readFileSync('src/'+f+'.js','utf8'));return {w};
}
test('Kimi IDs come only from /chat routes on kimi.com and ignore entry telemetry',()=>{
 const {w}=setup();try{
 assert.equal(w.ChatTidyCore.siteForUrl('https://www.kimi.com/').id,'kimi');
 assert.equal(w.ChatTidyCore.chatId('/chat/'+id+'?chat_enter_method=history','https://www.kimi.com'),id);
 assert.equal(w.ChatTidyCore.chatId('https://www.kimi.com/chat/'+id,'https://www.kimi.com'),id);
 for(const bad of ['/chat/abc','/tasks/'+id,'/chat/'+id+'/settings','https://kimi.com/chat/'+id,'/'])assert.equal(w.ChatTidyCore.chatId(bad,'https://www.kimi.com'),null);
 }finally{w.close();}
});
test('Kimi session reads the page token and the identity snapshot without persisting them',()=>{
 const {w}=setup();try{
 const session=w.ChatTidyKimi.session();
 assert.deepEqual(JSON.parse(JSON.stringify(session)),{token:'fixture-token',userId:'user-1',webId:'web-1',ssid:'ssid-1'});
 w.localStorage.removeItem('access_token');assert.throws(()=>w.ChatTidyKimi.session(),/login/);
 }finally{w.close();}
});
test('Kimi deletion posts one Connect unary call with the native headers and requires an empty acknowledgment',async()=>{
 const {w}=setup();try{
 const calls=[];w.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,headers:{get:()=>null},json:async()=>({})};};
 await w.ChatTidyKimi.remove(id,w.ChatTidyKimi.session());
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/apiv2/kimi.chat.v1.ChatService/DeleteChat');
 assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.mode,'same-origin');
 assert.deepEqual(JSON.parse(calls[0].options.body),{chat_id:id});
 const headers=calls[0].options.headers;
 assert.equal(headers.Authorization,'Bearer fixture-token');assert.equal(headers['Connect-Protocol-Version'],'1');assert.equal(headers['Content-Type'],'application/json');
 assert.equal(headers['x-msh-platform'],'web');assert.equal(headers['X-Traffic-Id'],'user-1');assert.equal(headers['x-msh-device-id'],'web-1');assert.equal(headers['x-msh-session-id'],'ssid-1');
 for(const bad of [null,[],{code:'not_found',message:'missing'},{error:'x'}])assert.throws(()=>w.ChatTidyKimi.acknowledge(bad),/unexpected-response/);
 w.fetch=async()=>({ok:false,status:401,headers:{get:()=>null},json:async()=>({code:'unauthenticated'})});
 await assert.rejects(w.ChatTidyKimi.remove(id,w.ChatTidyKimi.session()),/login/);
 }finally{w.close();}
});
test('Kimi rejects invalid IDs, cancelled runs and account switches before any request',async()=>{
 const {w}=setup();try{
 let calls=0;w.fetch=async()=>{calls++;return {ok:true,status:200,headers:{get:()=>null},json:async()=>({})};};
 const session=w.ChatTidyKimi.session();
 await assert.rejects(w.ChatTidyKimi.remove('../chat',session),/invalid-request/);
 await assert.rejects(w.ChatTidyKimi.remove(id,session,()=>false),/workspace-changed/);
 w.localStorage.setItem('access_token','other-token');
 await assert.rejects(w.ChatTidyKimi.remove(id,session),/account-changed/);
 assert.equal(calls,0);
 }finally{w.close();}
});
test('Kimi batch deletes sequentially per ID and never offers archive or move',async()=>{
 const {w}=setup();try{
 const calls=[];w.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,headers:{get:()=>null},json:async()=>({})};};
 w.browser={storage:{local:{get:async d=>d,set:async()=>{}}}};w.chrome=w.browser;w.navigator.locks={request:async(_,__,fn)=>fn({})};
 w.eval(fs.readFileSync('src/batch.js','utf8'));
 const other='2aaa1234-1234-1234-1234-123456789abc';
 let result=await w.ChatTidyBatch.run({ids:[id,other]});
 assert.deepEqual(Array.from(result.completed),[id,other]);assert.equal(calls.length,2);assert.equal(calls[1].options.headers.Authorization,'Bearer fixture-token');
 assert.equal((await w.ChatTidyBatch.run({ids:[id],action:'archive'})).error,'unsupported-action');
 assert.equal((await w.ChatTidyBatch.run({ids:[id],action:'move',target:'x'})).error,'unsupported-action');
 assert.equal(calls.length,2);
 }finally{w.close();}
});
