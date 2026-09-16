const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
test('Bots hide and collapse are scoped, reversible and survive replacement',()=>{
 const dom=new JSDOM('<aside><div data-sidebar="group" id="bots"><button aria-expanded="true" aria-label="Bots">Bots</button><ul><li>Bot</li></ul></div><div data-sidebar="group" id="chats">Chats</div></aside>',{url:'https://grok.com',runScripts:'outside-only'}),w=dom.window,d=w.document;
 try{if(fs.existsSync('src/bots.js'))w.eval(fs.readFileSync('src/bots.js','utf8'));assert.ok(w.ChatTidyBots,'Bots controller');const b=d.querySelector('button');b.onclick=()=>b.setAttribute('aria-expanded',String(b.getAttribute('aria-expanded')!=='true'));const ctl=w.ChatTidyBots.create();ctl.update({enabled:true,grokHideBots:true,grokCollapseBots:true});assert.ok(d.querySelector('#bots').classList.contains('cs-bots-hidden'));assert.equal(d.querySelector('#chats').className,'');ctl.update({enabled:true,grokHideBots:false,grokCollapseBots:true});assert.equal(b.getAttribute('aria-expanded'),'false');assert.equal(d.querySelector('#bots').classList.contains('cs-bots-hidden'),false);ctl.update({enabled:false});assert.equal(b.getAttribute('aria-expanded'),'true');assert.equal(d.querySelector('#bots').className,'');ctl.destroy();}finally{w.close();}
});
test('replacing the Bots button retains the original expanded state for cleanup',()=>{
 const dom=new JSDOM('<aside><div data-sidebar="group"><button aria-label="Bots" aria-expanded="true">Bots</button></div></aside>',{url:'https://grok.com',runScripts:'outside-only'}),w=dom.window,d=w.document;try{w.eval(fs.readFileSync('src/bots.js','utf8'));const wire=b=>b.onclick=()=>b.setAttribute('aria-expanded',String(b.getAttribute('aria-expanded')!=='true'));wire(d.querySelector('button'));const ctl=w.ChatTidyBots.create();ctl.update({grokCollapseBots:true});const replacement=d.querySelector('button').cloneNode(true);wire(replacement);d.querySelector('button').replaceWith(replacement);ctl.scan();ctl.destroy();assert.equal(replacement.getAttribute('aria-expanded'),'true');}finally{w.close();}
});
test('collapse is a default applied once per load and per setting change, not enforced against the user',()=>{
 const dom=new JSDOM('<aside><div data-sidebar="group"><button aria-label="Bots" aria-expanded="true">Bots</button><ul><li>Bot</li></ul></div></aside>',{url:'https://grok.com',runScripts:'outside-only'}),w=dom.window,d=w.document;
 try{w.eval(fs.readFileSync('src/bots.js','utf8'));const b=d.querySelector('button');let clicks=0;b.onclick=()=>{clicks++;b.setAttribute('aria-expanded',String(b.getAttribute('aria-expanded')!=='true'));};
 const ctl=w.ChatTidyBots.create();const prefs={enabled:true,grokHideBots:false,grokCollapseBots:true};
 ctl.update(prefs);assert.equal(b.getAttribute('aria-expanded'),'false','collapsed once after load');assert.equal(clicks,1);
 b.click();assert.equal(b.getAttribute('aria-expanded'),'true','the user expands it');
 ctl.scan();ctl.update(prefs);ctl.scan();assert.equal(b.getAttribute('aria-expanded'),'true','later scans and unchanged settings leave the user\'s choice alone');assert.equal(clicks,2);
 ctl.update({...prefs,grokCollapseBots:false});assert.equal(b.getAttribute('aria-expanded'),'true');assert.equal(clicks,2,'nothing to do when already expanded');
 ctl.update({...prefs,grokCollapseBots:true});assert.equal(b.getAttribute('aria-expanded'),'false','turning the preference on applies it again');assert.equal(clicks,3);
 ctl.update({...prefs,grokHideBots:true});ctl.update({...prefs,grokHideBots:false});assert.equal(b.getAttribute('aria-expanded'),'false');
 ctl.update({...prefs,enabled:false});assert.equal(b.getAttribute('aria-expanded'),'true','disabling restores the original state');
 ctl.update(prefs);assert.equal(b.getAttribute('aria-expanded'),'false','re-enabling applies the default again');
 ctl.destroy();}finally{w.close();}
});
