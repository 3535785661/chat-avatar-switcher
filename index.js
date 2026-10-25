
(() => {
'use strict';
const MODULE='chat_avatar_switcher', CHAT_KEY='chat_avatar_switcher_v1';
const PANEL='cas-panel', BUTTON='cas-open', SETTINGS='cas-extension-settings';
let applying=false, observer;
const ctx=()=>{try{return window.SillyTavern?.getContext?.()||null}catch(e){return null}};
function settings(){const c=ctx();if(!c?.extensionSettings)return {showFloatingButton:true};c.extensionSettings[MODULE]??={};if(typeof c.extensionSettings[MODULE].showFloatingButton!=='boolean')c.extensionSettings[MODULE].showFloatingButton=true;return c.extensionSettings[MODULE]}
function applyVisibility(){const show=settings().showFloatingButton;const b=document.getElementById(BUTTON),p=document.getElementById(PANEL);if(b)b.style.display=show?'':'none';if(p&&!show)p.classList.remove('cas-open')}
function addSettings(){
 if(document.getElementById(SETTINGS))return;
 const host=document.querySelector('#extensions_settings2')||document.querySelector('#extensions_settings');if(!host)return;
 const el=document.createElement('div');el.id=SETTINGS;el.className='extension_container';
 el.innerHTML=`<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>聊天档案独立头像</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content"><label class="checkbox_label" for="cas-show-floating"><input id="cas-show-floating" type="checkbox"><span>显示聊天页面的悬浮头像按钮</span></label><small class="cas-settings-hint">关闭后只隐藏聊天页面右下角按钮，不会删除已保存的头像。可随时在这里重新开启。</small></div></div>`;
 host.appendChild(el);
 const toggle=el.querySelector('#cas-show-floating');toggle.checked=settings().showFloatingButton;
 toggle.addEventListener('change',()=>{settings().showFloatingButton=toggle.checked;ctx()?.saveSettingsDebounced?.();applyVisibility()});
 el.querySelector('.inline-drawer-toggle').addEventListener('click',()=>{const content=el.querySelector('.inline-drawer-content'),icon=el.querySelector('.inline-drawer-icon');const open=content.style.display==='none';content.style.display=open?'':'none';icon?.classList.toggle('down',open);icon?.classList.toggle('up',!open)});
}
function saved(){return ctx()?.chatMetadata?.[CHAT_KEY]?.dataUrl||''}
async function saveAvatar(data){const c=ctx();if(!c?.chatMetadata||typeof c.saveMetadata!=='function'){alert('读取不到当前聊天元数据，请确认酒馆已打开聊天。');return}if(data)c.chatMetadata[CHAT_KEY]={dataUrl:data,updatedAt:Date.now()};else delete c.chatMetadata[CHAT_KEY];await c.saveMetadata();applyAvatar();updatePreview()}
function defaultAvatar(){const c=ctx(),ch=c?.characters?.[c?.characterId];return ch?.avatar?`/characters/${encodeURIComponent(ch.avatar)}`:''}
function imageNodes(){const out=[];document.querySelectorAll('.mes .avatar img,.mes .mesAvatar img,.mes .avatar').forEach(el=>{const m=el.closest('.mes');if(m&&!m.classList.contains('is_user')&&m.getAttribute('is_user')!=='true')out.push(el)});document.querySelectorAll('#avatar img,#avatar .avatar img,#character_avatar img,.character_avatar img').forEach(el=>out.push(el));return [...new Set(out)]}
function setImg(el,url){if(el.tagName==='IMG'){if(el.src!==new URL(url,location.href).href)el.src=url}else{const img=el.querySelector?.('img');if(img)setImg(img,url);else el.style.backgroundImage=`url("${url.replaceAll('"','%22')}")`}}
function applyAvatar(){if(applying)return;applying=true;try{const url=saved()||defaultAvatar();if(url)imageNodes().forEach(el=>setImg(el,url))}finally{applying=false}}
function updatePreview(){const p=document.querySelector('#cas-preview');if(!p)return;const url=saved()||defaultAvatar();p.src=url;p.style.display=url?'block':'none';const s=document.querySelector('#cas-status');if(s)s.textContent=saved()?'当前档案：已设置独立头像':'当前档案：使用角色卡默认头像'}
function compress(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>{const im=new Image();im.onerror=reject;im.onload=()=>{const max=320,scale=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(im.naturalWidth*scale));cv.height=Math.max(1,Math.round(im.naturalHeight*scale));cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);resolve(cv.toDataURL('image/jpeg',.82))};im.src=r.result};r.readAsDataURL(file)})}
function addPanel(){if(document.getElementById(PANEL))return;const b=document.createElement('button');b.id=BUTTON;b.type='button';b.textContent='头像';b.title='设置当前聊天档案的独立头像';document.body.appendChild(b);
const p=document.createElement('section');p.id=PANEL;p.innerHTML=`<div class="cas-head"><strong>聊天档案独立头像</strong><button id="cas-close" type="button">×</button></div><p class="cas-note">只作用于当前聊天档案，不修改角色卡原图。</p><img id="cas-preview" alt="头像预览"><p id="cas-status"></p><label class="cas-upload">选择头像图片<input id="cas-file" type="file" accept="image/*"></label><button id="cas-reset" type="button">恢复角色卡默认头像</button><p class="cas-small">建议使用正方形图片；图片会压缩后保存到当前聊天元数据。</p>`;document.body.appendChild(p);
b.addEventListener('click',()=>{p.classList.toggle('cas-open');updatePreview()});p.querySelector('#cas-close').addEventListener('click',()=>p.classList.remove('cas-open'));p.querySelector('#cas-reset').addEventListener('click',()=>{if(confirm('恢复当前聊天档案的默认角色头像？'))saveAvatar('')});p.querySelector('#cas-file').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(!f.type.startsWith('image/'))throw Error('not image');await saveAvatar(await compress(f))}catch(err){alert('图片处理失败，请换一张图片再试。')}finally{e.target.value=''}});applyVisibility()}
function boot(){addPanel();addSettings();applyAvatar();updatePreview();applyVisibility();const c=ctx();if(c?.eventSource?.on&&c?.event_types){const refresh=()=>setTimeout(()=>{applyAvatar();updatePreview()},250);for(const n of ['CHAT_CHANGED','CHARACTER_MESSAGE_RENDERED','MESSAGE_RECEIVED','APP_READY'])if(c.event_types[n])c.eventSource.on(c.event_types[n],refresh)}observer=new MutationObserver(()=>{if(!applying)applyAvatar()});observer.observe(document.body,{childList:true,subtree:true})}
let tries=0;const timer=setInterval(()=>{if(ctx()&&document.body){clearInterval(timer);boot()}else if(++tries>80)clearInterval(timer)},500);
})();
