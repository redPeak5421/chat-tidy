// Only the extension's top-level ChatGPT content script can submit exact chat IDs.
'use strict';
const ORIGIN = 'https://chatgpt.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let active = null;
function trusted(sender) {
  try { return sender.id === chrome.runtime.id && Number.isInteger(sender.tab?.id) && sender.frameId === 0 && new URL(sender.url).origin === ORIGIN; } catch { return false; }
}
async function request(path, options = {}) {
  let response;
  try { response = await fetch(ORIGIN + path, {...options, credentials:'include', redirect:'error', signal:AbortSignal.timeout(20000)}); }
  catch { throw Error('network'); }
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
    const settings=await chrome.storage.local.get({concurrency:2,deleteCooldownUntil:0});
    if(settings.deleteCooldownUntil>Date.now())return {completed,error:'cooldown',retryAt:settings.deleteCooldownUntil};
    const concurrency=[1,2,3].includes(Number(settings.concurrency))?Number(settings.concurrency):2;
    const session = await request('/api/auth/session');
    if (typeof session.accessToken !== 'string' || !session.accessToken) throw Error('login');
    // Bounded waves: never start another wave until all in-flight outcomes are known.
    for(let offset=0;offset<job.ids.length;offset+=concurrency){
      if(job.cancelled)break;
      const outcomes=await Promise.all(job.ids.slice(offset,offset+concurrency).map(async id=>{
        try {
          const result=await request('/backend-api/conversation/'+id,{
            method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.accessToken},
            body:JSON.stringify({is_visible:false})
          });
          if(result?.success!==true)throw Error('unexpected-response');
          completed.push(id);
          await chrome.tabs.sendMessage(job.tab,{type:'cs-progress',jobId:job.id,completed:[...completed]},{frameId:0}).catch(()=>{job.cancelled=true;});
          return null;
        }catch(err){return err;}
      }));
      const limited=outcomes.filter(err=>err?.message==='rate-limit');
      if(limited.length){
        job.retryAt=Math.max(...limited.map(err=>err.retryAt));
        await chrome.storage.local.set({concurrency:1,deleteCooldownUntil:job.retryAt});
        throw Error('rate-limit');
      }
      const failure=outcomes.find(Boolean);if(failure)throw failure;
      if(offset+concurrency<job.ids.length&&!job.cancelled)await new Promise(resolve=>setTimeout(resolve,700));
    }
  } catch (err) { error = err.message; }
  finally { if (active === job) active = null; }
  return {completed,error,cancelled:job.cancelled,retryAt:job.retryAt};
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if (!trusted(sender)) return false;
  if (message?.type === 'cs-cancel') {
    if(active?.id === message.jobId && active.tab === sender.tab.id) active.cancelled = true;
    reply({ok:true});return false;
  }
  if (message?.type !== 'cs-delete') return false;
  if (active) { reply({completed:[],error:'busy'});return false; }
  if (typeof message.jobId !== 'string' || message.jobId.length > 100 || !Array.isArray(message.ids) || !message.ids.length || message.ids.length > 1000 || message.ids.some(id=>typeof id !== 'string' || !UUID.test(id)) || new Set(message.ids).size !== message.ids.length) {
    reply({completed:[],error:'invalid-request'});return false;
  }
  active = {id:message.jobId,ids:[...message.ids],tab:sender.tab.id,cancelled:false};
  void run(active).then(reply);
  return true;
});
