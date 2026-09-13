// Only supported top-level extension content scripts can submit exact chat IDs.
'use strict';
importScripts('core.js');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let active = null;
function trusted(sender) {
  try { return sender.id === chrome.runtime.id && Number.isInteger(sender.tab?.id) && sender.frameId === 0 && !!ChatTidyCore.siteForUrl(sender.url); } catch { return false; }
}
async function request(origin, path, options = {}) {
  let response;
  try { response = await fetch(origin + path, {...options, credentials:'include', redirect:'error', signal:AbortSignal.timeout(20000)}); }
  catch { throw Error('network'); }
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
async function run(job) {
  const completed = [];
  let error;
  try {
    const cooldownKey=job.site.id==='chatgpt'?'deleteCooldownUntil':job.site.id+'DeleteCooldownUntil';
    const settings=await chrome.storage.local.get({concurrency:2,[cooldownKey]:0});
    if(settings[cooldownKey]>Date.now())return {completed,error:'cooldown',retryAt:settings[cooldownKey]};
    const concurrency=job.site.id==='claude'?1:[1,2,3].includes(Number(settings.concurrency))?Number(settings.concurrency):2;
    let token;
    if(job.site.id==='chatgpt'){
      const session=await request(job.site.origin,'/api/auth/session');
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
      const outcomes=await Promise.all(groups.slice(offset,offset+concurrency).map(async group=>{
        const id=group[0];
        let acknowledged=group;
        try {
          let result;
          if(job.site.id==='chatgpt'){
            result=await request(job.site.origin,'/backend-api/conversation/'+id,{
              method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
              body:JSON.stringify(job.action==='archive'?{is_archived:true}:{is_visible:false})
            });
            if(result?.success!==true)throw Error('unexpected-response');
          }else if(job.site.id==='claude'){
            const response=await chrome.tabs.sendMessage(job.tab,{type:'cs-claude-delete',action:job.action,jobId:job.id,organizationId:job.organizationId,ids:group},{frameId:0});
            if(!response||response.error)throw Error(response?.error||'disconnected');
            if(!Number.isInteger(response.status))throw Error('unexpected-response');
            result=await decodeResponse({ok:response.status>=200&&response.status<300,status:response.status,
              headers:{get:()=>response.retryAfter},json:async()=>response.body});
            if(!Array.isArray(result?.deleted))throw Error('unexpected-response');
            acknowledged=group.filter(value=>result.deleted.includes(value));
          }else{
            result=await request(job.site.origin,'/rest/app-chat/conversations/soft/'+id,{method:'DELETE'});
            if(!result||typeof result!=='object'||Array.isArray(result)||result.error||result.success===false)throw Error('unexpected-response');
          }
          completed.push(...acknowledged);
          await chrome.tabs.sendMessage(job.tab,{type:'cs-progress',jobId:job.id,completed:[...completed]},{frameId:0}).catch(()=>{job.cancelled=true;});
          if(acknowledged.length!==group.length)throw Error('unexpected-response');
          return null;
        }catch(err){return err;}
      }));
      const limited=outcomes.filter(err=>err?.message==='rate-limit');
      if(limited.length){
        job.retryAt=Math.max(...limited.map(err=>err.retryAt));
        await chrome.storage.local.set({concurrency:1,[cooldownKey]:job.retryAt});
        throw Error('rate-limit');
      }
      const failure=outcomes.find(Boolean);if(failure)throw failure;
      if(offset+concurrency<groups.length&&!job.cancelled)await new Promise(resolve=>setTimeout(resolve,job.site.id==='claude'?500:700));
    }
  } catch (err) { error = err.message; }
  finally { if (active === job) active = null; }
  return {completed,error,cancelled:job.cancelled,retryAt:job.retryAt};
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if (!trusted(sender)) return false;
  const site=ChatTidyCore.siteForUrl(sender.url);
  if (message?.type === 'cs-cancel') {
    if(active?.id === message.jobId && active.tab === sender.tab.id && active.site.id === site.id) active.cancelled = true;
    reply({ok:true});return false;
  }
  if (!['cs-delete','cs-archive'].includes(message?.type)) return false;
  const action=message.type==='cs-archive'?'archive':'delete';
  if(action==='archive'&&site.id!=='chatgpt'&&site.id!=='claude'){reply({completed:[],error:'unsupported-action'});return false;}
  if (active) { reply({completed:[],error:'busy'});return false; }
  if (typeof message.jobId !== 'string' || message.jobId.length > 100 || !Array.isArray(message.ids) || !message.ids.length || message.ids.length > 1000 || message.ids.some(id=>typeof id !== 'string' || (!UUID.test(id)&&!(site.id==='claude'&&ChatTidyCore.isCoworkId(id)))) || new Set(message.ids).size !== message.ids.length) {
    reply({completed:[],error:'invalid-request'});return false;
  }
  if(site.id==='claude'&&(typeof message.organizationId!=='string'||!UUID.test(message.organizationId))){reply({completed:[],error:'invalid-request'});return false;}
  if(action==='archive'&&site.id==='claude'&&message.ids.some(id=>!ChatTidyCore.isCoworkId(id))){reply({completed:[],error:'unsupported-action'});return false;}
  active = {site,action,organizationId:message.organizationId,id:message.jobId,ids:[...message.ids],tab:sender.tab.id,cancelled:false};
  void run(active).then(reply);
  return true;
});
