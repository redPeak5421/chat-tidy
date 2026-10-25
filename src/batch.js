// Safari content-script executor: requests stay in the website origin and isolated world.
'use strict';
globalThis.ChatTidyBatch = (() => {
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT = /^g-p-[a-z0-9]{1,64}$/i;
let active=null;
// Single-chat requests time out after 20 s; native bulk groups pass a longer window because they do more work per request.
async function request(path, {emptySuccess,timeout=20000,...options} = {}) {
  let response;
  try { response = await fetch(path, {...options, credentials:'same-origin', mode:'same-origin', redirect:'error', signal:AbortSignal.timeout(timeout)}); }
  catch { throw Error('network'); }
  if(emptySuccess&&response.ok){
    // Native endpoints answer 202/204 without a body; a JSON error envelope on a 2xx still means failure.
    let text='';try{text=typeof response.text==='function'?await response.text():'';}catch{text='';}
    if(text.trim()){let body;try{body=JSON.parse(text);}catch{throw Error('unexpected-response');}if(body&&typeof body==='object'&&(body.error||body.success===false))throw Error('unexpected-response');}
    return {deleted:emptySuccess};
  }
  return decodeResponse(response);
}
async function decodeResponse(response) {
  if (!response.ok) throw ChatTidyCore.httpError(response);
  try { return await response.json(); } catch { throw Error('unexpected-response'); }
}
function validId(site,id){
  if(typeof id!=='string')return false;
  if(site.id==='gemini')return /^[0-9a-f]{1,16}$/.test(id);
  if(site.id==='claude'&&ChatTidyCore.isCoworkId(id))return true;
  return UUID.test(id);
}
function supported(site,action,ids){
  if(action==='delete')return true;
  if(site.id==='zai')return false;
  if(action==='restore')return ChatTidyCore.supports(site,'manager');
  if(action==='archive')return ChatTidyCore.supports(site,'archive')&&(site.id!=='claude'||ids.every(id=>ChatTidyCore.isCoworkId(id)));
  // Moving is only offered where the website has a native container for chats; Cowork tasks cannot be moved.
  if(action==='move')return ChatTidyCore.supports(site,'move')&&(site.id!=='claude'||ids.every(id=>!ChatTidyCore.isCoworkId(id)));
  return false;
}
function validTarget(site,target){
  if(typeof target!=='string'||!target)return false;
  if(site.id==='chatgpt')return PROJECT.test(target);
  if(site.id==='claude')return UUID.test(target);
  return /^[A-Za-z0-9_-]{1,64}$/.test(target);
}
async function execute(job) {
  const completed = [];
  let error;
  try {
    const cooldownKey=job.site.id==='chatgpt'?'deleteCooldownUntil':job.site.id+'DeleteCooldownUntil';
    const settings=await chrome.storage.local.get({concurrency:ChatTidyCore.settings.concurrency,[cooldownKey]:0});
    if(settings[cooldownKey]>Date.now())return {completed,error:'cooldown',retryAt:settings[cooldownKey]};
    // The setting is the number of requests in flight on every site; Claude Cowork tasks and moves stay one at a time.
    // Only the listed values count; anything else stored (the old default 2, strings, null) means the default.
    const concurrency=ChatTidyCore.concurrencyOptions.includes(settings.concurrency)?settings.concurrency:ChatTidyCore.settings.concurrency;
    if(job.cancelled)return {completed,cancelled:true};
    if(!job.canRun())throw Error('workspace-changed');
    let token;let geminiSession;let kimiSession;let checkedAt=Date.now(),sinceCheck=0,check=null;
    if(job.site.id==='gemini')geminiSession=await ChatTidyGemini.prepare(ChatTidyGemini.session());
    if(job.site.id==='kimi')kimiSession=ChatTidyKimi.session();
    if(job.site.id==='chatgpt'){
      const session=await request('/api/auth/session');
      if(typeof session?.accessToken!=='string'||!session.accessToken)throw Error('login');
      if(job.expectedUserId&&session.user?.id!==job.expectedUserId)throw Error('account-changed');
      token=session.accessToken;
    }
    if(job.site.id==='qwen'&&job.expectedUserId&&await ChatTidyQwen.session()!==job.expectedUserId)throw Error('account-changed');
    if(job.site.id==='zai'&&job.expectedUserId&&await ChatTidyZai.session()!==job.expectedUserId)throw Error('account-changed');
    // Native bulk endpoints take groups: Claude chat deletion and Qwen project moves.
    const groupSize=job.site.id==='claude'&&job.action==='delete'?20:job.site.id==='qwen'&&job.action==='move'?20:1;
    const groups=[];
    for(const id of job.ids){
      const last=groups.at(-1);
      if(last&&last.length<groupSize&&!ChatTidyCore.isCoworkId(id)&&!ChatTidyCore.isCoworkId(last[0]))last.push(id);
      else groups.push([id]);
    }
    // Bounded pool: at most `limit` requests in flight and the next one starts as soon as any settles.
    // There is no fixed pause; pacing comes from the server's own 429 Retry-After answers.
    const queue=groups.slice(),running=new Set(),limited=[];
    let limit=concurrency,failure=null,retries=0,guessed=false,resumeAt=0,solo=false,episodes=0;
    const exclusive=group=>job.site.id==='claude'&&(job.action!=='delete'||ChatTidyCore.isCoworkId(group[0]));
    // Site modules may reject with non-Error values; Errors from another realm still count by their message.
    const normal=err=>err instanceof Error||typeof err?.message==='string'?err:Error(String(err||'unexpected-response'));
    const stop=err=>{if(err.message==='rate-limit')limited.push(err);else if(!failure)failure=err;job.wake?.();};
    // `born` is the number of backoff episodes begun when the request was launched.
    function settle(group,err,born){
      err=normal(err);
      // After Stop a 429 is still reported, but it neither lowers the stored setting nor writes a cooldown.
      if(err.message==='rate-limit'&&job.cancelled){if(!failure)failure=err;return;}
      if(err.message!=='rate-limit'||failure||limited.length)return stop(err);
      // A short server window pauses the pool, halves the requests in flight and retries the same group. A 429 from a request
      // launched before the current episode began joins it (requeue, longer pause) without counting or halving again;
      // only a request launched after that starts a new episode. Long or repeated limits keep the stop + cooldown.
      const known=Number.isFinite(err.retryAfter),joins=born<episodes;
      if(known&&err.retryAfter>30000||!joins&&(retries>=3||!known&&guessed))return stop(err);
      if(!joins){episodes++;retries++;limit=Math.max(1,limit>>1);if(!known)guessed=true;}
      resumeAt=Math.max(resumeAt,Date.now()+(known?Math.max(1000,err.retryAfter):5000));
      // A rate-limited account check has no group: it is simply due again after the pause.
      if(group)queue.unshift(group);else checkedAt=0;
    }
    async function send(group){
      const id=group[0];
      let acknowledged=group;
      let result;
      if(job.site.id==='chatgpt'){
        result=await request('/backend-api/conversation/'+id,{
          method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
          body:JSON.stringify(job.action==='restore'?{is_archived:false}:job.action==='archive'?{is_archived:true}:job.action==='move'?{gizmo_id:job.target}:{is_visible:false})
        });
        if(result?.success!==true)throw Error('unexpected-response');
      }else if(job.site.id==='gemini'){
        await ChatTidyGemini.remove(id,geminiSession,()=>job.canRun()&&!job.cancelled);
      }else if(job.site.id==='kimi'){
        await ChatTidyKimi.remove(id,kimiSession,()=>job.canRun()&&!job.cancelled);
      }else if(job.site.id==='qwen'){
        if(job.action==='delete')await ChatTidyQwen.api.remove(id);
        else if(job.action==='move')await ChatTidyQwen.api.addToProject(job.target,group);
        else await ChatTidyQwen.api.toggleArchive(id);
      }else if(job.site.id==='claude'&&job.action==='move'){
        // The website assigns a chat to a project by updating the conversation record; 202 carries no body.
        result=await request('/api/organizations/'+job.organizationId+'/chat_conversations/'+id,{
          method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_uuid:job.target}),emptySuccess:group
        });
        if(!Array.isArray(result?.deleted))throw Error('unexpected-response');
      }else if(job.site.id==='claude'){
        const task=ChatTidyCore.isCoworkId(id);
        const path=task?'/v1/code/sessions/'+id+(job.action==='archive'?'/archive':''):'/api/organizations/'+job.organizationId+'/chat_conversations/delete_many';
        result=await request(path,{
          method:task&&job.action==='delete'?'DELETE':'POST',
          headers:{'Content-Type':'application/json',...(task?{'anthropic-version':'2023-06-01','anthropic-beta':'ccr-byoc-2025-07-29','anthropic-client-feature':'ccr','x-organization-uuid':job.organizationId}:{})},
          body:JSON.stringify(task?{}:{conversation_uuids:group}),...(task?{emptySuccess:group}:{timeout:60000})
        });
        if(!Array.isArray(result?.deleted))throw Error('unexpected-response');
        acknowledged=group.filter(value=>result.deleted.includes(value));
      }else if(job.site.id==='zai'){
        await ChatTidyZai.remove(id);
      }else{
        result=await request('/rest/app-chat/conversations/soft/'+id,{method:'DELETE'});
        if(!result||typeof result!=='object'||Array.isArray(result)||result.error||result.success===false)throw Error('unexpected-response');
      }
      completed.push(...acknowledged);
      job.onProgress?.([...completed]);
      if(acknowledged.length!==group.length)throw Error('unexpected-response');
    }
    const pause=ms=>new Promise(resolve=>{job.wake=resolve;setTimeout(resolve,ms);});
    for(;;){
      if(failure||limited.length||job.cancelled||!queue.length){if(running.size)await Promise.race(running);else if(check)await check;else break;continue;}
      if(resumeAt){const until=resumeAt;await pause(until-Date.now());if(resumeAt===until)resumeAt=0;continue;}
      const group=queue[0];
      if(running.size>=limit||solo||running.size&&exclusive(group)){await Promise.race(running);continue;}
      if(!job.canRun()){stop(Error('workspace-changed'));continue;}
      // The ChatGPT identity was checked before the first request; it is rechecked beside the pool, one check at a time,
      // every 10 requests per slot or 10 seconds. Requests keep the token of the checked account; a mismatch stops new launches.
      if(job.expectedUserId&&job.site.id==='chatgpt'&&!check&&(sinceCheck>=10*limit||Date.now()-checkedAt>=10000)){
        checkedAt=Date.now();sinceCheck=0;const born=episodes;
        check=request('/api/auth/session').then(current=>{if(current?.user?.id!==job.expectedUserId)throw Error('account-changed');})
          .catch(err=>{err=normal(err);if(err.message==='rate-limit')settle(null,err,born);else stop(err);}).finally(()=>{check=null;});
      }
      queue.shift();sinceCheck++;solo=exclusive(group);const born=episodes;
      const task=send(group).catch(err=>settle(group,err,born)).finally(()=>{running.delete(task);if(exclusive(group))solo=false;});
      running.add(task);
    }
    if(limited.length){
      job.retryAt=Math.max(...limited.map(err=>Number(err.retryAt)||Date.now()+60000));
      await chrome.storage.local.set({concurrency:1,[cooldownKey]:job.retryAt});
      // The cooldown still applies, but a real failure from another request is the reported cause.
      if(!failure)throw Error('rate-limit');
    }
    if(failure)throw failure;
  } catch (err) { error = typeof err?.message==='string'&&err.message?err.message:String(err||'unexpected-response'); }
  return {completed,error,cancelled:job.cancelled,retryAt:job.retryAt};
}

async function run({ids,action='delete',target,organizationId,expectedUserId,onProgress,canRun=()=>true}) {
  const site=ChatTidyCore.siteForUrl(location.href);
  if(!site)return {completed:[],error:'unsupported-site'};
  if(!['delete','archive','restore','move'].includes(action)||!Array.isArray(ids)||!supported(site,action,ids))return {completed:[],error:'unsupported-action'};
  if(!ids.length||ids.length>1000||new Set(ids).size!==ids.length||ids.some(id=>!validId(site,id))||site.id==='claude'&&(typeof organizationId!=='string'||!UUID.test(organizationId))||action==='move'&&!validTarget(site,target))return {completed:[],error:'invalid-request'};
  if(active)return {completed:[],error:'busy'};
  const job={site,action,target,organizationId,expectedUserId,ids:[...ids],onProgress,canRun,cancelled:false};
  active=job;
  try {
    // Native origin-scoped mutual exclusion across tabs; no polling or background relay.
    // Fail closed if unavailable instead of running an uncoordinated destructive batch.
    return await navigator.locks.request('chat-tidy-batch',{ifAvailable:true},lock=>lock?execute(job):{completed:[],error:'busy'});
  } catch { return {completed:[],error:'connection-lost'}; }
  finally { if(active===job)active=null; }
}
return {run,cancel(){if(active){active.cancelled=true;active.wake?.();}}};
})();
