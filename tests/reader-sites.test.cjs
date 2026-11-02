const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
// Fixtures follow the chat-area structure recorded live on 2026-11-01 (message wrappers, IDs, bodies, code headers).
function load(markup){
 const dom=new JSDOM(`<!doctype html><body>${markup}</body>`,{url:'https://example.test/',runScripts:'outside-only'});const w=dom.window;
 for(const f of ['core','reader-sites'])w.eval(fs.readFileSync(`src/${f}.js`,'utf8'));
 return {w,d:w.document,sites:w.ChatTidyReaderSites};
}
// jsdom arrays come from another realm; JSON makes them comparable. textContent joins adjacent blocks without a space.
const plain=value=>JSON.parse(JSON.stringify(value));
const summary=list=>plain(list.map(m=>[m.role,m.id,m.text]));
const fixtures={
 chatgpt:`<main><div data-turn-key="t1">
  <div data-chatgpt-search-unit-key="fallback-turn-0:0:user" data-chatgpt-search-message-ids="u-1"><div data-content-search-unit-key="fallback-turn-0:0:user"><h4 class="sr-only" data-conversation-role="user">You said:</h4><div data-user-message-bubble="true"><div>How do I list files?</div></div></div></div>
  <div data-content-search-unit-key="fallback-turn-0:2:assistant" data-chatgpt-search-unit-key="fallback-turn-0:2:assistant" data-chatgpt-search-message-ids="a-1 a-1b"><h4 class="sr-only" data-conversation-role="assistant">ChatGPT said:</h4><div><div data-markdown-copy="contents"><div class="_MarkdownRoot_x1"><p>Use ls.</p><div data-code-block="true"><div data-markdown-copy="exclude"><div class="min-w-0 flex-1 truncate">Bash</div><div data-code-block-controls="true"><button>Copy</button></div></div><div class="chatgpt-code-scrollport"><pre><code>ls -la</code></pre></div></div></div></div></div></div>
 </div><form><div contenteditable="true"><pre>draft</pre></div></form></main>`,
 claude:`<main><div data-testid="transcript-row" data-perf-row="human"><div data-cds="UserMessage" data-turn-key="c-u1"><div data-testid="user-message"><p class="whitespace-pre-wrap">Plan a trip</p></div></div></div>
  <div data-testid="transcript-row" data-perf-row="assistant"><div data-testid="assistant-message" data-turn-key="c-a1" data-is-streaming="false"><h3 class="sr-only">Claude</h3><div class="standard-markdown"><p>Here is a plan.</p></div></div></div></main>`,
 grok:`<main><div data-testid="drop-ui"><div id="response-g-u1" class="items-end"><div data-testid="user-message" class="message-bubble"><h2 class="sr-only" id="turn-heading-g-u1">You</h2><div class="response-content-markdown"><p>Explain DNS</p></div></div></div>
  <div id="response-g-a1" class="items-start"><div data-testid="assistant-message" class="message-bubble"><div class="response-content-markdown"><div class="thinking-container">thinking…</div><p>DNS maps names.</p></div></div></div></div></main>`,
 gemini:`<chat-window><div class="conversation-container" id="9f2c4e1a7b3d5e60"><user-query><div class="query-text"><p class="query-text-line">Write a loop</p></div></user-query>
  <model-response><div class="response-container-header">Show thinking</div><message-content><div class="markdown markdown-main-panel"><p>Sure.</p><code-block><div class="code-block"><div class="formatted-code-block-internal-container"><div class="animated-opacity"><div class="code-block-decoration header-formatted"><span>JavaScript</span><div class="buttons"><button class="copy-button">copy</button></div></div><pre><code class="code-container formatted" data-test-id="code-content">for(;;){}</code></pre></div></div></div></code-block></div></message-content></model-response></div></chat-window>`,
 kimi:`<main><div class="chat-content-list"><div class="chat-content-item chat-content-item-user" data-archer-id="k-u1" data-conversation-turn-id="turn-1"><div class="segment segment-user"><div class="user-content"><span class="user-content__text">Sort a list</span></div></div></div>
  <div class="chat-content-item chat-content-item-assistant" data-archer-id="k-a1"><div class="segment segment-assistant"><div class="markdown-container"><div class="markdown"><p>Use sorted().</p><div class="segment-code"><header class="segment-code-header"><span class="segment-code-lang">python</span><button class="icon-button">Copy</button></header><div class="segment-code-content"><pre class="language-python"><code>sorted(x)</code></pre></div></div></div></div></div></div></div></main>`,
 qwen:`<div class="share-layout-messages"><div class="qwen-chat-message qwen-chat-message-user"><div class="chat-user-message"><div class="user-message-content">Write a probe</div></div></div>
  <div class="qwen-chat-message qwen-chat-message-assistant"><div id="chat-response-message-q-a1" class="chat-response-message"><div class="chat-response-message-right"><div class="response-message-content t2t phase-think"><div class="qwen-markdown">Thinking…</div></div><div class="response-message-content t2t phase-answer"><div class="custom-qwen-markdown"><div class="qwen-markdown"><p>Run this.</p><pre class="qwen-markdown-code"><div class="qwen-markdown-code-header-wrapper"><div class="qwen-markdown-code-header"><div>bash</div><div class="qwen-markdown-code-header-actions"><div class="qwen-markdown-code-header-action-item">Copy</div></div></div></div><div class="qwen-markdown-code-body bash"><code>curl -s x | bash</code></div></pre></div></div></div></div></div></div></div>`,
 zai:`<div id="messages-container"><div id="message-z-u1" class="user-message"><div id="message-z-u1-start"></div><div class="chat-user markdown-prose">Translate this</div></div>
  <div id="message-z-a1"><div id="message-z-a1-start"></div><div id="response-content-container"><div class="chat-assistant markdown-prose">Here you go.</div></div></div></div>`
};
const expected={
 chatgpt:[['user','u-1','How do I list files?'],['assistant','a-1','Use ls.ls -la']],
 claude:[['user','c-u1','Plan a trip'],['assistant','c-a1','Here is a plan.']],
 grok:[['user','g-u1','Explain DNS'],['assistant','g-a1','DNS maps names.']],
 gemini:[['user','9f2c4e1a7b3d5e60','Write a loop'],['assistant','9f2c4e1a7b3d5e60','Sure.for(;;){}']],
 kimi:[['user','k-u1','Sort a list'],['assistant','k-a1','Use sorted().sorted(x)']],
 qwen:[['user',null,'Write a probe'],['assistant','q-a1','Run this.curl -s x | bash']],
 zai:[['user','z-u1','Translate this'],['assistant','z-a1','Here you go.']]
};
for(const [site,markup] of Object.entries(fixtures))test(`${site}: messages, roles, IDs and bodies come from the live structure`,()=>{
 const {d,sites}=load(markup);const adapter=sites.get(site);const root=d.body;
 const messages=adapter.messages(root);
 assert.deepEqual(summary(messages),expected[site]);
 assert.ok(messages.every(m=>m.el.contains(m.body)),'bodies sit inside their message');
 assert.ok(adapter.messages(root,{text:false}).every(m=>m.text===undefined),'text:false skips the text read');
 // Search skips the site chrome named by exclude (screen-reader headings, code headers, reasoning panes).
 for(const m of messages)for(const node of m.body.querySelectorAll(adapter.exclude||':not(*)'))assert.ok(node.matches(adapter.exclude));
});
test('chatgpt keeps the legacy role attributes as a fallback',()=>{
 const {d,sites}=load(`<main><div data-message-author-role="user" data-message-id="old-u"><div class="whitespace-pre-wrap">Old question</div></div><div data-message-author-role="assistant" data-message-id="old-a"><div class="markdown"><p>Old answer</p></div></div></main>`);
 assert.deepEqual(summary(sites.get('chatgpt').messages(d.body)),[['user','old-u','Old question'],['assistant','old-a','Old answer']]);
});
test('code language comes from the class or from the site header',()=>{
 const langs=site=>{const {d,sites}=load(fixtures[site]);return plain(sites.get(site).codeBlocks(d.body).map(b=>b.lang));};
 assert.deepEqual(langs('chatgpt'),['bash'],'ChatGPT prints the language in the action bar; the composer draft is skipped');
 assert.deepEqual(langs('gemini'),['javascript']);
 assert.deepEqual(langs('kimi'),['python']);
 assert.deepEqual(langs('qwen'),['bash'],'Qwen names the language in the sticky header inside pre');
 // Z.ai renders code in a read-only CodeMirror editor: no pre, the language on a wrapper class.
 const {d,sites}=load(`<div class="chat-assistant markdown-prose"><div class="relative rounded-xl"><div class="absolute">json</div><div class="language-json rounded-b-lg"><div class="h-full"><div class="cm-editor"><div class="cm-scroller"><div class="cm-content" contenteditable="false"><div class="cm-line">{"a": 1}</div></div></div></div></div></div></div></div><textarea></textarea><div class="cm-editor"><div class="cm-content" contenteditable="true"><div class="cm-line">draft</div></div></div>`);
 const blocks=sites.get('zai').codeBlocks(d.body);
 assert.deepEqual(plain(blocks.map(b=>[b.lang,!!b.editor,b.code.className])),[['json',true,'cm-content']],'editable editors (composers) are skipped');
});
test('exclude covers the chrome recorded per site',()=>{
 const {sites}=load('');
 assert.match(sites.get('chatgpt').exclude,/h4\[data-conversation-role\]/);assert.match(sites.get('chatgpt').exclude,/data-markdown-copy="exclude"/);
 assert.match(sites.get('grok').exclude,/thinking-container/);assert.match(sites.get('gemini').exclude,/code-block-decoration/);assert.match(sites.get('kimi').exclude,/segment-code-header/);
});
test('lazy marks the sites that window or page their history',()=>{
 const {sites}=load('');
 assert.deepEqual(plain(['chatgpt','claude','grok','gemini','kimi','qwen','zai'].filter(id=>sites.get(id).lazy)),['claude','grok','gemini']);
});
test('core.supports matches the layout CSS each adapter really has',()=>{
 const {w,sites}=load('');
 for(const id of ['chatgpt','claude','grok','gemini','kimi','qwen','zai']){
  const has=sites.layoutSupport(id);
  for(const feature of Object.keys(has))assert.equal(w.ChatTidyCore.supports(id,feature),has[feature],`${id} ${feature}`);
  for(const feature of ['outline','codeTools','library'])assert.equal(w.ChatTidyCore.supports(id,feature),true,`${id} ${feature}`);
  if(has.chatWidth)assert.match(sites.get(id).layout.width,/\{width\}/);
 }
});
test('answer text leaves out our own code-tool nodes',()=>{
 const {d,sites}=load(`<main><div data-testid="user-message">Q</div><div data-testid="assistant-message" data-turn-key="a"><div class="standard-markdown"><p>Answer</p><pre><code>ls</code><div data-cs-owned="true">1 2 Risky commands: 1</div></pre></div></div></main>`);
 assert.equal(sites.get('claude').messages(d.body)[1].text,'Answerls');
});
test('windowed lists sort by the site position, not the DOM order; nested matches keep the innermost',()=>{
 const {d,sites}=load(`<main><div data-testid="transcript-row" data-rs-index="1"><div data-testid="assistant-message" data-turn-key="a1"><div class="standard-markdown">A</div></div></div><div data-testid="transcript-row" data-rs-index="0"><div data-testid="user-message" data-turn-key="u1">Q</div></div></main>`);
 assert.deepEqual(summary(sites.get('claude').messages(d.body)),[['user','u1','Q'],['assistant','a1','A']]);
 const legacy=load(`<main><div data-message-author-role="user" data-message-id="outer"><div data-message-author-role="user" data-message-id="inner"><div class="whitespace-pre-wrap">Q</div></div></div></main>`);
 assert.deepEqual(summary(legacy.sites.get('chatgpt').messages(legacy.d.body)),[['user','inner','Q']]);
});
