const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
globalThis.window=globalThis;require('../src/code.js');const {scan,isShell,commands,stripPrompt,FOLD_AT,FOLD_SHOW}=globalThis.ChatTidyCode;
const rules=(text,lang)=>scan(text,lang).map(f=>f.rule);
const on={enabled:true,codeTools:true,codeLineNumbers:true,codeFold:true,codeDanger:true,language:'en'};
const block=(text,lang='bash')=>`<pre><div class="wrap"><div class="head">${lang}<button class="native">Copy code</button></div><div class="scroll"><code class="language-${lang}">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</code></div></div></pre>`;
const answer=html=>`<div data-message-author-role="assistant"><div class="markdown">${html}</div></div>`;
async function setup(markup,css=''){
 const dom=new JSDOM(`<style>code{display:inline}${css}</style><main>${markup}</main><form><pre><code class="language-bash">rm -rf /</code></pre></form>`,{url:'https://chatgpt.com/c/1',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,copied=[];
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied.push(text);}}});
 for(const f of ['core','i18n','reader-sites','code'])w.eval(fs.readFileSync(`src/${f}.js`,'utf8'));
 const t=(key,vars)=>w.ChatTidyI18n.t('en',key,vars),mod=w.ChatTidyCode.create({t,site:{id:'chatgpt'},adapter:w.ChatTidyReaderSites.get('chatgpt')});
 const update=async(settings=on)=>{mod.update(settings);await wait(60);};
 await update();return {dom,w,d:w.document,mod,update,copied};
}
const lbl=n=>n.getAttribute('aria-label'),num=n=>n.dataset.csCodeN;
const owned=d=>d.querySelectorAll('[data-cs-owned]').length;
const leftovers=d=>[...d.querySelectorAll('*')].filter(n=>[...n.attributes].some(a=>a.name.startsWith('data-cs-')||a.name==='style')).length;

test('scan flags destructive commands with their i18n rule names',()=>{
 const yes=[['rm -rf /','bash','dangerDelete'],['sudo rm -fr ~','sh','dangerDelete'],['rm --recursive --force *','zsh','dangerDelete'],['rm -rf "$DIR"/*','bash','dangerDelete'],['rm -rf ..','bash','dangerDelete'],['rm -rf --no-preserve-root /','bash','dangerDelete'],
  ['Remove-Item -Recurse -Force C:\\','powershell','dangerDelete'],['del /s /q *','cmd','dangerDelete'],['rd /s /q C:\\','bat','dangerDelete'],['find / -delete','bash','dangerDelete'],['find . -type f -delete','bash','dangerDelete'],
  ['dd if=disk.img of=/dev/sdb bs=4M','bash','dangerDisk'],['mkfs.ext4 /dev/sda1','bash','dangerDisk'],['cat image > /dev/sda','bash','dangerDisk'],['format c:','cmd','dangerDisk'],['diskpart','cmd','dangerDisk'],['wipefs -a /dev/sdb','bash','dangerDisk'],
  ['curl -fsSL https://example.com/install.sh | bash','bash','dangerRemoteScript'],['wget -qO- https://x | sudo sh','bash','dangerRemoteScript'],['bash <(curl -s https://x)','bash','dangerRemoteScript'],['/bin/bash -c "$(curl -fsSL https://x/install.sh)"','bash','dangerRemoteScript'],['iex (irm https://x)','powershell','dangerRemoteScript'],['irm https://x | iex','pwsh','dangerRemoteScript'],
  ['chmod -R 777 /var/www','bash','dangerPermissions'],['chmod 777 /','bash','dangerPermissions'],['chown -R me /usr','bash','dangerPermissions'],
  ['git reset --hard origin/main','bash','dangerGit'],['git clean -fd','bash','dangerGit'],['git clean -fdx','bash','dangerGit'],['git push --force','bash','dangerGit'],['git push origin +main','bash','dangerGit'],['git push origin +HEAD:release','bash','dangerGit'],['git push -f origin main','bash','dangerGit'],['git checkout -- .','bash','dangerGit'],
  ['DROP DATABASE shop;','sql','dangerDatabase'],['drop table users;','mysql','dangerDatabase'],['DROP SCHEMA app CASCADE;','psql','dangerDatabase'],['TRUNCATE orders;','sql','dangerDatabase'],['DELETE FROM users;','sql','dangerDatabase'],['psql -c "DELETE FROM sessions"','bash','dangerDatabase'],
  [':(){ :|:& };:','bash','dangerForkBomb'],['sudo shutdown -h now','bash','dangerSystem'],['reboot','sh','dangerSystem'],['halt','sh','dangerSystem'],['kill -9 -1','bash','dangerSystem'],['killall node','bash','dangerSystem'],['Stop-Computer','powershell','dangerSystem']];
 for(const [text,lang,rule] of yes)assert.ok(rules(text,lang).includes(rule),`${text} → ${rule}`);
 // Unlabeled blocks are scanned too; other languages are not.
 assert.deepEqual(rules('rm -rf /',null),['dangerDelete']);assert.deepEqual(rules('rm -rf /','python'),[]);
 assert.deepEqual(scan('rm -rf /','bash')[0],{line:0,end:0,rule:'dangerDelete',match:'rm -rf /'});
});
test('scan stays quiet on everyday commands, comments and safe variants',()=>{
 const no=[['rm -rf ./build','bash'],['rm -rf node_modules dist','bash'],['rm -rf ~/.cache/pip','bash'],['rm -rf /tmp/build','bash'],['rm -rf $BUILD_DIR/out','bash'],['rm file.txt','bash'],['rm -f *.log','bash'],
  ['Remove-Item -Recurse -Force .\\node_modules','powershell'],['Remove-Item -Recurse -Force $folder','powershell'],['rd /s /q node_modules','cmd'],['find . -name "*.pyc" -delete','bash'],['find ~ -name .DS_Store -delete','bash'],
  ['dd if=/dev/zero of=/dev/null count=1','bash'],['dd if=/dev/zero of=disk.img bs=1M','bash'],['curl -fsSL https://x/key.gpg | sudo tee /etc/apt/keyrings/x.gpg','bash'],['curl -o install.sh https://x','bash'],
  ['chmod 777 script.sh','bash'],['chmod -R 755 ./public','bash'],['chown -R $USER:$USER ~/.npm','bash'],['git push --force-with-lease','bash'],['git push origin main','bash'],['git push -u origin feature','bash'],['git clean -n -d','bash'],['git reset --soft HEAD~1','bash'],['git checkout -- README.md','bash'],['git restore --staged .','bash'],
  ['echo "system halt"','bash'],['kill -1 1234','bash'],['truncate -s 0 app.log','bash'],['# rm -rf /','bash'],['echo done # rm -rf /','bash'],['cat <<EOF > note.txt\nrm -rf /\nEOF','bash'],
  ['-- DROP TABLE users;\nSELECT 1;','sql'],['/* DROP DATABASE x; */ SELECT 1;','sql'],["SELECT 'DROP TABLE x';",'sql'],['DELETE FROM users\nWHERE id = 1;','sql'],['SELECT * FROM users;','sql']];
 for(const [text,lang] of no)assert.deepEqual(rules(text,lang),[],text);
});
test('scan reports the starting line of a command and covers continued lines',()=>{
 const text='# clean up\nls\nrm -rf \\\n  /\necho ok\ngit push \\\n  --force';
 assert.deepEqual(scan(text,'bash').map(({line,end,rule})=>({line,end,rule})),[{line:2,end:3,rule:'dangerDelete'},{line:5,end:6,rule:'dangerGit'}]);
 assert.deepEqual(scan('SELECT 1;\n\nDROP TABLE a;\nDELETE FROM b\n  WHERE x = 1;\nDELETE FROM c;','sql').map(f=>[f.line,f.rule]),[[2,'dangerDatabase'],[5,'dangerDatabase']]);
 // Console transcripts: "# " is a root prompt there and output lines never match.
 assert.deepEqual(rules('# rm -rf /','console'),['dangerDelete']);
 // One prompted line does not turn the rest of a bash block into output; every line is scanned.
 assert.deepEqual(scan('$ export A=1\nrm -rf /','bash').map(f=>[f.line,f.rule]),[[1,'dangerDelete']]);
 // Heredocs fed to a shell are scripts; heredocs written to a file are data.
 assert.deepEqual(scan('bash <<EOF\necho hi\nrm -rf ~\nEOF','bash').map(f=>[f.line,f.rule]),[[2,'dangerDelete']]);
 assert.deepEqual(scan('cat <<EOF | sudo bash\ngit reset --hard\nEOF','bash').map(f=>[f.line,f.rule]),[[1,'dangerGit']]);
 assert.deepEqual(rules('ssh host <<EOF\nsudo reboot\nEOF','bash'),['dangerSystem']);assert.deepEqual(rules('cat <<EOF > a.txt\nrm -rf /\nEOF','bash'),[]);
});
test('prompts are stripped from copied commands',()=>{
 const cases=[['$ npm install','npm install'],['% brew install jq','brew install jq'],['(venv) $ pip install x','pip install x'],['user@host:~/app$ make','make'],['PS> Get-Process','Get-Process'],['PS C:\\Users\\me> dir','dir'],['C:\\Users\\me>dir','dir'],['> echo hi','echo hi'],['$HOME/bin/tool','$HOME/bin/tool']];
 for(const [line,want] of cases)assert.equal(stripPrompt(line,'bash'),want,line);
 assert.equal(stripPrompt('# apt update','bash'),'# apt update');assert.equal(stripPrompt('# apt update','console'),'apt update');assert.equal(stripPrompt('root@box:~# apt update','console'),'apt update');
});
test('commands join continuation lines and heredocs, skip comments and transcript output',()=>{
 assert.deepEqual(commands('# install\nnpm i\n\ndocker run \\\n  -p 80:80 \\\n  nginx\nls','bash').map(c=>[c.start,c.end,c.text]),[[1,1,'npm i'],[3,5,'docker run \\\n  -p 80:80 \\\n  nginx'],[6,6,'ls']]);
 assert.deepEqual(commands('$ npm install \\\n>   --save x\nadded 3 packages\n$ npm run dev','console').map(c=>[c.start,c.end,c.text]),[[0,1,'npm install \\\n  --save x'],[3,3,'npm run dev']]);
 // Transcript mode needs a console language or mostly prompted lines.
 assert.deepEqual(commands('$ export A=1\nrm -rf build','bash').map(c=>c.text),['export A=1','rm -rf build']);
 assert.deepEqual(commands('$ npm test\n$ npm run lint\nok','bash').map(c=>c.text),['npm test','npm run lint']);
 assert.deepEqual(commands('cat <<EOF > a.txt\nhello\nEOF\nls','bash').map(c=>[c.start,c.through,c.text]),[[0,2,'cat <<EOF > a.txt\nhello\nEOF'],[3,3,'ls']]);
 assert.deepEqual(commands('curl -fsSL https://x |\n  sh','bash').map(c=>c.text),['curl -fsSL https://x |\n  sh']);
 assert.deepEqual(commands('Get-ChildItem `\n  -Recurse\n# note','powershell').map(c=>c.text),['Get-ChildItem `\n  -Recurse']);
 assert.deepEqual(commands('REM setup\nset X=1 ^\n  && echo %X%','cmd').map(c=>c.text),['set X=1 ^\n  && echo %X%']);
});
test('isShell trusts shell languages and recognizes unlabeled command lists',()=>{
 for(const lang of ['bash','sh','shell','zsh','console','terminal','powershell','ps1','pwsh','cmd','bat','fish'])assert.equal(isShell(lang,'x'),true,lang);
 assert.equal(isShell(null,'npm install\nnpm run dev'),true);assert.equal(isShell('text','$ ls -la'),true);assert.equal(isShell(null,'sudo apt update\ngit status'),true);
 assert.equal(isShell(null,'const x = 1;\nconsole.log(x)'),false);assert.equal(isShell('python','ls'),false);assert.equal(isShell(null,'{"a": 1}'),false);
});
test('long answer blocks start folded at the threshold and the pill toggles them',async()=>{
 const many=n=>Array.from({length:n},(_,i)=>`echo ${i+1}`).join('\n');
 const {dom,d}=await setup(answer(block(many(FOLD_AT),'bash')+block(many(FOLD_AT+1),'bash')));try{
 const [short,long]=d.querySelectorAll('main pre');
 assert.equal(short.querySelector('[data-cs-code-fold]'),null);assert.equal(short.querySelector('.cs-code-fold').hidden,true);
 const scroller=long.querySelector('.scroll'),pill=long.querySelector('.cs-code-fold');
 assert.equal(scroller.getAttribute('data-cs-code-fold'),'folded');assert.equal(lbl(pill),`Show all ${FOLD_AT+1} lines`);assert.equal(pill.getAttribute('aria-expanded'),'false');
 assert.equal([...long.querySelectorAll('.cs-code-copy')].filter(b=>!b.hidden).length,FOLD_SHOW+1);
 pill.click();assert.equal(scroller.hasAttribute('data-cs-code-fold'),false);assert.equal(lbl(pill),'Fold');assert.ok(pill.hasAttribute('data-cs-code-quiet'));
 pill.click();assert.equal(scroller.getAttribute('data-cs-code-fold'),'folded');
 // The site's own header and copy button are untouched.
 assert.equal(long.querySelector('.head').childNodes.length,2);assert.equal(long.querySelector('.native').textContent,'Copy code');
 }finally{dom.window.close()}
});
test('gutter numbers every logical line and per-line copy writes the prompt-free command',async()=>{
 const {dom,d,w,copied}=await setup(answer(block('$ npm install \\\n>   --save left-pad\nadded 1 package\n$ npm test','console')+block('const a = 1;\nconst b = 2;','js')));try{
 const [shell,js]=d.querySelectorAll('main pre');
 assert.deepEqual([...shell.querySelectorAll('.cs-code-num')].map(num),['1','2','3','4']);
 assert.equal(shell.querySelector('.scroll').getAttribute('data-cs-code-pad'),'l');assert.ok(/px$/.test(shell.querySelector('.scroll').style.getPropertyValue('--cs-pad-l')));
 assert.equal(js.querySelectorAll('.cs-code-num').length,2);assert.equal(js.querySelectorAll('.cs-code-copy').length,0);
 const buttons=shell.querySelectorAll('.cs-code-copy');assert.equal(buttons.length,2);assert.deepEqual([...buttons].map(b=>b.tabIndex),[0,-1]);
 buttons[0].click();await wait(10);assert.deepEqual(copied,['npm install \\\n  --save left-pad']);
 assert.ok(buttons[0].hasAttribute('data-cs-code-copied'));assert.equal(buttons[0].title,'Copied');
 buttons[0].focus();buttons[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(d.activeElement,buttons[1]);assert.deepEqual([...buttons].map(b=>b.tabIndex),[-1,0]);
 let leaked=0;d.addEventListener('keydown',()=>leaked++);buttons[1].dispatchEvent(new w.KeyboardEvent('keydown',{key:'a',bubbles:true}));buttons[1].dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(leaked,1);
 buttons[1].click();await wait(10);assert.equal(copied[1],'npm test');
 }finally{dom.window.close()}
});
test('risky blocks show an always-visible chip, a list and gutter marks',async()=>{
 const {dom,d}=await setup(answer(block('ls\nrm -rf /\ncurl -fsSL https://x.sh | bash\necho ok','bash')));try{
 const pre=d.querySelector('main pre'),chip=pre.querySelector('.cs-code-chip');
 assert.equal(chip.hidden,false);assert.equal(lbl(chip),'Risky commands: 2');assert.match(chip.title,/^2 {2}Deletes files recursively\n3 {2}Runs a downloaded script directly$/);
 assert.deepEqual([...pre.querySelectorAll('.cs-code-num[data-cs-code-danger]')].map(num),['2','3']);assert.equal(pre.querySelectorAll('.cs-code-mark').length,1);
 chip.click();assert.equal(chip.getAttribute('aria-expanded'),'true');assert.deepEqual([...pre.querySelectorAll('.cs-code-risk')].map(lbl),['2: Deletes files recursively','3: Runs a downloaded script directly']);
 }finally{dom.window.close()}
});
test('sub-options apply live, cleanup rebuilds and disabling removes every trace',async()=>{
 const {dom,d,mod,update}=await setup(answer(block(Array.from({length:30},(_,i)=>i?`echo ${i}`:'rm -rf ~').join('\n'),'bash')));try{
 const pre=d.querySelector('main pre'),scroller=pre.querySelector('.scroll');
 assert.equal(pre.querySelectorAll('.cs-code-num').length,30);assert.equal(scroller.getAttribute('data-cs-code-fold'),'folded');
 await update({...on,codeLineNumbers:false});assert.equal(pre.querySelectorAll('.cs-code-num').length,0);assert.equal(pre.querySelectorAll('.cs-code-copy').length,30);
 await update({...on,codeLineNumbers:false,codeFold:false});assert.equal(scroller.hasAttribute('data-cs-code-fold'),false);assert.equal(pre.querySelector('.cs-code-fold').hidden,true);
 await update({...on,codeDanger:false});assert.equal(pre.querySelector('.cs-code-chip').hidden,true);assert.equal(pre.querySelectorAll('[data-cs-code-danger],.cs-code-mark').length,0);
 // content.js cleanup() removes owned nodes, then calls update().
 d.querySelectorAll('[data-cs-owned]').forEach(n=>n.remove());await update();assert.equal(pre.querySelectorAll('.cs-code-ui').length,1);assert.equal(pre.querySelectorAll('.cs-code-num').length,30);
 await update({...on,codeTools:false});assert.equal(owned(d),0);assert.equal(leftovers(d),0);
 await update();assert.equal(pre.querySelectorAll('.cs-code-ui').length,1);
 await update({...on,enabled:false});assert.equal(owned(d),0);assert.equal(leftovers(d),0);
 await update();mod.destroy();mod.destroy();assert.equal(owned(d),0);assert.equal(leftovers(d),0);
 await update();assert.equal(owned(d),0);
 }finally{dom.window.close()}
});
test('only answer blocks are processed and streaming updates re-measure without folding the open block',async()=>{
 const {dom,d}=await setup(`<div data-message-author-role="user"><div class="whitespace-pre-wrap">${block('rm -rf /','bash')}</div></div>`+answer(block('echo 1','bash')));try{
 assert.equal(d.querySelector('[data-message-author-role="user"] pre').hasAttribute('data-cs-code'),false);assert.equal(d.querySelector('form pre').hasAttribute('data-cs-code'),false);
 const pre=d.querySelector('[data-message-author-role="assistant"] pre'),code=pre.querySelector('code');assert.ok(pre.hasAttribute('data-cs-code'));
 for(let i=2;i<=FOLD_AT+6;i++)code.append(d.createTextNode(`\necho ${i}`));await wait(260);
 assert.equal(pre.querySelectorAll('.cs-code-num').length,FOLD_AT+6);assert.equal(pre.querySelector('.scroll').hasAttribute('data-cs-code-fold'),false);assert.equal(lbl(pre.querySelector('.cs-code-fold')),'Fold');
 const span=d.createElement('span');span.textContent='\nrm -rf /\necho done';code.append(span);await wait(260);
 assert.equal(lbl(pre.querySelector('.cs-code-chip')),'Risky commands: 1');assert.equal(pre.querySelectorAll('.cs-code-num').length,FOLD_AT+8);
 // A rerender that replaces the block drops the old record and adopts the new one.
 pre.outerHTML=block('ls','bash');await wait(260);assert.equal(d.querySelectorAll('[data-message-author-role="assistant"] .cs-code-ui').length,1);assert.equal(num(d.querySelector('[data-message-author-role="assistant"] .cs-code-num')),'1');
 }finally{dom.window.close()}
});
test('wired through content.js: sidebar syncs leave the code chrome alone, settings apply live, disabling removes it',async()=>{
 const dom=new JSDOM(`<!doctype html><body><nav><h2>聊天</h2><div id="history"><div class="row"><a href="/c/${'2'.repeat(8)}-2222-4222-8222-${'2'.repeat(12)}"><span>Chat 2</span></a></div></div></nav><main>${answer(block('ls\nrm -rf /','bash'))}</main></body>`,{url:'https://chatgpt.com/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document;
 w.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{width:100,height:20}]};
 const store={language:'en'},listeners=[];
 w.chrome={runtime:{id:'test',onMessage:{addListener(){}}},storage:{onChanged:{addListener:fn=>listeners.push(fn)},local:{get:async defaults=>({...defaults,...store}),
  set:async values=>{const changes={};for(const [k,v] of Object.entries(values)){changes[k]={newValue:v};store[k]=v;}for(const fn of listeners)fn(changes,'local');}}}};
 w.ChatTidyBatch={run:async job=>({completed:job.ids}),cancel(){}};
 try{
  for(const f of ['core','i18n','reader-sites','code','content'])w.eval(fs.readFileSync(`src/${f}.js`,'utf8'));
  await wait(200);
  const chip=()=>d.querySelector('main .cs-code-chip');
  assert.equal(lbl(chip()),'Risky commands: 1');assert.equal(d.querySelectorAll('main .cs-code-num').length,2);
  d.querySelector('.cs-checkbox').click();await wait(150);
  assert.match(d.querySelector('.cs-toolbar .cs-count').textContent,/1/);assert.equal(lbl(chip()),'Risky commands: 1','the sidebar sync never writes into the code chrome');
  await w.chrome.storage.local.set({codeLineNumbers:false});await wait(80);assert.equal(d.querySelectorAll('main .cs-code-num').length,0);
  await w.chrome.storage.local.set({language:'fr'});await wait(120);assert.equal(lbl(chip()),w.ChatTidyI18n.t('fr','dangerCount',{n:1}));
  await w.chrome.storage.local.set({enabled:false});await wait(120);assert.equal(d.querySelectorAll('main [data-cs-owned],main [data-cs-code],main [data-cs-code-pad]').length,0);
  await w.chrome.storage.local.set({enabled:true});await wait(150);assert.equal(lbl(chip()),w.ChatTidyI18n.t('fr','dangerCount',{n:1}));
 }finally{dom.window.close();}
});
test('overlay goes last into the scroller parent on live structures, re-positions nothing and adds no text',async()=>{
 const chatgpt=`<div data-code-block="true"><div data-markdown-copy="exclude"><span class="truncate">bash</span><div data-code-block-controls><button>Copy</button></div></div><div class="viewer"><div class="chatgpt-code-scrollport overflow-x-auto"><pre class="whitespace-pre min-w-max"><code>echo 1\ngit push -f</code></pre></div></div></div>`;
 const kimi=`<div class="segment-code"><header class="segment-code-header"><span class="segment-code-lang">bash</span><button class="icon-button">Copy</button></header><div class="segment-code-content"><pre class="language-bash"><code>ls\nrm -rf /</code></pre></div></div>`;
 const gemini=`<code-block><div class="animated-opacity"><div class="code-block-decoration header-formatted"><span>bash</span><button>Copy</button></div><pre><code data-test-id="code-content" class="language-bash">echo 1\nreboot</code></pre></div></code-block>`;
 const css='.chatgpt-code-scrollport{overflow-x:auto}pre.language-bash{overflow-x:auto}[data-test-id=code-content]{display:block;overflow-x:auto}';
 const {dom,d}=await setup(answer(chatgpt+kimi+gemini),css);try{
  const firsts=['[data-code-block]','.viewer','.segment-code','.segment-code-content','.animated-opacity','code-block pre'].map(s=>d.querySelector(s).firstElementChild);
  assert.deepEqual(firsts.map(n=>n.className||n.tagName),['DIV','chatgpt-code-scrollport overflow-x-auto','segment-code-header','language-bash','code-block-decoration header-formatted','language-bash']);
  // Hosts: ChatGPT's scrollport wraps pre, Kimi's pre scrolls itself, Gemini's code scrolls inside pre.
  assert.deepEqual(['.viewer','.segment-code-content','code-block pre'].map(s=>d.querySelector(s).lastElementChild.className),['cs-code-anchor','cs-code-anchor','cs-code-anchor']);
  assert.equal(d.querySelectorAll('.cs-code-anchor').length,3);
  assert.equal(d.querySelector('.chatgpt-code-scrollport').getAttribute('data-cs-code-pad'),null);assert.equal(d.querySelector('[data-code-block] pre').getAttribute('data-cs-code-pad'),'l');
  // No site element gets a position or inline style other than our custom properties.
  for(const el of d.querySelectorAll('main *:not([data-cs-owned]):not([data-cs-owned] *)')){const style=el.getAttribute('style');if(style)assert.match(style,/^(?:\s*--cs-[\w-]+:[^;]+;?)+$/,el.className);}
  // Labels and numbers live in attributes drawn by CSS, so page text stays exactly the code and the site chrome.
  for(const anchor of d.querySelectorAll('.cs-code-anchor'))assert.equal(anchor.textContent,'');
  assert.equal(d.querySelector('code-block pre').textContent,'echo 1\nreboot');
  assert.deepEqual([...d.querySelectorAll('.cs-code-chip')].map(lbl),['Risky commands: 1','Risky commands: 1','Risky commands: 1']);
 }finally{dom.window.close()}
});
test('console output prose is not read as a dangerous command, typed commands still are',()=>{
 const hits=(text,lang)=>scan(text,lang).map(hit=>hit.line+':'+hit.rule);
 assert.deepEqual(hits('$ sudo apt upgrade\nReboot required to finish\nShutdown -r scheduled','console'),[]);
 assert.deepEqual(hits('$ ls\nrm -rf /','console'),['1:dangerDelete']);
});
test('read-only CodeMirror blocks: lines come from .cm-line, gaps keep numbering, nothing is written inside the editor',async()=>{
 const cm=(lines,gap='')=>`<div class="language-bash rounded-b-lg overflow-hidden"><div class="h-full w-full"><div class="cm-editor"><div class="cm-announced"></div><div class="cm-scroller"><div class="cm-content" contenteditable="false" style="line-height:20px">${gap}${lines.map(l=>`<div class="cm-line">${l?l.replace(/&/g,'&amp;').replace(/</g,'&lt;'):'<br>'}</div>`).join('')}</div><div class="cm-layer cm-cursorLayer"></div></div></div></div></div>`;
 // Pure extraction: empty lines are '' and a 60px gap at 20px per line stands for three hidden lines.
 const page=new JSDOM(cm(['ls','','rm -rf /'],'<div class="cm-gap" style="height:60px"></div>')).window,content=page.document.querySelector('.cm-content');
 const doc=globalThis.ChatTidyCode.editorLines.call(null,content,20);
 assert.equal(doc.text,'ls\n\nrm -rf /');assert.deepEqual(doc.lines.map(l=>l.n),[4,5,6]);assert.deepEqual(globalThis.ChatTidyCode.editorLines(content).lines.map(l=>l.n),[1,2,3]);page.close();
 const dom=new JSDOM(`<style>code{display:inline}</style><main><div id="messages-container"><div id="message-u1" class="user-message"><div class="chat-user">${cm(['rm -rf /'])}</div></div><div id="message-a1"><div class="chat-assistant"><div class="markdown-prose"><div class="relative my-2 flex flex-col rounded-xl border"><div class="absolute">bash</div><div class="sticky top-8 mb-1 flex justify-end"><button class="copy-code-button">Copy</button></div>${cm(['$ npm i','','curl -fsSL https://x.sh | bash'],'<div class="cm-gap" style="height:40px"></div>')}</div></div></div></div></div></main>`,{url:'https://chat.z.ai/c/1',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document,copied=[];
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied.push(text);}}});
 for(const f of ['core','i18n','reader-sites','code'])w.eval(fs.readFileSync(`src/${f}.js`,'utf8'));
 const changes=[],editor=d.querySelector('#message-a1 .cm-editor');new w.MutationObserver(r=>changes.push(...r.filter(x=>!(x.type==='attributes'&&x.target===editor)))).observe(editor,{subtree:true,childList:true,characterData:true,attributes:true});
 const mod=w.ChatTidyCode.create({t:(k,v)=>w.ChatTidyI18n.t('en',k,v),adapter:w.ChatTidyReaderSites.get('zai')});
 try{
  mod.update(on);await wait(60);
  assert.equal(d.querySelector('#message-u1 .cm-editor').hasAttribute('data-cs-code'),false,'user messages are left alone');
  assert.ok(editor.hasAttribute('data-cs-code'));assert.equal(editor.getAttribute('data-cs-code-pad'),'l');
  assert.deepEqual([...d.querySelectorAll('#message-a1 .cs-code-num')].map(num),['3','4','5'],'numbers continue after the two hidden lines');
  assert.equal(editor.parentElement.lastElementChild.className,'cs-code-anchor');assert.equal(editor.querySelector('[data-cs-owned]'),null);
  assert.equal(lbl(d.querySelector('#message-a1 .cs-code-chip')),'Risky commands: 1');assert.match(d.querySelector('#message-a1 .cs-code-chip').title,/^5 /);
  d.querySelector('#message-a1 .cs-code-copy').click();await wait(10);assert.deepEqual(copied,['npm i']);
  assert.deepEqual(changes,[],'CodeMirror DOM untouched');
  // CodeMirror re-renders its lines: the block follows without folding (editors are never folded from outside).
  const content=editor.querySelector('.cm-content');content.replaceChildren(...Array.from({length:30},(_,i)=>{const line=d.createElement('div');line.className='cm-line';line.textContent=i===7?'git push -f':`echo ${i}`;return line;}));await wait(260);
  assert.equal(d.querySelectorAll('#message-a1 .cs-code-num').length,30);assert.equal(d.querySelector('#message-a1 .cs-code-fold').hidden,true);assert.match(d.querySelector('#message-a1 .cs-code-chip').title,/^8 /);
  mod.update({...on,codeTools:false});await wait(30);assert.equal(owned(d),0);assert.equal([...d.querySelectorAll("*")].filter(n=>[...n.attributes].some(a=>a.name.startsWith("data-cs-"))).length,0);assert.equal(editor.getAttribute("style"),null);
 }finally{mod.destroy();dom.window.close()}
});
test('Monaco lines are ordered and numbered by their top offset, with no-break spaces normalized',()=>{
 const line=(top,text)=>`<div class="view-line" style="top:${top}px;height:20px;line-height:20px"><span><span class="mtk1">${text.replace(/ /g,' ')}</span></span></div>`;
 // Recycled nodes in any DOM order; a virtualized document only renders lines 11-13 (tops 200-240).
 const page=new JSDOM(`<div class="view-lines">${line(240,'echo   three')}${line(200,'sudo rm -rf /')}${line(220,'')}</div><div class="other">${line(20,'b')}${line(0,'a')}</div>`).window,d=page.document;
 const doc=globalThis.ChatTidyCode.monacoLines(d.querySelector('.view-lines'));
 assert.deepEqual(doc.lines.map(l=>l.n),[11,12,13]);assert.equal(doc.text,'sudo rm -rf /\n\necho   three');assert.ok(!doc.text.includes(' '));
 assert.deepEqual(doc.lines.map(l=>l.el.style.top),['200px','220px','240px']);
 assert.deepEqual(globalThis.ChatTidyCode.monacoLines(d.querySelector('.other')).lines.map(l=>[l.n,l.el.textContent]),[[1,'a'],[2,'b']]);
 assert.deepEqual(scan(doc.text,'bash').map(f=>f.line),[0],'scan indices map back through lines[i].n');
 page.close();
});
