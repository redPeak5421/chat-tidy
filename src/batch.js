// Safari content-script executor: requests stay in the website origin and isolated world.
'use strict';
globalThis.ChatTidyBatch = (() => {
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let active=null;
async function request(path, {emptySuccess,...options} = {}) {
  let response;
  try { response = await fetch(path, {...options, credentials:'same-origin', mode:'same-origin', redirect:'error', signal:AbortSignal.timeout(20000)}); }
  catch { throw Error('network'); }
  if(emptySuccess&&response.ok)return {deleted:emptySuccess};
  return decodeResponse(response);
}
async function decodeResponse(response) {
  if (!response.ok) {
    const error=Error(response.status === 401 ? 'login' : response.status === 403 ? 'forbidden' : response.status === 429 ? 'rate-limit' : 'http-' + response.status);
    if(response.status===429){
      const value=response.headers?.get('Retry-After');
      const seconds=value && Number.isFinite(Number(value)) ? Number(value) : (Date.parse(value)-Date.now())/1000;
      error.retryAt=Date.now()+Math.max(60000,Number.isFinite(seconds)?seconds*1000:0);
    }
    throw error;
  }
  try { return await response.json(); } catch { throw Error('unexpected-response'); }
}
async function execute(job) {
  const completed = [];
  let error;
  try {
    const cooldownKey=job.site.id==='chatgpt'?'deleteCooldownUntil':job.site.id+'DeleteCooldownUntil';
    const settings=await browser.storage.local.get({concurrency:2,[cooldownKey]:0});
    if(settings[cooldownKey]>Date.now())return {completed,error:'cooldown',retryAt:settings[cooldownKey]};
    const concurrency=job.site.id==='claude'?1:[1,2,3].includes(Number(settings.concurrency))?Number(settings.concurrency):2;
    if(job.cancelled)return {completed,cancelled:true};
    if(!job.canRun())throw Error('workspace-changed');
    let token;
    if(job.site.id==='chatgpt'){
      const session=await request('/api/auth/session');
      if(typeof session?.accessToken!=='string'||!session.accessToken)throw Error('login');
      token=session.accessToken;
    }
    const groupSize=job.site.id==='claude'?20:1;
    const groups=[];
    for(const id of job.ids){
      const last=groups.at(-1);
      if(last&&last.length<groupSize&&!ChatTidyCore.isCoworkId(id)&&!ChatTidyCore.isCoworkId(last[0]))last.push(id);
      else groups.push([id]);
    }
    // Bounded waves: never start another wave until all in-flight outcomes are known.
    for(let offset=0;offset<groups.length;offset+=concurrency){
      if(job.cancelled)break;
      if(!job.canRun())throw Error('workspace-changed');
      const outcomes=await Promise.all(groups.slice(offset,offset+concurrency).map(async group=>{
        const id=group[0];
        let acknowledged=group;
        try {
          let result;
          if(job.site.id==='chatgpt'){
            result=await request('/backend-api/conversation/'+id,{
              method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
              body:JSON.stringify(job.action==='archive'?{is_archived:true}:{is_visible:false})
            });
            if(result?.success!==true)throw Error('unexpected-response');
          }else if(job.site.id==='claude'){
            const task=ChatTidyCore.isCoworkId(id);
            const path=task?'/v1/code/sessions/'+id+(job.action==='archive'?'/archive':''):'/api/organizations/'+job.organizationId+'/chat_conversations/delete_many';
            result=await request(path,{
              method:task&&job.action==='delete'?'DELETE':'POST',
              headers:{'Content-Type':'application/json',...(task?{'anthropic-version':'2023-06-01','anthropic-beta':'ccr-byoc-2025-07-29','anthropic-client-feature':'ccr','x-organization-uuid':job.organizationId}:{})},
              body:JSON.stringify(task?{}:{conversation_uuids:group}),...(task?{emptySuccess:group}:{})
            });
            if(!Array.isArray(result?.deleted))throw Error('unexpected-response');
            acknowledged=group.filter(value=>result.deleted.includes(value));
          }else{
            result=await request('/rest/app-chat/conversations/soft/'+id,{method:'DELETE'});
            if(!result||typeof result!=='object'||Array.isArray(result)||result.error||result.success===false)throw Error('unexpected-response');
          }
          completed.push(...acknowledged);
          job.onProgress?.([...completed]);
          if(acknowledged.length!==group.length)throw Error('unexpected-response');
          return null;
        }catch(err){return err;}
      }));
      const limited=outcomes.filter(err=>err?.message==='rate-limit');
      if(limited.length){
        job.retryAt=Math.max(...limited.map(err=>err.retryAt));
        await browser.storage.local.set({concurrency:1,[cooldownKey]:job.retryAt});
        throw Error('rate-limit');
      }
      const failure=outcomes.find(Boolean);if(failure)throw failure;
      if(offset+concurrency<groups.length&&!job.cancelled)await new Promise(resolve=>setTimeout(resolve,job.site.id==='claude'?500:700));
    }
  } catch (err) { error = err.message; }
  return {completed,error,cancelled:job.cancelled,retryAt:job.retryAt};
}

async function run({ids,action='delete',organizationId,onProgress,canRun=()=>true}) {
  const site=ChatTidyCore.siteForUrl(location.href);
  if(!site)return {completed:[],error:'unsupported-site'};
  if(!['delete','archive'].includes(action)||action==='archive'&&(site.id==='grok'||site.id==='claude'&&Array.isArray(ids)&&ids.some(id=>!ChatTidyCore.isCoworkId(id))))return {completed:[],error:'unsupported-action'};
  if(!Array.isArray(ids)||!ids.length||ids.length>1000||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||(!UUID.test(id)&&!(site.id==='claude'&&ChatTidyCore.isCoworkId(id))))||site.id==='claude'&&(typeof organizationId!=='string'||!UUID.test(organizationId)))return {completed:[],error:'invalid-request'};
  if(active)return {completed:[],error:'busy'};
  const job={site,action,organizationId,ids:[...ids],onProgress,canRun,cancelled:false};
  active=job;
  try {
    // Native origin-scoped mutual exclusion across tabs; no polling or background relay.
    // Fail closed if unavailable instead of running an uncoordinated destructive batch.
    return await navigator.locks.request('chat-tidy-batch',{ifAvailable:true},lock=>lock?execute(job):{completed:[],error:'busy'});
  } catch { return {completed:[],error:'connection-lost'}; }
  finally { if(active===job)active=null; }
}
return {run,cancel(){if(active)active.cancelled=true;}};
})();
