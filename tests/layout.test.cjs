const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const source=fs.readFileSync('src/layout.js','utf8');
function load(){
 const dom=new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>',{url:'https://chatgpt.com/c/1',runScripts:'outside-only'}),w=dom.window,writes=[];
 w.chrome={storage:{local:{set:async data=>{writes.push(data);}}}};
 for(const name of ['core','reader-sites'])w.eval(fs.readFileSync('src/'+name+'.js','utf8'));w.eval(source);return {w,d:w.document,writes,layout:w.ChatTidyLayout};
}
const adapter={id:'site',layout:{width:'main{max-width:{width}}',compactSidebar:'nav{width:{sidebar}}',sidebar:'nav',clutter:'.upsell{display:none}',focus:'nav{display:none}'}};
const base={enabled:true,chatWidth:'default',compactSidebar:false,hideClutter:false,focusMode:false};
test('css() builds one rule per enabled option from the adapter and nothing otherwise',()=>{
 const {layout}=load();
 assert.equal(layout.css(adapter,base),'');
 assert.equal(layout.css(adapter,{...base,chatWidth:'wide'}),'main{max-width:1040px}');
 assert.equal(layout.css(adapter,{...base,chatWidth:'full'}),'main{max-width:calc(100% - 48px)}');
 assert.equal(layout.css(adapter,{...base,chatWidth:'bogus'}),'','unknown widths change nothing');
 assert.equal(layout.css(adapter,{...base,compactSidebar:true}),'','resizable but never dragged: the site keeps its width');
 assert.equal(layout.css(adapter,{...base,compactSidebar:true,sidebarWidths:{site:260,other:400}}),'nav{width:260px}');
 assert.equal(layout.css(adapter,{...base,compactSidebar:true,sidebarWidths:{site:20}}),'nav{width:180px}','clamped to the minimum');
 assert.equal(layout.css(adapter,{...base,compactSidebar:true,sidebarWidths:{site:2000}}),'nav{width:480px}','clamped to the maximum');
 assert.equal(layout.css(adapter,{...base,compactSidebar:true,sidebarWidths:{site:'x'}}),'','junk widths change nothing');
 assert.equal(layout.css(adapter,{...base,compactSidebar:false,sidebarWidths:{site:260}}),'','off ignores the stored width');
 assert.equal(layout.css(adapter,{...base,hideClutter:true}),'.upsell{display:none}');
 assert.equal(layout.css(adapter,{...base,focusMode:true}),'nav{display:none}');
 assert.equal(layout.css(adapter,{...base,chatWidth:'wide',compactSidebar:true,sidebarWidths:{site:260},hideClutter:true,focusMode:true}),'main{max-width:1040px}\nnav{width:260px}\n.upsell{display:none}\nnav{display:none}');
 assert.equal(layout.css(adapter,{...base,enabled:false,chatWidth:'full',focusMode:true}),'','disabled extension applies nothing');
 assert.equal(layout.css({layout:{width:'',compactSidebar:'',clutter:'',focus:''}},{...base,chatWidth:'wide',compactSidebar:true,hideClutter:true,focusMode:true}),'','empty adapter strings apply nothing');
 assert.equal(layout.css(null,{...base,chatWidth:'wide'}),'');
 assert.deepEqual({...layout.widths},{wide:'1040px',full:'calc(100% - 48px)'});
 assert.equal(layout.css({layout:{width:'a{width:{width}}b{max-width:{width}}'}},{...base,chatWidth:'wide'}),'a{width:1040px}b{max-width:1040px}','every placeholder is replaced');
});
test('real adapters keep the {width} and {sidebar} placeholders resolvable for the sites that define one',()=>{
 const {w,layout}=load();
 for(const id of Object.keys(w.ChatTidyReaderSites.sites)){const real=w.ChatTidyReaderSites.get(id),text=layout.css(real,{...base,chatWidth:'full',compactSidebar:true,sidebarWidths:{[id]:300}});assert.doesNotMatch(text,/\{width\}|\{sidebar\}/,id);assert.equal(!!real.layout.compactSidebar,!!real.layout.sidebar,id+': a width rule needs a sidebar to put the handle on');if(real.layout.compactSidebar)assert.match(text,/300px/,id);if(real.layout.width)assert.match(text,/calc\(100% - 48px\)/,id);}
});
test('one owned stylesheet follows the settings and disappears when nothing applies',()=>{
 const {d,layout}=load(),module=layout.create({t:k=>k,adapter});
 module.update(base);assert.equal(d.getElementById('cs-layout'),null);
 module.update({...base,chatWidth:'wide'});const style=d.getElementById('cs-layout');assert.ok(style);assert.equal(style.parentNode,d.head);assert.equal(style.dataset.csOwned,'true');assert.equal(style.textContent,'main{max-width:1040px}');
 module.update({...base,chatWidth:'wide',hideClutter:true});assert.equal(d.querySelectorAll('#cs-layout').length,1);assert.equal(d.getElementById('cs-layout'),style,'updated in place');assert.match(style.textContent,/\.upsell/);
 assert.equal(d.querySelector('.cs-focus-exit'),null,'no exit button outside focus mode');
 module.update({...base,chatWidth:'wide',hideClutter:true,enabled:false});assert.equal(d.getElementById('cs-layout'),null,'disabled removes everything');
 module.update({...base,chatWidth:'full'});assert.ok(d.getElementById('cs-layout'));module.update({...base});assert.equal(d.getElementById('cs-layout'),null);
});
test('focus mode shows a translated exit button that turns focus mode off in storage',()=>{
 const {w,d,writes,layout}=load(),module=layout.create({t:k=>k==='focusExit'?'Exit focus mode':k,adapter});
 module.update({...base,focusMode:true});
 const exit=d.querySelector('.cs-focus-exit');assert.ok(exit);assert.equal(exit.tagName,'BUTTON');assert.equal(exit.type,'button');assert.equal(exit.dataset.csOwned,'true');assert.equal(exit.textContent,'Exit focus mode');assert.equal(exit.parentNode,d.body);
 const sheet=d.getElementById('cs-layout').textContent;assert.match(sheet,/nav\{display:none\}/);assert.match(sheet,/\.cs-focus-exit\{position:fixed/);assert.match(sheet,/#6366f1/);
 assert.match(sheet,/prefers-color-scheme:dark/);assert.match(sheet,/:root\[data-cs-theme="light"\] \.cs-focus-exit\{--cs-color-0/);assert.match(sheet,/:root\[data-cs-theme="dark"\] \.cs-focus-exit\{--cs-color-0:#f2f2f2/);
 // Site shortcuts never see keys typed on our button; Escape stays with the site.
 let seen=[];d.body.addEventListener('keydown',e=>seen.push(e.key));exit.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));exit.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.deepEqual(seen,['Escape']);
 exit.click();assert.equal(JSON.stringify(writes),JSON.stringify([{focusMode:false}]));
 module.update({...base,focusMode:false});assert.equal(d.querySelector('.cs-focus-exit'),null);assert.equal(d.getElementById('cs-layout'),null);
 module.update({...base,focusMode:true,chatWidth:'wide'});assert.equal(d.querySelectorAll('.cs-focus-exit').length,1);module.update({...base,focusMode:false,chatWidth:'wide'});assert.equal(d.querySelector('.cs-focus-exit'),null);assert.doesNotMatch(d.getElementById('cs-layout').textContent,/cs-focus-exit/,'button styles leave with the button');
});
test('focus mode without site focus CSS shows no exit button',()=>{
 const {d,layout}=load(),module=layout.create({t:k=>k,adapter:{layout:{width:'main{max-width:{width}}',focus:''}}});
 module.update({...base,focusMode:true});assert.equal(d.querySelector('.cs-focus-exit'),null);assert.equal(d.getElementById('cs-layout'),null);
});
test('rebuilds after content.js cleanup removes owned nodes, and destroy removes everything for good',()=>{
 const {d,layout}=load(),module=layout.create({t:k=>k,adapter});const settings={...base,chatWidth:'full',focusMode:true};
 module.update(settings);assert.ok(d.getElementById('cs-layout'));
 d.querySelectorAll('[data-cs-owned]').forEach(node=>node.remove());assert.equal(d.getElementById('cs-layout'),null);
 module.update(settings);assert.equal(d.querySelectorAll('#cs-layout').length,1);assert.equal(d.querySelectorAll('.cs-focus-exit').length,1);assert.match(d.getElementById('cs-layout').textContent,/calc\(100% - 48px\)/);
 module.update(settings);assert.equal(d.querySelectorAll('[data-cs-owned]').length,2,'repeated updates never duplicate nodes');
 module.destroy();assert.equal(d.querySelectorAll('[data-cs-owned]').length,0);module.update(settings);assert.equal(d.querySelectorAll('[data-cs-owned]').length,0,'a destroyed module stays inert');
});
test('language changes retranslate the exit button',()=>{
 const {d,layout}=load();let lang='en';const module=layout.create({t:k=>lang+':'+k,adapter});
 module.update({...base,focusMode:true});assert.equal(d.querySelector('.cs-focus-exit').textContent,'en:focusExit');lang='fr';module.update({...base,focusMode:true});assert.equal(d.querySelector('.cs-focus-exit').textContent,'fr:focusExit');
});
