/* Gemini's native DeleteConversation RPC; credentials never leave this origin or page memory. */
globalThis.ChatTidyGemini=(()=>{
 const rpc='GzXR5e';
 function session(doc=document){
  const source=[...doc.querySelectorAll('script')].map(n=>n.textContent).join('\n');
  const read=key=>{const m=source.match(new RegExp('"'+key+'"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")'));return m?JSON.parse(m[1]):null;};
  const token=read('SNlM0e'),account=doc.querySelector('meta[name="og-profile-acct"]')?.content;
  if(!token||!account)throw Error('login');
  const user=location.pathname.match(/^\/u\/(\d+)\//)?.[1]||new URL(location.href).searchParams.get('authuser')||'0';
  if(!/^\d+$/.test(user))throw Error('login');
  return {token,account,user,build:read('cfb2h'),sid:read('FdrFJe')};
 }
 function acknowledge(text){
  let found=false;
  function visit(value){if(!Array.isArray(value))return;
   if(value[0]==='wrb.fr'&&value[1]===rpc){
    if(typeof value[2]!=='string')throw Error('unexpected-response');
    const result=JSON.parse(value[2]);if(!Array.isArray(result)||result.some(v=>v!==null))throw Error('unexpected-response');found=true;
   }else for(const item of value)visit(item);
  }
  for(const line of text.split('\n')){if(line.trim().startsWith('[')){let frame;try{frame=JSON.parse(line);}catch{throw Error('unexpected-response');}visit(frame);}}
  if(!found)throw Error('unexpected-response');
 }
 async function checked(response){if(response.ok)return response;const e=Error(response.status===429?'rate-limit':response.status===401?'login':response.status===403?'forbidden':'http-'+response.status);if(response.status===429)e.retryAt=Date.now()+Math.max(60000,Number(response.headers.get('Retry-After'))*1000||0);throw e;}
 async function prepare(expected){
  // The app URL canonicalizes with a redirect. Use the same bootstrap credentials
  // as the native client instead of fetching a second copy of the application.
  const current=session();
  if(current.account!==expected.account||current.user!==expected.user)throw Error('account-changed');
  return current;
 }
 async function remove(id,current,canRun=()=>true){
  if(location.origin!=='https://gemini.google.com'||!/^[0-9a-f]{1,16}$/.test(id))throw Error('invalid-request');
  if(!canRun())throw Error('workspace-changed');
  const expected=session();
  if(current.account!==expected.account||current.user!==expected.user)throw Error('account-changed');
  const options={credentials:'same-origin',mode:'same-origin',redirect:'error'};
  const query=new URLSearchParams({rpcids:rpc,'source-path':location.pathname,authuser:expected.user,rt:'c'});
  if(current.build)query.set('bl',current.build);if(current.sid)query.set('f.sid',current.sid);
  const body=new URLSearchParams({'f.req':JSON.stringify([[[rpc,JSON.stringify(['c_'+id]),null,'generic']]]),at:current.token});
  const response=await checked(await fetch('/_/BardChatUi/data/batchexecute?'+query,{...options,signal:AbortSignal.timeout(20000),method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:body.toString()}));
  acknowledge(await response.text());
 }
 return {session,prepare,remove,acknowledge};
})();
