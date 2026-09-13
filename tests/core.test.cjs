const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={URL,Set,Map,setTimeout,clearTimeout}; vm.createContext(context);
vm.runInContext(fs.existsSync('src/core.js')?fs.readFileSync('src/core.js','utf8'):'',context); const api=context.ChatTidyCore;
test('only accepts ChatGPT conversation UUID routes, including project chats',()=>{
 assert.ok(api,'selection engine must exist'); const id='11111111-1111-4111-8111-111111111111';
 assert.equal(api.chatId('/c/'+id),id); assert.equal(api.chatId('/g/g-p-demo/c/'+id),id);
 for(const href of ['/','/g/explore','https://evil.example/c/'+id,'/c/foo','/share/'+id]) assert.equal(api.chatId(href),null);
});
test('invert touches only supplied loaded IDs; select all deduplicates',()=>{
 assert.ok(api); const selected=new Map([['a','A']]);
 api.select(selected,[{id:'a',title:'A'},{id:'b',title:'B'},{id:'b',title:'B'}],'invert');
 assert.deepEqual([...selected.keys()],['b']);
 api.select(selected,[{id:'a',title:'A'},{id:'b',title:'B'}],'all'); assert.equal(selected.size,2);
 api.select(selected,[],'clear'); assert.equal(selected.size,0);
});
test('deletion queue stops at first failure',async()=>{
 assert.ok(api); const calls=[];
 const result=await api.runQueue([{id:'a'},{id:'b'},{id:'c'}],async(item)=>{calls.push(item.id);if(item.id==='b')throw Error('changed');},()=>false,()=>{},async()=>{});
 assert.deepEqual(calls,['a','b']);assert.equal(result.done,1);assert.equal(result.error.message,'changed');
});
test('cancellation prevents the next deletion',async()=>{
 assert.ok(api); let stop=false,calls=0;
 const result=await api.runQueue([{id:'a'},{id:'b'}],async()=>{calls++;stop=true;},()=>stop,()=>{},async()=>{});
 assert.equal(calls,1);assert.equal(result.cancelled,true);
});
