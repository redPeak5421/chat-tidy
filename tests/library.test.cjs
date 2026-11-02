const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
// A fresh library over an in-memory chrome.storage.local with change events, like the extension's.
function load(initial={}){
 const data=structuredClone(initial),listeners=new Set();
 const local={get:async defaults=>{const out={};for(const [k,v] of Object.entries(defaults))out[k]=k in data?structuredClone(data[k]):v;return out;},
  set:async values=>{const changes={};for(const [k,v] of Object.entries(values)){changes[k]={oldValue:data[k],newValue:structuredClone(v)};data[k]=structuredClone(v);}for(const fn of listeners)fn(changes,'local');},
  remove:async key=>{delete data[key];}};
 const context={chrome:{storage:{local,onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}}};
 context.globalThis=context;vm.createContext(context);vm.runInContext(fs.readFileSync('src/library.js','utf8'),context);
 return {library:context.ChatTidyLibrary,data,listeners};
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('hash is stable across whitespace and case, clip collapses whitespace and ellipsizes',()=>{
 const {library}=load();
 assert.equal(library.hash('  Hello   World '),library.hash('hello world'));assert.notEqual(library.hash('hello world'),library.hash('hello worlds'));
 assert.match(library.hash('任何问题'),/^[0-9a-z]+$/);assert.equal(library.hash(null),library.hash(''));
 assert.equal(library.clip(' a \n\t b '),'a b');assert.equal(library.clip('abcdef',4),'abc…');assert.equal(library.clip('abcd',4),'abcd');assert.equal(library.clip(undefined),'');
});
test('keys: chats by site and chat, answers by message ID, else question hash and index',()=>{
 const {library}=load();
 assert.equal(library.chatKey('chatgpt','abc'),'chatgpt:abc');
 assert.equal(library.turnRef({id:'m1',index:3,hash:'h'}),'id:m1');
 assert.equal(library.turnRef({id:null,index:3,hash:'h'}),'q:h:3');
 assert.equal(library.turnRef({question:'Why?',index:2}),'q:'+library.hash('Why?')+':2');
 assert.equal(library.answerKey('claude','c1',{id:'m9'}),'claude:c1#id:m9');
 assert.equal(library.answerKey('claude','c1',{hash:'h',index:0}),'claude:c1#q:h:0');
});
test('tags are trimmed, de-duplicated case-insensitively, split on both commas and capped',()=>{
 const {library}=load();
 assert.deepEqual(plain(library.tags([' Work ','work','#ideas','',null,'a  b'])),['Work','ideas','a b']);
 assert.deepEqual(plain(library.tags('one, two，three,,One')),['one','two','three']);
 assert.deepEqual(plain(library.tags(undefined)),[]);
 assert.equal(library.tags(Array.from({length:30},(_,i)=>'t'+i)).length,20);
 assert.equal(library.tags(['x'.repeat(50)])[0].length,32);
});
test('normalize keeps the schema, drops unknown fields and rejects items without site or chat',()=>{
 const {library}=load();
 assert.equal(library.normalize({site:'chatgpt'}),null);assert.equal(library.normalize({chatId:'c'}),null);assert.equal(library.normalize(null),null);
 const chat=library.normalize({site:'chatgpt',chatId:'c1',url:'https://chatgpt.com/c/c1',title:'  Trip   plan ',tags:'a,b',note:'n',savedAt:5,evil:'x'},100);
 assert.deepEqual(plain(chat),{key:'chatgpt:c1',type:'chat',site:'chatgpt',chatId:'c1',url:'https://chatgpt.com/c/c1',title:'Trip plan',tags:['a','b'],note:'n',savedAt:5,updatedAt:100});
 assert.equal(library.normalize({type:'weird',site:'s',chatId:'c'}).type,'chat','unknown types are chats');
 const answer=library.normalize({type:'answer',site:'claude',chatId:'c2',question:'How?',excerpt:'x'.repeat(400),turn:{index:'4'}},7);
 assert.equal(answer.key,'claude:c2#q:'+library.hash('How?')+':4');assert.deepEqual(plain(answer.turn),{id:null,index:4,hash:library.hash('How?')});
 assert.equal(answer.excerpt.length,300);assert.ok(answer.excerpt.endsWith('…'));assert.equal(answer.savedAt,7,'a new item is saved now');
 assert.equal(library.normalize({type:'answer',site:'s',chatId:'c',turn:{id:42,index:1}}).turn.id,'42');
 assert.equal(library.normalize({site:'s',chatId:'c',note:'n'.repeat(3000)}).note.length,2000);
 assert.equal('turn' in library.normalize({site:'s',chatId:'c',turn:{id:'x'}}),false,'chats carry no turn');
});
test('put, remove and load round-trip through storage; re-saving keeps the first savedAt',async()=>{
 const {library,data}=load();
 assert.deepEqual(plain(await library.load()),{});
 const first=await library.put({site:'chatgpt',chatId:'c1',title:'One',savedAt:10});assert.equal(first.key,'chatgpt:c1');
 await library.put({site:'chatgpt',chatId:'c1',title:'One renamed',savedAt:999,tags:['x']});
 const items=await library.load();assert.equal(Object.keys(items).length,1);assert.equal(items['chatgpt:c1'].title,'One renamed');assert.equal(items['chatgpt:c1'].savedAt,10);assert.deepEqual(plain(items['chatgpt:c1'].tags),['x']);
 assert.equal(await library.put({title:'no site'}),null);
 await library.put({type:'answer',site:'chatgpt',chatId:'c1',turn:{id:'m1'},question:'Q'});assert.equal(Object.keys(data.library).length,2);
 const left=await library.remove('chatgpt:c1');assert.deepEqual(Object.keys(left),['chatgpt:c1#id:m1']);assert.deepEqual(Object.keys(data.library),['chatgpt:c1#id:m1']);
 for(const broken of [[1,2],'text',null]){const {library:other}=load({library:broken});assert.deepEqual(plain(await other.load()),{},JSON.stringify(broken));}
});
test('search filters by type, tag and text across title, question, excerpt, note and tags, newest first',()=>{
 const {library}=load();
 const items={
  a:{key:'a',type:'chat',title:'Trip to Kyoto',tags:['travel'],note:'',updatedAt:1},
  b:{key:'b',type:'answer',title:'Cooking',question:'How long to boil eggs?',excerpt:'Nine minutes',tags:['Food','quick'],note:'',updatedAt:3},
  c:{key:'c',type:'chat',title:'Rust lifetimes',tags:[],note:'ask about BORROWING later',updatedAt:2}
 };
 assert.deepEqual(plain(library.search(items).map(i=>i.key)),['b','c','a']);
 assert.deepEqual(plain(library.search(items,'',{type:'chat'}).map(i=>i.key)),['c','a']);
 assert.deepEqual(plain(library.search(items,'',{type:'answer'}).map(i=>i.key)),['b']);
 assert.deepEqual(plain(library.search(items,'',{tag:'food'}).map(i=>i.key)),['b'],'tag filter ignores case');
 assert.deepEqual(plain(library.search(items,'  kyoto ').map(i=>i.key)),['a']);
 assert.deepEqual(plain(library.search(items,'eggs').map(i=>i.key)),['b'],'question');assert.deepEqual(plain(library.search(items,'nine').map(i=>i.key)),['b'],'excerpt');
 assert.deepEqual(plain(library.search(items,'borrowing').map(i=>i.key)),['c'],'note');assert.deepEqual(plain(library.search(items,'TRAV').map(i=>i.key)),['a'],'tags');
 assert.deepEqual(plain(library.search(items,'eggs',{type:'chat'})),[]);assert.deepEqual(plain(library.search(items,'kyoto',{tag:'food'})),[]);
 assert.deepEqual(plain(library.search(null)),[]);
});
test('tagCounts merges case variants under the first spelling, busiest first then alphabetical',()=>{
 const {library}=load();
 const counts=library.tagCounts({a:{tags:['Work','ideas']},b:{tags:['work','zeta']},c:{tags:['alpha']},d:{}});
 assert.deepEqual(plain(counts),[{tag:'Work',count:2},{tag:'alpha',count:1},{tag:'ideas',count:1},{tag:'zeta',count:1}]);
 assert.deepEqual(plain(library.tagCounts(undefined)),[]);
});
test('onChange reports the new library map and unsubscribes',async()=>{
 const {library,listeners}=load();const seen=[];const off=library.onChange(items=>seen.push(Object.keys(items)));
 await library.put({site:'qwen',chatId:'q1'});assert.deepEqual(plain(seen),[['qwen:q1']]);
 off();assert.equal(listeners.size,0);await library.put({site:'qwen',chatId:'q2'});assert.equal(seen.length,1);
});
test('a jump request is taken once, only by the same chat, and expires after two minutes',async()=>{
 const {library,data}=load();const item={key:'chatgpt:c1#id:m1',site:'chatgpt',chatId:'c1',turn:{id:'m1',index:2,hash:'h'}};
 await library.requestJump(item);assert.equal(data.readerJump.key,item.key);
 assert.equal(await library.takeJump('chatgpt','other'),null,'another chat leaves it');assert.equal(await library.takeJump('claude','c1'),null,'another site leaves it');
 const jump=await library.takeJump('chatgpt','c1');assert.deepEqual(plain(jump.turn),item.turn);assert.equal('readerJump' in data,false,'taken once');
 assert.equal(await library.takeJump('chatgpt','c1'),null);
 await library.requestJump(item);const at=data.readerJump.at;
 assert.ok(await library.takeJump('chatgpt','c1',at+120000),'still valid at exactly two minutes');
 await library.requestJump(item);assert.equal(await library.takeJump('chatgpt','c1',data.readerJump.at+120001),null,'expired');
 await library.requestJump({key:'chatgpt:c2',site:'chatgpt',chatId:'c2'});assert.equal(data.readerJump.turn,null,'chats jump without a turn');
});
test('writes from one context run in order, so quick bookmarks never overwrite each other',async()=>{
 const {library}=load();
 // A slow storage makes both puts read before either writes, unless they are queued.
 await Promise.all([library.put({type:'chat',site:'chatgpt',chatId:'a1',title:'A'}),library.put({type:'chat',site:'chatgpt',chatId:'b2',title:'B'}),library.remove('chatgpt:none')]);
 assert.deepEqual(Object.keys(await library.load()).sort(),['chatgpt:a1','chatgpt:b2']);
});
