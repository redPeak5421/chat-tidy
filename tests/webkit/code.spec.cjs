const {test,expect}=require('@playwright/test');
const shots='artifacts/worker-code';
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
// Highlighted spans deliberately hold several lines each, the way highlight.js and Prism emit comments and strings.
const bash=`<span class="c"># Install the toolchain\n</span><span class="k">npm</span> install \\\n  --save-dev typescript\n\n<span class="k">curl</span> -fsSL https://example.com/install.sh | bash\n<span class="k">sudo</span> rm -rf /\n<span class="k">echo</span> <span class="s">"a long line that keeps going far past the right edge of the block so that the scroller has to scroll sideways to show the rest"</span>\ngit status`;
const long=Array.from({length:40},(_,i)=>`<span class="k">echo</span> step ${i+1}`).join('\n');
const wrap=['A wrapped line: '+'lorem ipsum dolor sit amet '.repeat(8),'short','Second wrapped: '+'consectetur adipiscing elit '.repeat(7),'end'].join('\n');
const chatgpt=(lang,html,space="whitespace-pre!")=>`<pre class="overflow-visible!"><div class="wrap"><div class="head"><span>${lang}</span><button class="native-copy">Copy code</button></div><div class="scroll overflow-y-auto p-4" dir="ltr"><code class="${space} language-${lang}">${html}</code></div></div></pre>`;
const page=scheme=>{
 const dark=scheme==='dark',fg=dark?'#ececec':'#0d0d0d',bg=dark?'#212121':'#fff',code=dark?'#181818':'#f9f9f9',muted=dark?'#afafaf':'#5d5d5d';
 return `<meta charset="utf-8"><style>
 body{margin:0;background:${bg};color:${fg};font:16px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif}main{max-width:680px;margin:0 auto;padding:24px 16px 400px}
 pre{margin:16px 0}.wrap{position:relative;border-radius:16px;background:${code};overflow:hidden;contain:inline-size}
 .head{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;height:36px;padding:0 8px 0 16px;font:500 12px system-ui;color:${muted}}
 .native-copy{font:inherit;color:inherit;background:none;border:0;border-radius:6px;padding:4px 8px;cursor:pointer}
 .scroll{overflow-y:auto;padding:4px 16px 16px}code{font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:${fg}}.whitespace-pre\\!{white-space:pre!important}
 .k{color:${dark?'#7cacf8':'#1a5fb4'}}.s{color:${dark?'#a5d6a7':'#2e7d32'}}.c{color:${muted};font-style:italic}
 .claude{position:relative}.claude pre{overflow-x:auto;background:${code};border-radius:12px;padding:16px;margin:0}.claude .tools{position:absolute;top:8px;right:8px}.claude button{font:12px system-ui;border:1px solid ${muted}55;background:${bg};color:${fg};border-radius:6px;padding:3px 8px}
 .pw code{white-space:pre-wrap}
 </style><main><div data-message-author-role="user"><div class="whitespace-pre-wrap">${chatgpt('bash','rm -rf /')}</div></div>
 <div data-message-author-role="assistant" data-message-id="a1"><div class="markdown"><p>Set it up:</p>${chatgpt('bash',bash)}<p>Long script:</p>${chatgpt('bash',long)}
 <div class="claude" id="claude"><pre><code class="language-sql">${esc('SELECT * FROM users;\n-- DROP TABLE users;\nDELETE FROM sessions;\nDELETE FROM users\n  WHERE id = 1;')}</code></pre><div class="tools"><button class="native-copy">Copy</button></div></div>
 <div class="pw">${chatgpt("text",esc(wrap),"")}</div></div></div></main>`;
};
async function load(pg,context,scheme){
 await pg.emulateMedia({colorScheme:scheme});
 await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:page(scheme)}));
 await pg.goto('https://chatgpt.com/c/11111111-1111-4111-8111-111111111111');
 for(const f of ['core','i18n','reader-sites','code'])await pg.addScriptTag({path:`src/${f}.js`});
 await pg.addStyleTag({path:'src/code.css'});
 await pg.evaluate(()=>{
  globalThis.copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied.push(text);}}});
  globalThis.settings={enabled:true,codeTools:true,codeLineNumbers:true,codeFold:true,codeDanger:true,language:'en'};
  globalThis.mod=ChatTidyCode.create({t:(k,v)=>ChatTidyI18n.t('en',k,v),site:{id:'chatgpt'},adapter:ChatTidyReaderSites.get('chatgpt')});mod.update(settings);
 });
 await expect(pg.locator('[data-message-author-role="assistant"] .cs-code-ui')).toHaveCount(4);
 await expect(pg.locator('.cs-code-chip').first()).toBeVisible();
}
const blocks=pg=>pg.locator('[data-message-author-role="assistant"] pre');
// Distance between each gutter number's vertical center and the center of its logical line's first visual line.
const alignment=(pg,index)=>blocks(pg).nth(index).evaluate(pre=>{
 const code=pre.querySelector('code'),text=code.textContent,host=(()=>{let h=pre;while(h&&!h.querySelector('.cs-code-ui'))h=h.parentElement;return h;})(),nums=[...host.querySelectorAll('.cs-code-num')];
 const walker=document.createTreeWalker(code,NodeFilter.SHOW_TEXT),nodes=[];let pos=0;for(let n;(n=walker.nextNode());){nodes.push([n,pos]);pos+=n.data.length;}
 const at=o=>{for(let i=nodes.length-1;i>=0;i--)if(nodes[i][1]<=o&&o<nodes[i][1]+nodes[i][0].data.length)return [nodes[i][0],o-nodes[i][1]];};
 const starts=[0];for(let i=0;i<text.length;i++)if(text[i]==='\n'&&i+1<text.length)starts.push(i+1);
 return starts.map((s,i)=>{const [n,o]=at(s),r=document.createRange();r.setStart(n,o);r.setEnd(n,o+1);const line=[...r.getClientRects()].find(x=>x.height),num=nums[i].getBoundingClientRect();return {i,delta:Math.abs((line.top+line.height/2)-(num.top+num.height/2)),text:nums[i].dataset.csCodeN};});
});

for(const scheme of ['light','dark'])test(`code tools on a ChatGPT-like answer (${scheme})`,async({page:pg,context})=>{
 await load(pg,context,scheme);
 await expect(pg.locator('[data-message-author-role="user"] pre[data-cs-code]')).toHaveCount(0);
 const first=blocks(pg).nth(0),wrapper=first.locator('.wrap');
 // Gutter: one number per logical line, centered on it, also when lines wrap and in Claude-like pre scrollers.
 for(const index of [0,2,3]){const rows=await alignment(pg,index);expect(rows.length).toBeGreaterThan(3);for(const row of rows){expect(row.text).toBe(String(row.i+1));expect(row.delta).toBeLessThanOrEqual(3);}}
 const wrapped=await alignment(pg,3);expect(wrapped.length).toBe(4);
 const gaps=await blocks(pg).nth(3).evaluate(pre=>[...pre.querySelectorAll('.cs-code-num')].map(n=>n.getBoundingClientRect().top));expect(gaps[1]-gaps[0]).toBeGreaterThan(40);
 // The gutter stays put while the code scrolls sideways, and the code starts right of it.
 const before=await first.locator('.cs-code-num').first().boundingBox();
 await first.locator('.scroll').evaluate(n=>{n.scrollLeft=240;});await pg.waitForTimeout(50);
 expect((await first.locator('.cs-code-num').first().boundingBox()).x).toBe(before.x);
 await first.locator('.scroll').evaluate(n=>{n.scrollLeft=0;});
 const gutter=await first.locator('.cs-code-gutter').boundingBox(),glyph=await first.locator('code').evaluate(c=>{const r=document.createRange();r.setStart(c.firstChild.firstChild,0);r.setEnd(c.firstChild.firstChild,1);return r.getBoundingClientRect().left;});
 expect(glyph).toBeGreaterThanOrEqual(gutter.x+gutter.width);
 // The native header and copy button are neither covered nor moved.
 for(const button of await pg.locator('.native-copy').all()){if(!await button.isVisible())continue;const hit=await button.evaluate(b=>{const r=b.getBoundingClientRect();if(r.bottom>innerHeight)return "offscreen";const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return top===b||top?.className+" in "+b.closest("pre,.claude").className;});expect(hit).not.toBe(false);if(hit!=="offscreen")expect(hit).toBe(true);}
 expect(await first.locator('.head').evaluate(h=>h.children.length)).toBe(2);
 // Danger: the chip counts commands, lines are tinted with CSS.highlights, and the list opens inside reserved space.
 const chip=first.locator('.cs-code-chip');await expect(chip).toHaveAttribute('aria-label','Risky commands: 2');expect(await chip.evaluate(n=>n.textContent)).toBe('');
 expect(await pg.evaluate(()=>CSS.highlights.get('cs-danger').size)).toBe(3);
 expect(await first.locator('.cs-code-num[data-cs-code-danger]').evaluateAll(n=>n.map(x=>x.dataset.csCodeN))).toEqual(['5','6']);
 expect(await first.locator('.scroll').getAttribute('data-cs-code-pad')).toBe('l b');
 const lastLine=await first.locator('code').evaluate(c=>{const r=document.createRange();r.selectNodeContents(c);const rects=[...r.getClientRects()];return Math.max(...rects.map(x=>x.bottom));});
 expect((await chip.boundingBox()).y).toBeGreaterThanOrEqual(lastLine);
 await chip.click();expect(await first.locator('.cs-code-risk').evaluateAll(n=>n.map(x=>x.getAttribute('aria-label')))).toEqual(['5: Runs a downloaded script directly','6: Deletes files recursively']);
 await wrapper.screenshot({path:`${shots}/danger-list-${scheme}.png`});
 // Per-line copy: hovering a continued line reveals its command's button; the copy strips nothing it should keep.
 const lineBox=await first.locator('code').evaluate(c=>{const r=document.createRange(),t=c.childNodes[2];r.setStart(t,t.data.indexOf('--save'));r.setEnd(t,t.data.indexOf('--save')+1);const b=r.getBoundingClientRect();return {x:b.x+40,y:b.y+b.height/2};});
 await pg.mouse.move(lineBox.x,lineBox.y);
 const button=first.locator('.cs-code-copy').nth(0);await expect(button).toHaveAttribute('data-cs-code-hover','');await expect(button).toHaveCSS('opacity','1');
 await wrapper.screenshot({path:`${shots}/copy-hover-${scheme}.png`});
 await button.click();expect(await pg.evaluate(()=>copied)).toEqual(['npm install \\\n  --save-dev typescript']);
 await expect(button).toHaveAttribute('data-cs-code-copied','');await wrapper.screenshot({path:`${shots}/copied-${scheme}.png`});
 await first.locator('.cs-code-copy').nth(2).click();expect(await pg.evaluate(()=>copied.at(-1))).toBe('sudo rm -rf /');
 await expect(button).not.toHaveAttribute('data-cs-code-copied','',{timeout:3000});
 // Fold: the 40-line block starts folded with a centered pill, expands and folds again.
 const folded=blocks(pg).nth(1),scroller=folded.locator('.scroll'),pill=folded.locator('.cs-code-fold');
 await expect(pill).toHaveAttribute('aria-label','Show all 40 lines');
 const short=await scroller.evaluate(n=>n.getBoundingClientRect().height);expect(short).toBeLessThan(12*23.4+40);expect(short).toBeGreaterThan(12*22);
 const pillBox=await pill.boundingBox(),blockBox=await scroller.boundingBox();expect(Math.abs(pillBox.x+pillBox.width/2-(blockBox.x+blockBox.width/2))).toBeLessThan(2);
 await folded.locator('.wrap').screenshot({path:`${shots}/folded-${scheme}.png`});
 await pill.click();await expect(pill).toHaveAttribute('aria-label','Fold');
 expect(await scroller.evaluate(n=>n.getBoundingClientRect().height)).toBeGreaterThan(40*22);
 await expect(folded.locator('.cs-code-num')).toHaveCount(40);
 await folded.locator('.wrap').hover();await expect(pill).toHaveCSS('opacity','1');
 await folded.locator('.wrap').screenshot({path:`${shots}/expanded-${scheme}.png`});
 await pill.click();await expect(pill).toHaveAttribute('aria-label','Show all 40 lines');
 // Claude-like pre scroller with an SQL block: only real statements are flagged; comments and WHERE deletes are not.
 const claude=pg.locator('#claude');await expect(claude.locator('.cs-code-chip')).toHaveAttribute('aria-label','Risky commands: 1');
 // Site rules such as ".prose button" must not restyle the chrome.
 await expect(claude.locator('.cs-code-chip')).toHaveCSS('color',scheme==='dark'?'rgb(245, 184, 61)':'rgb(180, 83, 9)');
 expect(await claude.locator('.cs-code-num[data-cs-code-danger]').evaluateAll(n=>n.map(x=>x.dataset.csCodeN))).toEqual(['3']);
 await claude.screenshot({path:`${shots}/claude-sql-${scheme}.png`});
 await pg.screenshot({path:`${shots}/page-${scheme}.png`,fullPage:true});
});

test('streaming growth, React-style rerenders, live settings and disable',async({page:pg,context})=>{
 await load(pg,context,'light');
 const first=blocks(pg).nth(0),code=first.locator('code');
 await code.evaluate(c=>{for(let i=0;i<30;i++)c.append(document.createTextNode(`\necho streamed ${i}`));});
 await expect(first.locator('.cs-code-num')).toHaveCount(38);
 await expect(first.locator('.scroll')).not.toHaveAttribute('data-cs-code-fold','folded');
 const rows=await alignment(pg,0);for(const row of rows)expect(row.delta).toBeLessThanOrEqual(3);
 // A rerender that removes our nodes is repaired on the next tick.
 await pg.evaluate(()=>document.querySelectorAll('[data-cs-owned]').forEach(n=>n.remove()));
 await pg.evaluate(()=>mod.update(settings));await expect(pg.locator('[data-message-author-role="assistant"] .cs-code-ui')).toHaveCount(3);
 // Blocks far outside the viewport are measured only once they come near it.
 await blocks(pg).nth(3).scrollIntoViewIfNeeded();await expect(pg.locator('[data-message-author-role="assistant"] .cs-code-ui')).toHaveCount(4);
 await pg.evaluate(()=>mod.update({...settings,codeLineNumbers:false}));await expect(pg.locator('.cs-code-num')).toHaveCount(0);
 await expect(first.locator('.cs-code-copy')).not.toHaveCount(0);
 await pg.evaluate(()=>mod.update({...settings,codeDanger:false}));await expect(pg.locator('.cs-code-chip:visible')).toHaveCount(0);
 expect(await pg.evaluate(()=>CSS.highlights.get('cs-danger')?.size||0)).toBe(0);
 await pg.evaluate(()=>mod.update({...settings,codeTools:false}));
 await expect(pg.locator('[data-cs-owned]')).toHaveCount(0);
 expect(await pg.evaluate(()=>[...document.querySelectorAll('main *')].filter(n=>[...n.attributes].some(a=>a.name.startsWith('data-cs-'))||n.getAttribute('style')).length)).toBe(0);
 expect(await pg.evaluate(()=>CSS.highlights.has('cs-danger'))).toBe(false);
 await pg.evaluate(()=>{mod.destroy();mod.destroy();});
});

// Live ChatGPT app shell (2026-11 survey): the scrollport around pre is the horizontal scroller and the action bar sticks.
const appShell=scheme=>{
 const dark=scheme==='dark',fg=dark?'#ececec':'#0d0d0d',bg=dark?'#212121':'#fff',code=dark?'#181818':'#f9f9f9',muted=dark?'#afafaf':'#5d5d5d';
 const lines=Array.from({length:60},(_,i)=>i===2?'<span class="k">git</span> push origin +main':i===5?'<span class="c"># a long comment that runs well past the right edge of the block so the scrollport scrolls sideways for a while\n</span>'.slice(0,-8)+'</span>':`<span class="k">echo</span> step ${i+1}`).join('\n');
 return `<meta charset="utf-8"><style>body{margin:0;background:${bg};color:${fg};font:16px/1.6 system-ui}main{max-width:680px;margin:0 auto;padding:24px 16px 1200px}
 [data-code-block]{position:relative;border-radius:16px;background:${code};overflow:clip}.bar{position:sticky;top:0;z-index:auto;display:flex;align-items:center;justify-content:space-between;height:36px;padding:0 8px 0 16px;background:${code};font:500 12px system-ui;color:${muted}}
 [data-code-block-controls] button{font:inherit;color:inherit;background:none;border:0;padding:4px 8px}.viewer>div:first-child{margin:0}
 .chatgpt-code-scrollport{overflow-x:auto}pre.min-w-max{min-width:max-content;margin:0;padding:4px 16px 16px;white-space:pre}code{font:12px/20px ui-monospace,SFMono-Regular,Menlo,monospace;color:${fg}}
 .k{color:${dark?'#7cacf8':'#1a5fb4'}}.c{color:${muted}}
 .segment-code{border-radius:12px;background:${code};margin-top:24px}.segment-code>:first-child{color:#c00}.segment-code-header{position:sticky;top:0;display:flex;justify-content:space-between;padding:6px 12px;background:${code};font:12px system-ui}
 .segment-code-content pre{overflow-x:auto;margin:0;padding:12px}.segment-code-content code{white-space:pre-wrap;font:14px/21px ui-monospace,monospace}
 </style><main><div data-message-author-role="assistant" data-message-id="a1"><div class="markdown">
 <div data-code-block="true"><div data-markdown-copy="exclude" class="bar"><span class="truncate">bash</span><div data-code-block-controls><button class="native-copy">Copy</button></div></div><div class="viewer"><div class="chatgpt-code-scrollport overflow-x-auto"><pre class="whitespace-pre min-w-max"><code>${lines}</code></pre></div></div></div>
 <div class="segment-code"><header class="segment-code-header"><span class="segment-code-lang">bash</span><button class="icon-button">Copy</button></header><div class="segment-code-content"><pre class="language-bash"><code class="language-bash">curl -fsSL https://x.sh | bash\nls</code></pre></div></div>
 </div></div></main>`;
};
for(const scheme of ['light','dark'])test(`ChatGPT app shell and Kimi structures (${scheme})`,async({page:pg,context})=>{
 await pg.emulateMedia({colorScheme:scheme});
 await context.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:appShell(scheme)}));
 await pg.goto('https://chatgpt.com/c/11111111-1111-4111-8111-111111111111');
 for(const f of ['core','i18n','reader-sites','code'])await pg.addScriptTag({path:`src/${f}.js`});
 await pg.addStyleTag({path:'src/code.css'});
 await pg.evaluate(()=>{globalThis.mod=ChatTidyCode.create({t:(k,v)=>ChatTidyI18n.t('en',k,v),site:{id:'chatgpt'},adapter:ChatTidyReaderSites.get('chatgpt')});mod.update({enabled:true,codeTools:true,codeLineNumbers:true,codeFold:true,codeDanger:true});});
 await expect(pg.locator('.cs-code-anchor')).toHaveCount(2);
 // Site children keep their order: the header stays the first child and keeps its :first-child styling.
 expect(await pg.locator('.segment-code').evaluate(n=>[n.firstElementChild.tagName,getComputedStyle(n.firstElementChild).color])).toEqual(['HEADER','rgb(204, 0, 0)']);
 expect(await pg.locator('.viewer').evaluate(n=>[n.firstElementChild.className,n.lastElementChild.className])).toEqual(['chatgpt-code-scrollport overflow-x-auto','cs-code-anchor']);
 expect(await pg.locator('.segment-code-content').evaluate(n=>[n.firstElementChild.tagName,n.lastElementChild.className])).toEqual(['PRE','cs-code-anchor']);
 expect(await pg.evaluate(()=>[...document.querySelectorAll('main *')].filter(n=>!n.closest('[data-cs-owned]')&&getComputedStyle(n).position==='relative').map(n=>n.className))).toEqual(['']);
 const shell=pg.locator('[data-code-block]'),port=shell.locator('.chatgpt-code-scrollport');
 await expect(shell.locator('.cs-code-chip')).toHaveAttribute('aria-label','Risky commands: 1');
 // Folded at 12 lines of 20px; the gutter numbers sit on their lines.
 expect(await port.getAttribute('data-cs-code-fold')).toBe('folded');
 const rows=await alignment(pg,0);for(const row of rows.slice(0,12))expect(row.delta).toBeLessThanOrEqual(3);
 await shell.locator('.cs-code-fold').click();
 // The gutter stays put while the scrollport scrolls sideways.
 const before=await shell.locator('.cs-code-num').nth(5).boundingBox();
 await port.evaluate(n=>{n.scrollLeft=300;});await pg.waitForTimeout(60);
 expect(await port.evaluate(n=>n.scrollLeft)).toBeGreaterThan(100);
 expect((await shell.locator('.cs-code-num').nth(5).boundingBox()).x).toBe(before.x);
 await shell.screenshot({path:`${shots}/app-shell-scrolled-${scheme}.png`});
 await port.evaluate(n=>{n.scrollLeft=0;});
 // Scrolled into the block, the sticky action bar stays on top of the gutter: the overlay is trimmed below it.
 await pg.evaluate(()=>{const r=document.querySelector('[data-code-block]').getBoundingClientRect();scrollTo(0,scrollY+r.top+400);});
 await expect.poll(()=>pg.evaluate(()=>{const bar=document.querySelector('.bar').getBoundingClientRect(),label=document.querySelector('.truncate').getBoundingClientRect();return bar.top===0&&document.elementFromPoint(label.x+4,label.y+label.height/2)?.closest('.bar')!==null&&getComputedStyle(document.querySelector('[data-code-block] .cs-code-ui')).clipPath.startsWith('inset(4');})).toBe(true);
 const bar=await pg.locator('.bar').boundingBox();
 const gutterNumbersUnderBar=await shell.locator('.cs-code-num').evaluateAll((nums,bottom)=>nums.filter(n=>{const r=n.getBoundingClientRect();return r.top<bottom-2&&r.bottom>0;}).length,bar.y+bar.height);
 expect(gutterNumbersUnderBar).toBeGreaterThan(0);
 await pg.screenshot({path:`${shots}/app-shell-sticky-${scheme}.png`,clip:{x:0,y:0,width:1100,height:260}});
 // Kimi: pre is the scroller, the header sticks, and nothing in the page text comes from the overlay.
 const kimi=pg.locator('.segment-code');await kimi.scrollIntoViewIfNeeded();
 await expect(kimi.locator('.cs-code-chip')).toHaveAttribute('aria-label','Risky commands: 1');
 expect(await pg.locator('.markdown').evaluate(n=>n.innerText.includes('Risky')||/\b1\n2\n/.test(n.innerText))).toBe(false);
 await kimi.screenshot({path:`${shots}/kimi-${scheme}.png`});
});
