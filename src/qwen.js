/* Qwen Chat's same-origin REST API and sidebar row mapping. Cookies stay with the browser; nothing is stored. */
globalThis.ChatTidyQwen=(()=>{
 const ORIGIN='https://chat.qwen.ai';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const PAGE_SIZE=60;
 function headers(){
  let timezone='';try{timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch{}
  const id=globalThis.crypto?.randomUUID?.()||String(Date.now());
  return {Accept:'application/json','Content-Type':'application/json',source:'web','X-Request-Id':id,Timezone:timezone,'Accept-Language':globalThis.navigator?.language||'en-US'};
 }
 async function request(path,{method='GET',body,base='/api/v2',raw=false}={}){
  if(location.origin!==ORIGIN)throw Error('invalid-request');
  let response;
  try{response=await fetch(base+path,{method,credentials:'same-origin',mode:'same-origin',redirect:'error',headers:headers(),body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}
  catch{throw Error('network');}
  if(!response.ok){
   const e=Error(response.status===429?'rate-limit':response.status===401?'login':response.status===403?'forbidden':'http-'+response.status);
   if(response.status===429)e.retryAt=Date.now()+Math.max(60000,Number(response.headers?.get('Retry-After'))*1000||0);
   throw e;
  }
  let json;try{json=await response.json();}catch{throw Error('unexpected-response');}
  if(!json||typeof json!=='object')throw Error('unexpected-response');
  // /api/v2 answers with a {success, data} envelope; /api/v1 returns the record itself (the site wraps it client-side).
  if(raw){if(typeof json.code==='string'||json.error)throw Error(typeof json.code==='string'?'api-'+json.code:'unexpected-response');return json;}
  if(json.success!==true)throw Error(typeof json?.data?.code==='string'?'api-'+json.data.code:'unexpected-response');
  return json.data;
 }
 function chat(value){return value&&typeof value==='object'&&typeof value.id==='string'&&UUID.test(value.id)?{id:value.id.toLowerCase(),title:typeof value.title==='string'?value.title:'',project:value.project_id||null,pinned:!!value.pinned,range:typeof value.time_range==='string'?value.time_range:'',created:value.created_at}:null;}
 function list(values){return Array.isArray(values)?values.map(chat).filter(Boolean):[];}
 // Identity check before destructive waves: the site's own session endpoint.
 async function session(){const user=await request('/auths/',{base:'/api/v1',raw:true});if(typeof user?.id!=='string'||!user.id)throw Error('login');return user.id;}
 const api={
  chats:async page=>list(await request('/chats/?page='+encodeURIComponent(page)+'&exclude_project=true')),
  pinned:async()=>list(await request('/chats/pinned')),
  archived:async()=>list(await request('/chats/archived')),
  remove:async id=>{const data=await request('/chats/'+id,{method:'DELETE'});if(data===false||data?.success===false)throw Error('unexpected-response');},
  // The site toggles the archived flag with one endpoint; callers state the direction they verified.
  toggleArchive:async id=>{await request('/chats/'+id+'/archive',{method:'POST'});},
  projects:async()=>{const data=await request('/projects/');return Array.isArray(data)?data.filter(item=>typeof item?.id==='string'&&typeof item?.name==='string').map(item=>({id:item.id,name:item.name})):[];},
  createProject:async name=>{const data=await request('/projects/',{method:'POST',body:{name,description:'',memory_span:'default',icon:'icon=icon-line-folder-01&style=text-primary',files:[]}});if(typeof data?.id!=='string')throw Error('unexpected-response');return {id:data.id,name:typeof data.name==='string'?data.name:name};},
  addToProject:async(projectId,ids)=>{await request('/projects/add_chat',{method:'POST',body:{chat_ids:ids,project_id:projectId}});}
 };
 // Sidebar rows have no href. The site renders pinned rows first, then the paged list split by date
 // labels; rows are mapped only when a whole section matches the website's own list in size and titles.
 function truncate(title){return title.length>100?title.slice(0,97)+'...':title;}
 function create({changed=()=>{}}={}){
  const mapped=new WeakMap();
  let pinnedItems=[],pageItems=[],complete=false,page=0,loading=null,epoch=0,failedAt=0,refreshedAt=0;
  const removed=new Set();
  const isRow=node=>node.matches?.('a.chat-item-drag-link')&&!node.closest('.project-list-wrapper,.project-chat-list,.cs-deleted-row');
  function titleOf(link){return (link.querySelector('.chat-item-title-text')?.textContent||link.textContent||'').trim();}
  function domSections(){
   const root=document.querySelector('#sidebar .session-list .list-folder')||document.querySelector('#sidebar .session-list');
   if(!root)return null;
   const main=root.querySelector('.list-folder-pt');
   const pinned=[...root.querySelectorAll('a.chat-item-drag-link')].filter(link=>isRow(link)&&!(main&&main.contains(link)));
   const groups=[];
   if(main){
    let current=null;
    for(const node of main.querySelectorAll('.list-folder-chats,a.chat-item-drag-link')){
     if(node.matches('.list-folder-chats')){current=[];groups.push(current);}
     else if(isRow(node)){if(!current){current=[];groups.push(current);}current.push(node);}
    }
   }
   return {pinned,groups};
  }
  function candidateSections(pinnedInMain){
   const pinnedIds=new Set(pinnedItems.map(item=>item.id));
   const pinned=pinnedItems.filter(item=>!removed.has(item.id));
   const groups=[];let current=null,range;
   for(const item of pageItems){
    if(removed.has(item.id)||(!pinnedInMain&&pinnedIds.has(item.id)))continue;
    if(!current||item.range!==range){current=[];groups.push(current);range=item.range;}
    current.push(item);
   }
   return {pinned,groups};
  }
  function assign(rows,items){for(let i=0;i<rows.length;i++){const item=items[i];if(item&&truncate(item.title)===titleOf(rows[i]))mapped.set(rows[i],{id:item.id,title:item.title||titleOf(rows[i])});}}
  // Aligns sections without assigning: pinned rows against pinned chats, then each dated section in order.
  // 'partial' means more pages could complete the last section; otherwise a size mismatch stops alignment there.
  function attempt(dom,pinnedInMain){
   const cand=candidateSections(pinnedInMain);
   const pinnedOk=dom.pinned.length===cand.pinned.length;
   let prefix=0,status='ok';
   for(let g=0;g<dom.groups.length;g++){
    const rows=dom.groups[g],items=cand.groups[g];
    if(!items||rows.length!==items.length){status=g===dom.groups.length-1&&!complete&&(!items||items.length<rows.length)?'partial':'mismatch';break;}
    prefix++;
   }
   return {cand,pinnedOk,prefix,status};
  }
  async function load(){
   if(loading||complete||Date.now()-failedAt<15000)return;
   const generation=epoch;
   loading=(async()=>{
    try{
     if(page===0){const pinned=await api.pinned();if(generation!==epoch)return;pinnedItems=pinned.filter(item=>!item.project);}
     const next=page+1;const items=await api.chats(next);if(generation!==epoch)return;
     page=next;pageItems=pageItems.concat(items.filter(item=>!item.project));
     if(items.length<PAGE_SIZE)complete=true;
    }catch{if(generation===epoch)failedAt=Date.now();}
    finally{if(generation===epoch)loading=null;}
    changed();
   })();
   await loading;
  }
  function refresh(){if(Date.now()-refreshedAt<30000)return;refreshedAt=Date.now();epoch++;pinnedItems=[];pageItems=[];complete=false;page=0;loading=null;failedAt=0;void load();}
  function scan(){
   const dom=domSections();if(!dom)return [];
   const rows=[...dom.pinned,...dom.groups.flat()];
   for(const row of rows)mapped.delete(row);
   let best=null;
   if(page>0)for(const pinnedInMain of [false,true]){const result=attempt(dom,pinnedInMain);if(!best||result.status==='ok'||result.prefix>best.prefix)best=result;if(result.status==='ok')break;}
   if(best){
    // Sections aligned before the first mismatch are mapped positionally with a title check on every row.
    if(best.pinnedOk)assign(dom.pinned,best.cand.pinned);
    for(let g=0;g<best.prefix;g++)assign(dom.groups[g],best.cand.groups[g]);
   }
   if(page===0||best?.status==='partial')void load();
   else if(best?.status==='mismatch'||(best&&!best.pinnedOk))refresh();
   return rows.map(row=>{const entry=mapped.get(row);return entry?{id:entry.id,title:entry.title,link:row}:null;}).filter(Boolean);
  }
  function forget(ids){for(const id of ids)removed.add(id);}
  function unforget(ids){for(const id of ids)removed.delete(id);refreshedAt=0;refresh();}
  return {scan,forget,unforget,refresh,idOf:link=>mapped.get(link)?.id||null};
 }
 return {request,session,api,create,truncate,chat};
})();
