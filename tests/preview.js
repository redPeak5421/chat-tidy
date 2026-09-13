// Local preview uses the ChatGPT adapter without expanding production URL access.
const originalSiteForUrl=ChatTidyCore.siteForUrl;
ChatTidyCore.siteForUrl=url=>new URL(url).hostname==='127.0.0.1'||new URL(url).hostname==='localhost'?originalSiteForUrl('https://chatgpt.com'):originalSiteForUrl(url);
const previewTitles=['示例：旅行计划','示例：读书笔记','示例：学习安排','示例：每周食谱','示例：写作练习','示例：项目清单','示例：健身计划','示例：语言学习','示例：园艺指南','示例：摄影技巧','Demo: Weekend ideas','Demo: Reading list'];
const settings={enabled:true,language:'zh-CN'};let settingsChanged=()=>{};
window.browser={storage:{local:{get:async()=>settings,set:async data=>{const changes={};for(const [key,value] of Object.entries(data)){settings[key]=value;changes[key]={newValue:value};}settingsChanged(changes,'local');}},onChanged:{addListener:fn=>settingsChanged=fn}}};
const historyList=document.getElementById('history');
if(historyList)previewTitles.forEach((title,index)=>{
 const row=document.createElement('div');row.className='row';const a=document.createElement('a');a.href='/c/'+String(index).padStart(8,'0')+'-1111-4111-8111-111111111111';const span=document.createElement('span');span.textContent=title;a.append(span);a.onclick=e=>e.preventDefault();
 const trigger=document.createElement('button');trigger.setAttribute('aria-haspopup','menu');trigger.textContent='···';
 trigger.addEventListener('pointerdown',()=>{document.querySelectorAll('.native-menu').forEach(n=>n.remove());const menu=document.createElement('div');menu.className='native-menu';menu.setAttribute('role','menu');const del=document.createElement('button');del.textContent='删除';del.setAttribute('role','menuitem');
 del.onclick=()=>{menu.remove();const dialog=document.createElement('div');dialog.className='native-dialog';dialog.setAttribute('role','dialog');const text=document.createElement('p');text.textContent='删除 '+title+'？';const confirm=document.createElement('button');confirm.textContent='删除';confirm.onclick=()=>{row.remove();dialog.remove();};dialog.append(text,confirm);document.body.append(dialog);};menu.append(del);document.body.append(menu);});row.append(a,trigger);historyList.append(row);
});
document.getElementById('preview-language')?.addEventListener('change',e=>browser.storage.local.set({language:e.target.value}));

// Local preview only: direct executor simulation; never contacts a website.
let previewStopped=false;
browser.runtime={id:'preview',onMessage:{addListener:()=>{}}};
window.ChatTidyBatch={cancel(){previewStopped=true;},async run(job){
 previewStopped=false;const completed=[];
 for(const id of job.ids){if(previewStopped)break;await new Promise(r=>setTimeout(r,350));completed.push(id);job.onProgress?.([...completed]);}
 return {completed,cancelled:previewStopped};
}};
