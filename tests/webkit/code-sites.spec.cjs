const {test,expect}=require('@playwright/test');
// Code tools on code-block structures recorded from the live sites (2026-11-01): element tree, scrollers, header rows and
// fonts are copied from the real pages; the code text is a fixture.
const id='11111111-1111-4111-8111-111111111111';
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const shikiLines=lines=>lines.map(line=>`<span class="line"><span style="color:#9cdcfe">${esc(line)}</span></span>`).join('\n');
// Grok (grok.com, Shiki): [data-testid=code-block] > bordered box > 40px header (language span, native collapse + copy)
// then div.shiki (relative, overflow auto) > pre.shiki (overflow auto, 16px padding, 13.5px/20.25px, white-space pre) > code > span.line.
const grokLines=['sudo apt update','sudo apt install -y ffmpeg sox','arecord -D plughw:1,0 -f cd -d 10 out.wav','sox out.wav loud.wav silence 1 0.1 1%','sudo rm -rf /'];
const grok=`<div data-testid="assistant-message"><div class="response-content-markdown"><p>Record and trim:</p>
<div data-testid="code-block" style="position:relative;margin:12px 0"><div style="border:1px solid rgba(252,252,252,.06);border-radius:12px">
<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px 8px 16px;border-radius:12px 12px 0 0;background:#181716;height:40px;box-sizing:border-box"><span>Bash</span><div style="display:flex;height:32px"><button class="native" style="padding:0 10px;border-radius:12px">收起</button><button class="native" aria-label="复制 Bash 代码" style="padding:0 10px;border-radius:12px">复制</button></div></div>
<div class="shiki" style="position:relative;overflow:auto;background:#181716;border-radius:0 0 12px 12px"><pre class="shiki slack-dark" style="margin:0;overflow:auto;padding:16px;white-space:pre;font:13.5px/20.25px ui-monospace,Menlo,monospace;background:#181716;border-radius:0 0 8px 8px"><code>${shikiLines(grokLines)}</code></pre></div>
</div></div></div></div>`;
// Qwen (chat.qwen.ai, dark): pre.qwen-markdown-code is not the scroller and holds the sticky header itself; the code body
// div (overflow-x auto, 16px padding, -16px top margin) scrolls; code is a 14px/20px block with plain text.
const qwenLines=['pip install -U "huggingface_hub[cli]"','huggingface-cli download Qwen/Qwen3-8B --local-dir ./qwen3','curl -fsSL https://ollama.com/install.sh | sh','ollama run qwen3:8b'];
const qwen=`<div class="qwen-chat-message-assistant"><div class="chat-response-message" id="chat-response-message-a1"><div class="response-message-content phase-answer"><div class="qwen-markdown"><p>Download and run:</p>`+
`<pre class="qwen-markdown-code" style="display:block;margin:16px 0;font:16px/28px system-ui;white-space:pre"><div class="qwen-markdown-code-header-wrapper" style="position:sticky;top:-40px;z-index:10;padding-top:16px;margin-bottom:16px;background:rgb(35,35,38);height:52px;box-sizing:border-box"><div class="qwen-markdown-code-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-radius:12px 12px 0 0;background:rgba(250,251,255,.05);height:36px;box-sizing:border-box;font:14px/20px system-ui;white-space:normal"><div>bash</div><div class="qwen-markdown-code-header-actions" style="display:flex;gap:12px"><div class="qwen-markdown-code-header-action-item native" role="button">Copy</div><div class="qwen-markdown-code-header-action-item native" role="button">Download</div></div></div></div>`+
`<div class="qwen-markdown-code-body qwen-markdown-code-body-streaming bash" style="overflow-x:auto;padding:16px;margin:-16px 0 0;background:rgb(34,34,34);border-radius:0 0 12px 12px;white-space:pre"><code style="display:block;white-space:pre;font:14px/20px ui-monospace,Menlo,monospace">${esc(qwenLines.join('\n'))}</code></div></pre></div></div></div></div>`;
// Claude (claude.ai, light): div.relative.group/copy (bg, .5px border, 12px radius) > [zero-width sticky float holding the
// copy button, language caption (p-3.5), div.overflow-x-auto (the scroller) > pre.code-block__code (14px padding,
// 14px/22.75px) > code.language-x (inline, highlight spans, some spanning newlines)].
const claudeCode=`<span style="color:#a0a1a7;font-style:italic"># create the env\n</span><span style="color:#4078f2">python3</span> -m venv .venv\n<span style="color:#4078f2">source</span> .venv/bin/activate\n<span style="color:#4078f2">git</span> reset --hard origin/main\n<span style="color:#4078f2">pip</span> install -r requirements.txt`;
const claude=`<div data-testid="assistant-message"><div class="standard-markdown"><p>Set up the project:</p>`+
`<div class="relative group/copy" style="position:relative;background:#f5f4ed;border:.5px solid rgba(31,30,29,.15);border-radius:12px;margin:8px 0"><div class="sticky opacity-0 group-hover/copy:opacity-100" style="position:sticky;top:8px;float:right;width:0;height:48px;padding:8px 0;box-sizing:border-box"><div style="position:absolute;right:8px;top:8px"><button class="native" aria-label="Copy to clipboard" style="font:12px system-ui;padding:4px 8px;border-radius:6px;border:1px solid #ddd;background:#fff">Copy</button></div></div>`+
`<div class="text-secondary text-caption-regular font-sans p-3.5" style="padding:14px 14px 0;font:12px/16px system-ui;color:#73726c">bash</div><div class="overflow-x-auto" style="overflow-x:auto"><pre class="code-block__code" style="margin:0;padding:14px;font:14px/22.75px ui-monospace,Menlo,monospace;white-space:pre;border-radius:12px;background:transparent"><code class="language-bash" style="white-space:pre">${claudeCode}</code></pre></div></div></div></div>`;
// Z.ai (chat.z.ai, light): a read-only CodeMirror 6 editor, no pre. Language label and sticky copy row precede
// div.language-x > div.h-full > div.cm-editor > [div.cm-announced, div.cm-scroller (overflow auto, 14px/19.6px) >
// [div.cm-content (contenteditable=false, 4px 0 padding) > div.cm-line*, cursor and selection layers]].
const zaiLines=['npm create vite@latest my-app','cd my-app','','chmod -R 777 /var/www','npm run dev'];
const cmLines=lines=>lines.map(line=>`<div class="cm-line" style="padding:0 2px 0 6px">${line?esc(line):'<br>'}</div>`).join('');
const zai=`<div id="message-a1"><div class="chat-assistant"><div class="markdown-prose"><p>Scaffold it:</p>`+
`<div class="relative my-2 flex flex-col rounded-xl border" style="position:relative;margin:8px 0;display:flex;flex-direction:column;border-radius:12px;border:1px solid #e6e6e6;padding:8px;background:#f7f7f7"><div class="absolute pl-2 py-1 text-xs" style="position:absolute;padding:4px 0 4px 8px;font:12px/16px system-ui">bash</div><div class="sticky top-8 mb-1 flex justify-end" style="position:sticky;top:32px;margin-bottom:4px;display:flex;justify-content:flex-end;z-index:1"><button class="copy-code-button native" style="font:12px system-ui;padding:2px 8px;border-radius:6px;border:0;background:#ececec">Copy</button></div>`+
`<div class="language-bash rounded-b-lg overflow-hidden" style="border-radius:0 0 8px 8px;overflow:hidden"><div class="h-full w-full" style="height:100%;width:100%"><div class="cm-editor ͼ1 ͼ2" style="display:flex;flex-direction:column;position:relative;box-sizing:border-box"><div class="cm-announced" aria-live="polite" style="position:fixed;top:-10000px"></div><div class="cm-scroller" style="display:flex;align-items:flex-start;position:relative;overflow:auto;font:14px/19.6px ui-monospace,Menlo,monospace;height:100%"><div class="cm-content" contenteditable="false" role="textbox" aria-readonly="true" style="padding:4px 0;white-space:pre;flex-grow:2;flex-shrink:0;display:block;box-sizing:border-box;min-height:100%;outline:none">${cmLines(zaiLines)}</div><div class="cm-layer cm-layer-above cm-cursorLayer" aria-hidden="true" style="position:absolute;contain:size style;z-index:150"></div><div class="cm-layer cm-selectionLayer" aria-hidden="true" style="position:absolute;contain:size style;z-index:-1"></div></div></div></div></div></div></div></div></div>`;
const sites={
 grok:{origin:'https://grok.com',path:`/c/${id}`,dark:true,root:'[data-testid="code-block"]',lineSel:'span.line',body:`<main><div data-testid="drop-ui" style="max-width:704px;margin:0 auto;padding:24px 0 400px"><div id="response-u1" class="items-end"><div data-testid="user-message"><div class="response-content-markdown"><p>How do I record?</p></div></div></div><div id="response-a1">${grok}</div></div></main>`,lines:grokLines.length,lang:'bash',danger:'Risky commands: 1',copy:'sudo apt update'},
 qwen:{origin:'https://chat.qwen.ai',path:`/c/${id}`,dark:true,root:'pre.qwen-markdown-code',body:`<main><div id="chat-message-container" style="max-width:760px;margin:0 auto;padding:24px 16px 400px"><div class="qwen-chat-message-user"><div class="user-message-content">How do I run Qwen locally?</div></div>${qwen}</div></main>`,lines:qwenLines.length,lang:'bash',danger:'Risky commands: 1',copy:'pip install -U "huggingface_hub[cli]"'},
 claude:{origin:'https://claude.ai',path:`/chat/${id}`,root:'.group\\/copy',body:`<main><div data-testid="chat-column-body" style="max-width:740px;margin:0 auto;padding:24px 16px 400px"><div data-testid="user-message"><p>Set up the project</p></div>${claude}</div></main>`,lines:5,lang:'bash',danger:'Risky commands: 1',copy:'python3 -m venv .venv',firstLine:1},
 zai:{origin:'https://chat.z.ai',path:`/c/${id}`,root:'.rounded-xl.border',lineSel:'.cm-line',editor:true,body:`<main><div id="messages-container" style="max-width:808px;margin:0 auto;padding:24px 16px 400px"><div id="message-u1" class="user-message"><div class="chat-user"><p>Make a Vite app</p></div></div>${zai}</div></main>`,lines:zaiLines.length,lang:'bash',danger:'Risky commands: 1',copy:'npm create vite@latest my-app'}
};
async function load(pg,context,site){
 const s=sites[site];
 await context.route(`${s.origin}/**`,route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>body{margin:0;background:${s.dark?'#131211':'#fff'};color:${s.dark?'#fcfcfc':'#1f1e1d'};font:15px/1.5 system-ui}</style>${s.body}`}));
 await pg.goto(s.origin+s.path);
 await pg.evaluate(()=>{globalThis.copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{copied.push(t);}}});
  // Records every change inside CodeMirror editors: CodeMirror owns that DOM and repairs foreign edits.
  globalThis.cmChanges=[];for(const editor of document.querySelectorAll('.cm-editor'))new MutationObserver(r=>cmChanges.push(...r.map(x=>({type:x.type,attr:x.attributeName,self:x.target===editor})))).observe(editor,{subtree:true,childList:true,characterData:true,attributes:true});});
 for(const f of ['core','i18n','reader-sites','code'])await pg.addScriptTag({path:`src/${f}.js`});
 await pg.addStyleTag({path:'src/code.css'});
 await pg.evaluate(site=>{globalThis.mod=ChatTidyCode.create({t:(k,v)=>ChatTidyI18n.t('en',k,v),site:{id:site},adapter:ChatTidyReaderSites.get(site)});mod.update({...ChatTidyCore.settings,language:'en'});},site);
 return s;
}
// Vertical centre of each logical line's first glyph, and of the gutter number drawn for it.
const centres=(pg,s)=>pg.evaluate(({marker,lineSel})=>{
 const block=document.querySelector(marker),code=block.matches('.cm-editor')?block.querySelector('.cm-content'):block.querySelector('code');
 let host=block;while(host&&!host.querySelector('.cs-code-ui'))host=host.parentElement;
 const nums=[...host.querySelectorAll('.cs-code-num')].map(n=>{const r=n.getBoundingClientRect();return {n:n.dataset.csCodeN,c:r.top+r.height/2};});
 const glyph=(node,offset)=>{const r=document.createRange();r.setStart(node,offset);r.setEnd(node,offset+1);const box=[...r.getClientRects()].find(x=>x.height);return box&&box.top+box.height/2;};
 let lines;
 if(lineSel)lines=[...block.querySelectorAll(lineSel)].map(el=>{const t=document.createTreeWalker(el,NodeFilter.SHOW_TEXT).nextNode();if(t)return glyph(t,0);const r=el.getBoundingClientRect();return r.top+r.height/2;});
 else{const w=document.createTreeWalker(code,NodeFilter.SHOW_TEXT),nodes=[];let pos=0;for(let n;(n=w.nextNode());){nodes.push([n,pos]);pos+=n.data.length;}
  const text=code.textContent,starts=[0];for(let i=0;i<text.length;i++)if(text[i]==='\n'&&i+1<text.length)starts.push(i+1);
  lines=starts.map(o=>{const [n,p]=nodes.find(([n,p])=>p<=o&&o<p+n.data.length);return glyph(n,o-p);});}
 return {lines,nums};
},{marker:s.editor?'.cm-editor[data-cs-code]':'pre[data-cs-code]',lineSel:s.lineSel||null});
for(const site of Object.keys(sites))test(`code tools on the live ${site} code-block structure`,async({page:pg,context})=>{
 const s=await load(pg,context,site);
 await expect(pg.locator(s.editor?'.cm-editor[data-cs-code]':'pre[data-cs-code]')).toHaveCount(1);
 expect(await pg.evaluate(site=>ChatTidyReaderSites.get(site).codeBlocks().map(b=>b.lang),site)).toEqual([s.lang]);
 // One gutter number per line, vertically centred on its line (the gutter is built on the next frame).
 await expect(pg.locator('.cs-code-num')).toHaveCount(s.lines);
 const {lines,nums}=await centres(pg,s);
 expect(lines.length).toBe(s.lines);for(const [i,c] of lines.entries()){expect(nums[i].n).toBe(String(i+1));expect(Math.abs(nums[i].c-c)).toBeLessThanOrEqual(3);}
 // The native header buttons stay on top and clickable.
 for(const button of await pg.locator('.native').all()){const box=await button.boundingBox();expect(await pg.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('.native'),[box.x+box.width/2,box.y+box.height/2])).toBe(true);}
 await expect(pg.locator('.cs-code-chip')).toHaveCount(1);await expect(pg.locator('.cs-code-chip')).toHaveAttribute('aria-label',s.danger);
 expect(await pg.evaluate(()=>CSS.highlights.get('cs-danger').size)).toBe(1);
 // Per-line copy of the first command: hover its line, click the gutter button.
 const target=lines[s.firstLine||0],codeBox=await pg.locator(s.editor?'.cm-content':`${s.root} code`).boundingBox();
 await pg.mouse.move(codeBox.x+codeBox.width/2,target);
 const copy=pg.locator('.cs-code-copy[data-cs-code-hover]');await expect(copy).toHaveCount(1);await expect(copy).toHaveCSS('opacity','1');
 // Nothing inside a CodeMirror editor changed: only our attributes on .cm-editor itself (checked before Playwright's
 // screenshot, which writes caret-color into editable content).
 if(s.editor)expect(await pg.evaluate(()=>cmChanges.filter(c=>!(c.type==='attributes'&&c.self)))).toEqual([]);
 await pg.locator(s.root).screenshot({path:`artifacts/worker-code/site-${site}.png`});
 await copy.click();expect(await pg.evaluate(()=>copied)).toEqual([s.copy]);
 // Our labels never leak into the page text the site copies or reads.
 expect(await pg.locator(s.root).evaluate(n=>/Risky|Show all|Copy this line/.test(n.innerText))).toBe(false);
 if(s.editor){
  expect(await pg.locator('.cm-editor [data-cs-owned]').count()).toBe(0);
  expect(await pg.locator('.cm-editor').evaluate(n=>n.parentElement.lastElementChild.className)).toBe('cs-code-anchor');
  expect(await pg.locator('.cm-content').evaluate(n=>getComputedStyle(n).paddingLeft)).not.toBe('0px');
  // A CodeMirror-style re-render replaces the line elements; the gutter, scan and copy follow.
  await pg.evaluate(()=>{const content=document.querySelector('.cm-content');const lines=['git status','git reset --hard','git log'].map(t=>{const d=document.createElement('div');d.className='cm-line';d.style.padding='0 2px 0 6px';d.textContent=t;return d;});content.replaceChildren(...lines);});
  await expect(pg.locator('.cs-code-num')).toHaveCount(3);
  await expect(pg.locator('.cs-code-chip')).toHaveAttribute('aria-label','Risky commands: 1');
  await expect(pg.locator('.cs-code-num[data-cs-code-danger]')).toHaveAttribute('data-cs-code-n','2');
  const again=await centres(pg,s);for(const [i,c] of again.lines.entries())expect(Math.abs(again.nums[i].c-c)).toBeLessThanOrEqual(3);
 }
 // Turning the tools off restores the site DOM.
 await pg.evaluate(()=>mod.update({...ChatTidyCore.settings,codeTools:false}));
 await expect(pg.locator('[data-cs-owned]')).toHaveCount(0);
 expect(await pg.evaluate(()=>[...document.querySelectorAll('main *')].filter(n=>[...n.attributes].some(a=>a.name.startsWith('data-cs-'))).length)).toBe(0);
});
// Qwen chat page (logged in, dark, measured 2026-11-01): the code body holds a read-only Monaco editor instead of code.
// .monaco-editor > .overflow-guard > [edit context, read-only textarea, .margin (37px, line numbers), scrollable element
// (left 37px) > .lines-content > .view-lines > .view-line (absolute, top N*20px, 14px/20px, spaces as no-break spaces)].
const monacoText=['pip install -U "huggingface_hub[cli]"','huggingface-cli download Qwen/Qwen3-8B --local-dir ./qwen3','curl -fsSL https://ollama.com/install.sh | sh','ollama run qwen3:8b'];
const nb=s=>esc(s).replace(/ /g,' ');
const viewLine=(text,i)=>`<div class="view-line" style="top:${i*20}px;height:20px;line-height:20px;position:absolute;width:100%"><span><span class="mtk1">${nb(text)}</span></span></div>`;
const monaco=lines=>`<pre class="qwen-markdown-code" style="display:block;margin:16px 0;font:16px/28px system-ui;white-space:pre"><div class="qwen-markdown-code-header-wrapper" style="position:sticky;top:-40px;z-index:10;padding-top:16px;margin-bottom:16px;background:rgb(35,35,38);height:52px;box-sizing:border-box"><div class="qwen-markdown-code-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-radius:12px 12px 0 0;background:rgba(250,251,255,.05);height:36px;box-sizing:border-box;font:14px/20px system-ui;white-space:normal"><div>bash</div><div class="qwen-markdown-code-header-actions" style="display:flex;gap:12px"><div class="qwen-markdown-code-header-action-item native" role="button">Copy</div><div class="qwen-markdown-code-header-action-item native" role="button">Download</div></div></div></div>`+
 `<div class="qwen-markdown-code-body bash" style="display:block;overflow:visible;padding:16px;margin:-16px 0 0;font:16px/28px system-ui;background:rgb(34,34,34);border-radius:0 0 12px 12px;white-space:normal"><div class="qwen-markdown-code-editor-viewport" style="position:relative;height:${lines.length*20+14}px"><section style="display:flex;position:relative"><div style="width:100%"><div class="monaco-editor no-user-select mac vs-dark" style="position:relative;width:100%;height:${lines.length*20}px;background:rgb(34,34,34)"><div class="overflow-guard" style="position:relative;overflow:hidden;width:100%;height:100%">`+
 `<div class="native-edit-context" style="position:absolute;top:0;left:0;width:1px;height:1px"></div><textarea class="ime-text-area" readonly aria-label="Editor content" style="position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;resize:none"></textarea>`+
 `<div class="margin" style="position:absolute;left:0;top:0;width:37px;height:100%"><div class="margin-view-overlays">${lines.map((_,i)=>`<div style="position:absolute;top:${i*20}px;width:100%;height:20px"><div class="line-numbers" style="position:absolute;left:0;width:25px;text-align:right;font:14px/20px ui-monospace,Menlo,monospace;color:#6e7681">${i+1}</div></div>`).join('')}</div></div>`+
 `<div class="monaco-scrollable-element editor-scrollable vs-dark mac" style="position:absolute;left:37px;top:0;width:calc(100% - 37px);height:100%;overflow:hidden"><div class="lines-content" style="position:absolute;top:0;left:0;width:1200px;height:100%"><div class="view-lines monaco-mouse-cursor-text" style="position:absolute;width:1200px;height:100%;font:14px/20px ui-monospace,Menlo,monospace;color:#d4d4d4;white-space:nowrap">${lines.map(viewLine).join('')}</div></div><div class="scrollbar vertical" style="position:absolute;right:0;top:0;width:14px;height:100%"></div></div>`+
 `</div></div></div></section></div></div></pre>`;
test('code tools on the logged-in Qwen chat page: read-only Monaco editor',async({page:pg,context})=>{
 await context.route('https://chat.qwen.ai/**',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>body{margin:0;background:#131211;color:#fcfcfc;font:15px/1.5 system-ui}</style><main><div id="chat-message-container" style="max-width:760px;margin:0 auto;padding:24px 16px 400px"><div class="qwen-chat-message-user"><div class="user-message-content">How do I run Qwen locally?</div></div><div class="qwen-chat-message-assistant"><div class="chat-response-message" id="chat-response-message-a1"><div class="response-message-content phase-answer"><div class="qwen-markdown"><p>Download and run:</p>${monaco(monacoText)}</div></div></div></div></div></main>`}));
 await pg.goto(`https://chat.qwen.ai/c/${id}`);
 await pg.evaluate(()=>{globalThis.copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{copied.push(t);}}});
  globalThis.monacoChanges=[];new MutationObserver(r=>monacoChanges.push(...r.map(x=>x.type+':'+(x.attributeName||'')))).observe(document.querySelector('.monaco-editor'),{subtree:true,childList:true,characterData:true,attributes:true});});
 for(const f of ['core','i18n','reader-sites','code'])await pg.addScriptTag({path:`src/${f}.js`});
 await pg.addStyleTag({path:'src/code.css'});
 await pg.evaluate(()=>{globalThis.mod=ChatTidyCode.create({t:(k,v)=>ChatTidyI18n.t('en',k,v),site:{id:'qwen'},adapter:ChatTidyReaderSites.get('qwen')});mod.update({...ChatTidyCore.settings,language:'en'});});
 expect(await pg.evaluate(()=>ChatTidyReaderSites.get('qwen').codeBlocks().map(b=>[b.editor,b.lang,b.numbered]))).toEqual([['monaco','bash',true]]);
 const chip=pg.locator('.cs-code-chip');await expect(chip).toHaveAttribute('aria-label','Risky commands: 1');
 // Monaco draws its own numbers: no gutter of ours, nothing written into Monaco, the marker sits on the site's pre.
 await expect(pg.locator('.cs-code-num')).toHaveCount(0);
 expect(await pg.locator('.monaco-editor [data-cs-owned]').count()).toBe(0);
 expect(await pg.evaluate(()=>monacoChanges)).toEqual([]);
 await expect(pg.locator('pre.qwen-markdown-code')).toHaveAttribute('data-cs-code','');
 expect(await pg.locator('.qwen-markdown-code-body').evaluate(n=>n.lastElementChild.className)).toBe('cs-code-anchor');
 const lineBox=i=>pg.evaluate(i=>{const el=[...document.querySelectorAll('.view-line')].find(n=>parseFloat(n.style.top)===i*20),r=el.querySelector('.mtk1').getBoundingClientRect();return {x:r.x,y:r.y+r.height/2,right:r.right};},i);
 // Danger: chip title names line 3, the highlight covers line 3's text and the mark sits on line 3, left of the editor.
 expect(await chip.getAttribute('title')).toMatch(/^3 /);
 const highlighted=()=>pg.evaluate(()=>[...CSS.highlights.get('cs-danger')].map(r=>r.toString().replace(/ /g,' ')));
 expect(await highlighted()).toEqual([monacoText[2]]);
 const editor=await pg.locator('.monaco-editor').boundingBox(),mark=await pg.locator('.cs-code-mark').boundingBox(),third=await lineBox(2);
 expect(Math.abs(mark.y+mark.height/2-third.y)).toBeLessThanOrEqual(3);expect(mark.x+mark.width).toBeLessThanOrEqual(editor.x);
 // Per-line copy: hovering a line lights a button beside the editor (never over Monaco's text) and copies spaces, not nbsp.
 const first=await lineBox(0);await pg.mouse.move(first.x+20,first.y);
 const copy=pg.locator('.cs-code-copy[data-cs-code-hover]');await expect(copy).toHaveCount(1);await expect(copy).toHaveCSS('opacity','1');
 const button=await copy.boundingBox();expect(Math.abs(button.y+button.height/2-first.y)).toBeLessThanOrEqual(3);expect(button.x+button.width).toBeLessThanOrEqual(editor.x+0.5);expect(button.x).toBeGreaterThanOrEqual(editor.x-16.5);
 for(const native of await pg.locator('.native').all()){const box=await native.boundingBox();expect(await pg.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('.native'),[box.x+box.width/2,box.y+box.height/2])).toBe(true);}
 await pg.locator('pre.qwen-markdown-code').screenshot({path:'artifacts/worker-code/site-qwen-monaco.png'});
 await copy.click();expect(await pg.evaluate(()=>copied)).toEqual([monacoText[0]]);
 expect(await pg.locator('pre.qwen-markdown-code').evaluate(n=>/Risky|Copy this line/.test(n.innerText))).toBe(false);
 // Monaco recycles nodes: reverse the DOM order and swap two nodes' contents with their tops; numbering follows top offsets.
 await pg.evaluate(()=>{const view=document.querySelector('.view-lines'),lines=[...view.children];view.replaceChildren(...lines.reverse());const [a,b]=[lines.find(n=>n.style.top==='0px'),lines.find(n=>n.style.top==='40px')];a.style.top='40px';b.style.top='0px';});
 await expect.poll(()=>chip.getAttribute('title')).toMatch(/^1 /);
 expect(await highlighted()).toEqual([monacoText[2]]);
 const second=await lineBox(1);await pg.mouse.move(second.x+20,second.y);await expect(pg.locator('.cs-code-copy[data-cs-code-hover]')).toHaveCount(1);
 await pg.locator('.cs-code-copy[data-cs-code-hover]').click();expect(await pg.evaluate(()=>copied.at(-1))).toBe(monacoText[1]);
 // Disabling leaves no trace.
 await pg.evaluate(()=>mod.update({...ChatTidyCore.settings,codeTools:false}));
 await expect(pg.locator('[data-cs-owned]')).toHaveCount(0);
 expect(await pg.evaluate(()=>[...document.querySelectorAll('main *')].filter(n=>[...n.attributes].some(a=>a.name.startsWith('data-cs-'))).length)).toBe(0);
 expect(await pg.evaluate(()=>CSS.highlights.has('cs-danger'))).toBe(false);
});
