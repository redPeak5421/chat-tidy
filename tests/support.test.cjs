const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
test('support cards open official pages only on click in independent windows',async()=>{
 const dom=new JSDOM(fs.readFileSync('popup.html','utf8'),{url:'https://extension.test/',runScripts:'outside-only'}),w=dom.window,calls=[];
 try{
 w.chrome={storage:{local:{get:async d=>d,set:async()=>{}}},windows:{create:async args=>{calls.push(args)}}};
 w.eval(fs.readFileSync('src/i18n.js','utf8'));w.eval(fs.readFileSync('src/popup.js','utf8'));await new Promise(r=>setTimeout(r,0));
 assert.equal(calls.length,0);
 for(const key of ['kofi','afdian']){w.document.querySelector(`[data-support="${key}"]`).click();await new Promise(r=>setTimeout(r,0));}
 assert.deepEqual(calls.map(c=>c.url),['https://ko-fi.com/U2C326XLKJ','https://afdian.com/a/redPeak5421']);
 assert.ok(calls.every(c=>c.type==='popup'&&c.focused&&c.width>0&&c.height>0));
 w.chrome.windows.create=async()=>{throw Error('Unavailable')};w.document.querySelector('[data-support]').click();await new Promise(r=>setTimeout(r,0));assert.ok(w.document.querySelector('#saved').textContent);assert.equal(w.document.querySelector('[data-support]').dataset.opening,undefined);
 }finally{w.close()}
});
