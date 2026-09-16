/* Move chats into a website's native container (ChatGPT / Qwen projects, Claude groups). */
globalThis.ChatTidyProjects=(()=>{
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const PROJECT=/^g-p-[a-z0-9]{1,64}$/i;
 async function fetchJson(path,{method='GET',headers={},body}={}){
  let response;
  try{response=await fetch(path,{method,credentials:'same-origin',mode:'same-origin',redirect:'error',headers,body,signal:AbortSignal.timeout(20000)});}
  catch{throw Error('network');}
  if(!response.ok)throw Error(response.status===401?'login':response.status===403?'forbidden':response.status===429?'rate-limit':'http-'+response.status);
  try{return await response.json();}catch{throw Error('unexpected-response');}
 }
 async function chatgptToken(){const session=await fetchJson('/api/auth/session');if(typeof session?.accessToken!=='string'||!session.accessToken)throw Error('login');return session.accessToken;}
 const adapters={
  chatgpt:{label:'moveProject',createLabel:'newProject',
   async list(){
    const token=await chatgptToken();const result=[];let cursor='';
    for(let page=0;page<10;page++){
     const data=await fetchJson('/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0&owned_only=true&limit=50'+(cursor?'&cursor='+encodeURIComponent(cursor):''),{headers:{Authorization:'Bearer '+token}});
     if(!Array.isArray(data?.items))throw Error('unexpected-response');
     for(const item of data.items){const gizmo=item?.gizmo?.gizmo;if(typeof gizmo?.id==='string'&&PROJECT.test(gizmo.id))result.push({id:gizmo.id,name:String(gizmo.display?.name||gizmo.id)});}
     cursor=typeof data.cursor==='string'?data.cursor:'';if(!cursor)break;
    }
    return result;
   },
   async create(name){
    const token=await chatgptToken();
    // The website's own upsert body for a private project; the newer /projects route is tried when upsert rejects the shape.
    const body=JSON.stringify({instructions:'',display:{name,description:'',prompt_starters:[]},tools:[],files:[],training_disabled:false,sharing:[{type:'private',capabilities:{can_read:true,can_view_config:false,can_write:false,can_delete:false,can_export:false,can_share:false}}]});
    const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
    let data;
    try{data=await fetchJson('/backend-api/gizmos/snorlax/upsert',{method:'POST',headers,body});}
    catch(error){if(error.message!=='http-422')throw error;data=await fetchJson('/backend-api/projects',{method:'POST',headers,body});}
    const gizmo=data?.resource?.gizmo||data?.gizmo||data;
    const id=gizmo?.id;if(typeof id!=='string'||!PROJECT.test(id))throw Error('unexpected-response');
    return {id,name:String(gizmo.display?.name||name)};
   }},
  claude:{label:'moveGroup',createLabel:'newGroup',
   async list(organizationId){
    const data=await fetchJson('/api/organizations/'+organizationId+'/projects');
    if(!Array.isArray(data))throw Error('unexpected-response');
    return data.filter(item=>typeof item?.uuid==='string'&&UUID.test(item.uuid)&&!item.archived_at).map(item=>({id:item.uuid.toLowerCase(),name:String(item.name||item.uuid)}));
   },
   async create(name,organizationId){
    const data=await fetchJson('/api/organizations/'+organizationId+'/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,description:'',is_private:true})});
    if(typeof data?.uuid!=='string'||!UUID.test(data.uuid))throw Error('unexpected-response');
    return {id:data.uuid.toLowerCase(),name:String(data.name||name)};
   }},
  qwen:{label:'moveProject',createLabel:'newProject',list:()=>ChatTidyQwen.api.projects(),create:name=>ChatTidyQwen.api.createProject(name)}
 };
 function create({t,site,organizationId=()=>null,onRun}){
  const adapter=adapters[site.id];if(!adapter)return null;
  let dialog=null,opener=null;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function close(){dialog?.close();dialog?.remove();dialog=null;const target=opener;opener=null;if(target?.isConnected)target.focus?.();}
  async function open(snapshot){
   if(!snapshot.length||dialog)return;
   opener=document.activeElement;
   const organization=organizationId();
   dialog=el('dialog','cs-confirm cs-move');dialog.dataset.csOwned='true';
   const title=el('h2','',t('moveTitle',{n:snapshot.length}));title.id='cs-move-title';dialog.setAttribute('aria-labelledby',title.id);
   dialog.append(title,el('p','cs-hint',t('moveHint')));
   const list=el('div','cs-move-list');list.setAttribute('role','radiogroup');list.append(el('p','cs-move-status',t('destinationsLoading')));dialog.append(list);
   const fresh=el('label','cs-move-new');const freshRadio=el('input');freshRadio.type='radio';freshRadio.name='cs-move';freshRadio.value='';fresh.append(freshRadio,el('span','',t(adapter.createLabel)));
   const name=el('input','cs-move-name');name.type='text';name.maxLength=100;name.placeholder=t('destinationName');name.setAttribute('aria-label',t('destinationName'));fresh.append(name);dialog.append(fresh);
   const status=el('p','cs-move-error');status.setAttribute('role','alert');dialog.append(status);
   const footer=el('div','cs-footer'),cancel=el('button','cs-button',t('cancel')),confirm=el('button','cs-button cs-primary',t('moveConfirm',{n:snapshot.length}));
   cancel.type=confirm.type='button';cancel.dataset.csMoveCancel='true';confirm.dataset.csMoveConfirm='true';confirm.disabled=true;footer.append(cancel,confirm);dialog.append(footer);
   const update=()=>{const chosen=dialog.querySelector('input[name="cs-move"]:checked');confirm.disabled=!chosen||(chosen.value===''&&!name.value.trim());};
   dialog.addEventListener('change',update);name.addEventListener('input',()=>{freshRadio.checked=true;update();});
   cancel.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
   confirm.onclick=async()=>{
    const chosen=dialog.querySelector('input[name="cs-move"]:checked');if(!chosen)return;
    let target=chosen.value;confirm.disabled=true;status.textContent='';
    if(!target){
     try{target=(await adapter.create(name.value.trim(),organization)).id;}
     catch(error){status.textContent=t('createError')+' ('+error.message+')';update();return;}
    }
    close();onRun(snapshot,target);
   };
   document.body.append(dialog);dialog.showModal();
   try{
    const items=await adapter.list(organization);if(!dialog)return;
    list.replaceChildren();
    if(!items.length)list.append(el('p','cs-move-status',t('destinationsEmpty')));
    for(const item of items){const option=el('label','cs-move-option');const radio=el('input');radio.type='radio';radio.name='cs-move';radio.value=item.id;option.append(radio,el('span','',item.name));list.append(option);}
   }catch(error){if(dialog){list.replaceChildren(el('p','cs-move-status',t('destinationsError')+' ('+error.message+')'));}}
   if(dialog)(dialog.querySelector('.cs-move-option input')||name).focus();
  }
  return {open,close,label:adapter.label,destroy:close};
 }
 return {create,adapters};
})();
