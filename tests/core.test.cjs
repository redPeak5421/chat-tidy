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

test('provider routes accept only chats on the selected origin',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 assert.equal(api.chatId('/chat/'+id,'https://claude.ai'),id);
 assert.equal(api.chatId('/c/'+id,'https://grok.com'),id);
 assert.equal(api.chatId('https://grok.com/c/'+id,'https://claude.ai'),null);
 assert.equal(api.chatId('/cowork/cse_example','https://claude.ai'),null);
 assert.equal(api.chatId('/bot/'+id,'https://grok.com'),null);
 assert.equal(api.chatId('/chat/'+id,'https://claude.ai.evil.test'),null);
 assert.equal(api.siteForUrl('https://claude.ai/new').id,'claude');
 assert.equal(api.siteForUrl('https://grok.com/').id,'grok');
 assert.equal(api.siteForUrl('http://grok.com/'),null);
});
test('Kimi and Qwen origins resolve to their own sites and chat routes',()=>{
 const id='19e5dd98-dfe2-88b1-8000-09dfc2e50343';
 assert.equal(api.siteForUrl('https://www.kimi.com/chat/'+id).id,'kimi');
 assert.equal(api.siteForUrl('https://chat.qwen.ai/').id,'qwen');
 assert.equal(api.siteForUrl('https://kimi.com/'),null);
 assert.equal(api.chatId('/chat/'+id+'?chat_enter_method=history','https://www.kimi.com'),id);
 assert.equal(api.chatId('/c/'+id,'https://chat.qwen.ai'),id);
 assert.equal(api.chatId('/chat/'+id,'https://chat.qwen.ai'),null);
 assert.equal(api.chatId('/c/'+id,'https://www.kimi.com'),null);
});
test('Claude Cowork IDs are case-sensitive and scoped to Cowork routes',()=>{
 const id='cse_01AAAAAAAAAAAAAAAAAAAAAA';
 assert.equal(api.chatId('/cowork/'+id,'https://claude.ai'),id);
 assert.equal(api.chatId('/cowork/'+id,'https://grok.com'),null);
 assert.equal(api.chatId('/chat/'+id,'https://claude.ai'),null);
});
