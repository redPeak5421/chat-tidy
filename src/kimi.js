/* Kimi's native Connect-RPC chat service; the login token stays in page storage and memory. */
globalThis.ChatTidyKimi=(()=>{
 // The web client posts JSON unary calls to /apiv2/<package.Service>/<Method> with proto field names.
 const service='/apiv2/kimi.chat.v1.ChatService/';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 function session(storage=globalThis.localStorage){
  let token=null,userId='',info=null;
  try{token=storage.getItem('access_token');userId=(storage.getItem('msh_user_id')||'').trim();info=JSON.parse(storage.getItem('volcano-token-info')||'null');}catch{}
  if(typeof token!=='string'||!token)throw Error('login');
  return {token,userId,webId:typeof info?.webId==='string'?info.webId:'',ssid:typeof info?.ssid==='string'?info.ssid:''};
 }
 function headers(current){
  let timezone='';try{timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch{}
  return {'Content-Type':'application/json','Connect-Protocol-Version':'1',Authorization:'Bearer '+current.token,
   'x-msh-platform':'web','x-msh-version':'2.2.0','X-Traffic-Id':current.userId,'x-msh-device-id':current.webId,'x-msh-session-id':current.ssid,
   'X-Language':globalThis.navigator?.language||'en','R-Timezone':timezone};
 }
 async function checked(response){
  if(response.ok)return response;
  const e=Error(response.status===429?'rate-limit':response.status===401?'login':response.status===403?'forbidden':'http-'+response.status);
  if(response.status===429)e.retryAt=Date.now()+Math.max(60000,Number(response.headers?.get('Retry-After'))*1000||0);
  throw e;
 }
 function acknowledge(body){
  // DeleteChatResponse is an empty message; Connect errors carry a code and never arrive with HTTP 200.
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.code==='string'||body.error)throw Error('unexpected-response');
 }
 async function remove(id,current,canRun=()=>true){
  if(location.origin!=='https://www.kimi.com'||!UUID.test(id))throw Error('invalid-request');
  if(!canRun())throw Error('workspace-changed');
  const fresh=session();
  if(fresh.token!==current.token||fresh.userId!==current.userId)throw Error('account-changed');
  const response=await checked(await fetch(service+'DeleteChat',{method:'POST',credentials:'same-origin',mode:'same-origin',redirect:'error',headers:headers(fresh),body:JSON.stringify({chat_id:id}),signal:AbortSignal.timeout(20000)}));
  let body;try{body=await response.json();}catch{throw Error('unexpected-response');}
  acknowledge(body);
 }
 return {session,headers,remove,acknowledge};
})();
