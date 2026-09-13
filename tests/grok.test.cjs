const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
test('show all fetches every page once, deduplicates sidebar, and restores on disable',async()=>{
 const dom=new JSDOM(`<div data-sidebar="sidebar"><ul data-sidebar="menu"><li><a href="/c/${id('1')}">One</a></li></ul><button>View all</button></div>`,{url:'https://grok.com/',runScripts:'outside-only'}),w=dom.window;
 try{const calls=[];const pages=[{conversations:[{conversationId:id('1'),title:'One'},{conversationId:id('2'),title:'<script>Two</script>'}],nextPageToken:'next'},{conversations:[{conversationId:id('3'),title:'Three'}]}];w.fetch=async url=>{calls.push(url);return {ok:true,status:200,json:async()=>pages.shift()}};
 w.eval(fs.readFileSync('src/core.js','utf8'));w.eval(fs.readFileSync('src/grok.js','utf8'));
 const list=w.ChatTidyGrok.create({changed:()=>{},error:()=>{}});await list.setEnabled(true);
 assert.equal(calls.length,2);assert.ok(calls[1].includes('pageToken=next'));assert.equal(w.document.querySelectorAll('a').length,3);assert.equal(w.document.querySelector('script'),null);
 await list.setEnabled(true);assert.equal(calls.length,2);await list.setEnabled(false);assert.equal(w.document.querySelectorAll('a').length,1);
 }finally{w.close()}
});
test('list errors stop pagination without automatic retry',async()=>{
 const dom=new JSDOM('',{url:'https://grok.com/',runScripts:'outside-only'}),w=dom.window;try{
 let calls=0;const errors=[];w.fetch=async()=>{calls++;return {ok:false,status:429}};w.eval(fs.readFileSync('src/grok.js','utf8'));
 const list=w.ChatTidyGrok.create({changed:()=>{},error:e=>errors.push(e)});await list.setEnabled(true);await list.setEnabled(true);
 assert.equal(calls,1);assert.deepEqual(errors,['http-429']);await list.setEnabled(false);
 }finally{w.close()}
});

test('extra rows inherit native row layout without copying selection or menu controls',async()=>{
 const dom=new JSDOM(`<style>.native-row{margin:0 4px}.native-link{height:36px;padding:6px 12px}</style><div data-sidebar="sidebar"><ul><li data-sidebar="menu-item" class="native-row"><div class="wrapper"><a href="/c/${id('1')}" class="native-link cs-chat-link cs-selected cs-dynamic" data-active="true" aria-expanded="true"><input class="cs-checkbox" checked><span>One</span></a><button>Menu</button></div></li></ul></div>`,{url:'https://grok.com/',runScripts:'outside-only'}),w=dom.window;
 try{
 w.fetch=async()=>({ok:true,json:async()=>({conversations:[{conversationId:id('2'),title:'Two'}]})});
 w.eval(fs.readFileSync('src/core.js','utf8'));w.eval(fs.readFileSync('src/grok.js','utf8'));
 const manager=w.ChatTidyGrok.create({changed:()=>{},error:e=>assert.fail(e)});await manager.setEnabled(true);
 const extra=w.document.querySelector('[data-cs-extra]'),link=extra.querySelector('a'),native=w.document.querySelector('a');
 assert.equal(w.getComputedStyle(extra).margin,'0px 4px');
 for(const prop of ['height','padding'])assert.equal(w.getComputedStyle(link)[prop],w.getComputedStyle(native)[prop]);
 assert.equal(link.parentElement.className,'wrapper');assert.equal(extra.dataset.sidebar,'menu-item');
 assert.equal(extra.querySelector('button,input'),null);assert.equal(link.hasAttribute('data-active'),false);assert.equal(link.hasAttribute('aria-expanded'),false);assert.equal(link.classList.contains('cs-selected'),false);assert.equal(link.classList.contains('cs-dynamic'),false);
 manager.render();assert.equal(w.document.querySelectorAll('[data-cs-extra]').length,1);
 }finally{w.close()}
});
