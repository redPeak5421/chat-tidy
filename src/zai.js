/* Z.ai (chat.z.ai, Open WebUI based) same-origin REST API and sidebar row mapping. Cookies and the page token stay in the browser; nothing is stored. */
globalThis.ChatTidyZai=(()=>{
 const ORIGIN='https://chat.z.ai';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 // The web client sends the login token from page storage as a bearer header next to its cookie.
 function headers(){
  let token='';try{token=globalThis.localStorage?.getItem('token')||'';}catch{}
  return {Accept:'application/json','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})};
 }
 async function request(path,{method='GET'}={}){
  if(location.origin!==ORIGIN||typeof path!=='string'||!path.startsWith('/api/v1/'))throw Error('invalid-request');
  // Only one write exists: deleting a single chat. Any other method or path (notably the delete-all collection route) is refused.
  if(method!=='GET'&&!/^\/api\/v1\/chats\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(path))throw Error('invalid-request');
  let response;
  try{response=await fetch(path,{method,credentials:'same-origin',mode:'same-origin',redirect:'error',headers:headers(),signal:AbortSignal.timeout(20000)});}
  catch{throw Error('network');}
  if(!response.ok)throw ChatTidyCore.httpError(response);
  try{return await response.json();}catch{throw Error('unexpected-response');}
 }
 // Open WebUI answers a single delete with a bare `true`. Validate the ID before building the path:
 // the collection route without an ID (DELETE /api/v1/chats/) deletes every chat of the account.
 async function remove(id){
  if(typeof id!=='string'||!UUID.test(id))throw Error('invalid-request');
  const path='/api/v1/chats/'+id.toLowerCase();
  if(path.length!=='/api/v1/chats/'.length+36)throw Error('invalid-request');
  const data=await request(path,{method:'DELETE'});
  if(data!==true)throw Error('unexpected-response');
 }
 // Identity check before a destructive run: the site's own session endpoint.
 async function session(){const user=await request('/api/v1/auths/');if(typeof user?.id!=='string'||!user.id)throw Error('login');return user.id;}
 function chat(value){return value&&typeof value==='object'&&typeof value.id==='string'&&UUID.test(value.id)?{id:value.id.toLowerCase(),title:typeof value.title==='string'?value.title.trim():''}:null;}
 async function chats(page){const data=await request('/api/v1/chats/?page='+encodeURIComponent(page)+'&type=all&channel=zai-web&project_id=none');if(!Array.isArray(data))throw Error('unexpected-response');return data.map(chat).filter(Boolean);}
 // Sidebar rows are buttons without href or ID. They are mapped to the website's own list (same query and order as the
 // sidebar). Only rows whose title is unique among the rows and among the known chats ever map. When every visible row
 // matches the known list by count and title, those rows map directly. Otherwise they map in consistent order, within the part
 // of the list the sidebar can be showing, and only against a list fetched after the sidebar reached its current state. Duplicate,
 // placeholder or unknown titles get no ID, so a stale list never shifts an ID onto a neighbouring row.
 function create({changed=()=>{}}={}){
  const mapped=new WeakMap(),removed=new Set();
  let items=[],complete=false,page=0,loading=null,epoch=0,failedAt=0,refreshedAt=0,retry=0,listShape=null;
  const titleOf=row=>(row.querySelector('.truncate')?.textContent||'').trim();
  const shapeOf=rows=>rows?JSON.stringify(rows.map(titleOf)):null;
  function domRows(){
   const list=document.querySelector('#sidebar .AgentChatList');
   return list?[...list.querySelectorAll('button[data-selected]')].filter(row=>!row.closest('.cs-deleted-row')&&!row.parentElement?.closest('button[data-selected]')):null;
  }
  async function load(){
   if(loading)return loading;
   if(complete||Date.now()-failedAt<15000)return;
   const generation=epoch;
   // The sidebar as it was when the first page was requested: the list is at least as new as that state.
   if(page===0)listShape=shapeOf(domRows());
   loading=(async()=>{
    try{
     const next=page+1;const found=await chats(next);if(generation!==epoch)return;
     page=next;if(!found.length)complete=true;items=items.concat(found);
    }catch{if(generation===epoch)failedAt=Date.now();}
    finally{if(generation===epoch)loading=null;}
    changed();
   })();
   await loading;
  }
  function reset(){epoch++;items=[];complete=false;page=0;loading=null;failedAt=0;listShape=null;}
  // At most one refetch per 10 s; a throttled request is retried when the window ends, because the sidebar may not change again.
  function refresh(){
   const wait=refreshedAt+10000-Date.now();
   if(wait>0){if(!retry)retry=setTimeout(()=>{retry=0;changed();},wait);return;}
   refreshedAt=Date.now();reset();void load();
  }
  function partial(rows,known){
   const titles=rows.map(titleOf),count=(list,title)=>list.reduce((n,t)=>n+(t===title),0);
   const knownTitles=known.map(item=>item.title),rowSet=new Set(titles),knownSet=new Set(knownTitles);
   // Chats the sidebar does not show widen the window of the list it can be showing; nothing past that window maps.
   const extra=titles.filter(title=>!knownSet.has(title)).length;
   const span=rows.length+knownTitles.slice(0,rows.length+extra).filter(title=>!rowSet.has(title)).length;
   const pairs=[];
   titles.forEach((title,i)=>{
    if(!title||count(titles,title)!==1||count(knownTitles,title)!==1)return;
    const j=knownTitles.indexOf(title);if(j<span)pairs.push([i,j]);
   });
   // Longest run of pairs increasing in both orders; a pair that contradicts the sidebar order is dropped.
   const length=[],previous=[];let best=-1;
   pairs.forEach(([,j],a)=>{length[a]=1;previous[a]=-1;for(let b=0;b<a;b++)if(pairs[b][1]<j&&length[b]+1>length[a]){length[a]=length[b]+1;previous[a]=b;}if(best<0||length[a]>length[best])best=a;});
   const keep=[];for(let a=best;a>=0;a=previous[a])keep.unshift(pairs[a]);
   return keep;
  }
  function scan(){
   const rows=domRows();if(!rows)return [];
   for(const row of rows)mapped.delete(row);
   const known=items.filter(item=>!removed.has(item.id));
   if(page===0||rows.length>known.length&&!complete){void load();return [];}
   if(new Set(known.map(item=>item.id)).size!==known.length){refresh();return [];}
   let pairs;
   // Titles are the only link between a row and a chat, so a title shared by two rows or two chats never maps: when such
   // chats swap places (one is continued and moves to the top) the order alone would hand one row the other's ID.
   if(rows.length===known.length&&rows.every((row,i)=>titleOf(row)===known[i].title)){
    const titles=rows.map(titleOf),seen=new Map();for(const title of titles)seen.set(title,(seen.get(title)||0)+1);
    pairs=rows.map((row,i)=>[i,i]).filter(([i])=>titles[i]&&seen.get(titles[i])===1);
   }
   else if(listShape!==shapeOf(rows)){refresh();return [];}
   else pairs=partial(rows,known);
   for(const [i,j] of pairs)mapped.set(rows[i],{id:known[j].id,title:known[j].title||titleOf(rows[i])});
   return pairs.map(([i])=>({...mapped.get(rows[i]),link:rows[i]}));
  }
  // Before a destructive run: fetch the list again so the mapping reflects the server right now.
  async function reload(){
   reset();refreshedAt=Date.now();
   for(let guard=0;guard<50;guard++){
    await load();
    const rows=domRows()||[];
    if(complete||failedAt||items.filter(item=>!removed.has(item.id)).length>=rows.length)break;
   }
   return scan();
  }
  function forget(ids){for(const id of ids)removed.add(id);}
  function unforget(ids){for(const id of ids)removed.delete(id);refreshedAt=0;refresh();}
  return {scan,reload,forget,unforget,refresh,idOf:row=>mapped.get(row)?.id||null};
 }
 return {session,remove,chats,create};
})();
