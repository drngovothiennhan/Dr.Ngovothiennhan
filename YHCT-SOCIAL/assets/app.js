import {LocalStorageAdapter,createRepository} from './core/store.js';
import {previewComments,toggleSetItem,toggleReaction,createPost,addComment} from './core/social.js';
import {rankFeed,rankTrending} from './core/ranking.js';
import {seedData} from './modules/data.js';
import {members} from './modules/members.js';
import {followTopic,topicStats} from './modules/community.js';
import {mergeNotifications,markAllRead,unreadCount} from './modules/notifications.js';
import {deriveProfileProgress} from './modules/profile.js';
import {assessContentRisk} from './modules/moderation.js';
import {buildResearchEvent} from './modules/research.js';
import {authenticateMember,createAuthSession,can,operatorMode,roleLabel,resolvePostLoginRoute} from './core/auth.js';
import {searchAll} from './modules/search.js';
import {sendMessage,markThreadRead,unreadThreads} from './modules/messages.js';
import {answerAcademicQuery} from './modules/assistant.js';
import {joinGroup} from './modules/groups.js';
import {createSyncQueue} from './core/sync.js';

const AUTH_KEY='yhct-auth-session';
const requestedNext=new URLSearchParams(location.search).get('next')||'';
const adapter=new LocalStorageAdapter('yhct-social-v3',seedData);
const repo=createRepository(adapter);
let state=await repo.get();
let session=null;
let feedMode='for-you';
let activeThreadId=state.threads?.[0]?.id||null;
let syncQueue=createSyncQueue(state.syncOperations||[]);
const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>[...r.querySelectorAll(q)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

applySavedTheme();
restoreSession();
bindStaticEvents();
if(session) await enterApp(session); else showLogin();

function applySavedTheme(){
  try{
    const t=JSON.parse(localStorage.getItem('yhct-theme')||'null');
    if(!t)return;
    const root=document.documentElement;
    if(t.primary)root.style.setProperty('--primary',t.primary);
    if(t.secondary)root.style.setProperty('--secondary',t.secondary);
    if(t.bg)root.style.setProperty('--bg',t.bg);
    if(t.radius)root.style.setProperty('--radius',`${Number(t.radius)}px`);
    if(t.border)root.style.setProperty('--line',t.border);
  }catch{}
}
function restoreSession(){
  try{
    const raw=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');
    if(!raw)return;
    const known=members.find(x=>x.mssv===String(raw.mssv||raw.id||''));
    if(!known)return localStorage.removeItem(AUTH_KEY);
    session=createAuthSession({...known,issuedAt:raw.issuedAt,mustChangePassword:Boolean(raw.mustChangePassword)});
  }catch{localStorage.removeItem(AUTH_KEY)}
}
function showLogin(message=''){
  $('#loginGate').hidden=false;
  $('#appShell').hidden=true;
  $('#loginError').textContent=message;
  setTimeout(()=>$('#loginMssv')?.focus(),0);
}
async function enterApp(authSession){
  session=authSession;
  const member=members.find(x=>x.mssv===session.mssv);
  const existing=state.currentUser?.id===member.id?state.currentUser:null;
  state.currentUser={
    ...member,
    specialty:member.faculty==='DÆ°á»£c'?'DÆ°á»£c há»c':'Y há»c cá»• truyá»n',
    stats:existing?.stats||{posts:0,acceptedAnswers:0,helpfulReactions:0,eventsJoined:0}
  };
  await repo.patch({currentUser:state.currentUser});
  localStorage.setItem(AUTH_KEY,JSON.stringify(session));
  $('#loginGate').hidden=true;
  $('#appShell').hidden=false;
  renderAll();
  navigate(location.hash.slice(1)||'home');
  emitResearch('login_success',{role:session.role});
}
async function logout(){
  localStorage.removeItem(AUTH_KEY);
  session=null;
  state.currentUser=null;
  await repo.patch({currentUser:null});
  $('#loginPassword').value='';
  showLogin();
}
function bindStaticEvents(){
  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();
    $('#loginError').textContent='';
    try{
      const next=authenticateMember({mssv:$('#loginMssv').value,password:$('#loginPassword').value,directory:members});
      await enterApp(next);
      const target=resolvePostLoginRoute(next,requestedNext);
      if(target==='/yhct-admin/')location.assign(target);
    }catch{$('#loginError').textContent='MSSV hoáº·c máº­t kháº©u khÃ´ng Ä‘Ãºng.'}
  });
  $('#logoutBtn').onclick=logout;
  $$('[data-route]').forEach(b=>b.onclick=()=>{if(!session)return;navigate(b.dataset.route);closeMobileMore()});
  const mobileMore=$('[data-action="mobile-more"]');
  if(mobileMore)mobileMore.onclick=()=>{const menu=$('#mobileMoreMenu'),open=menu.hidden;menu.hidden=!open;mobileMore.setAttribute('aria-expanded',String(open))};
  $$('[data-feed]').forEach(b=>b.onclick=()=>{feedMode=b.dataset.feed;$$('[data-feed]').forEach(x=>x.classList.toggle('active',x===b));renderFeed()});
  $('#publishBtn').onclick=publish;
  $('#readAllBtn').onclick=async()=>{state.notifications=markAllRead(state.notifications||[]);await repo.patch({notifications:state.notifications});renderNotifications()};
  $('#globalSearch').oninput=e=>renderSearch(e.target.value);
  $('#assistantAsk').onclick=runAssistant;
  $('#assistantQuery').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();runAssistant()}};
  $('#messageSend').onclick=sendActiveMessage;
  $('#messageInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendActiveMessage()}};
  $('#operatorReviewBtn').onclick=()=>renderOperatorOutput('review');
  $('#operatorQueueBtn').onclick=()=>renderOperatorOutput('queue');
  $('#operatorSupportBtn').onclick=()=>renderOperatorOutput('support');
  document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))renderSearch('')});
  let deferredPrompt=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').hidden=false});
  $('#installBtn').onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('#installBtn').hidden=true};
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
function emitResearch(name,payload={}){
  try{const key='yhct-research-events';const list=JSON.parse(localStorage.getItem(key)||'[]');list.push(buildResearchEvent(name,payload));localStorage.setItem(key,JSON.stringify(list.slice(-200)))}catch{}
}
function followed(id){return (state.followedPeople||[]).includes(id)}
async function queueOperation(kind,payload={}){
  syncQueue=syncQueue.enqueue({id:`op_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,kind,payload,createdAt:Date.now()});
  state.syncOperations=syncQueue.items;
  await repo.patch({syncOperations:state.syncOperations});
  renderSyncStatus();
}
function renderSyncStatus(){const el=$('#syncStatus');if(!el)return;const n=syncQueue.items.length;el.textContent=n?`${n} thao tÃ¡c chá» Ä‘á»“ng bá»™`:'Offline-ready';el.classList.toggle('pending',n>0)}
function personById(id){
  if(state.currentUser&&id===state.currentUser.id)return state.currentUser;
  if(id==='system-yhct')return{id,name:'CLB Y Há»ŒC Cá»” TRUYá»€N HIU',avatar:'é†«',specialty:'Ban tá»• chá»©c'};
  return (state.people||[]).find(p=>p.id===id)||{id,name:'Há»™i viÃªn YHCT',avatar:'YH',specialty:'Y há»c cá»• truyá»n'};
}
function renderIdentity(){
  if(!state.currentUser)return;
  $('#miniName').textContent=state.currentUser.name;
  $('#miniSpecialty').textContent=state.currentUser.specialty;
  $('#miniAvatar').textContent=state.currentUser.avatar||'YH';
  $('#composerAvatar').textContent=state.currentUser.avatar||'YH';
  $('#profileAvatar').textContent=state.currentUser.avatar||'YH';
  $('#profileName').textContent=state.currentUser.name;
  $('#profileSpecialty').textContent=state.currentUser.specialty;
  $('#profilePosition').textContent=`${state.currentUser.position} Â· MSSV ${state.currentUser.mssv}`;
  $('#sessionRole').textContent=roleLabel(session.role);
  $('#firstLoginNotice').hidden=!session.mustChangePassword;
  $('#adminControlLink').hidden=!can(session,'admin:operate');
  renderOperatorPanel();
}
function renderOperatorPanel(){
  const mode=operatorMode(session),panel=$('#operatorPanel');
  if(!mode){panel.hidden=true;return}
  panel.hidden=false;
  if(mode==='SUPER_MOD'){
    $('#operatorTitle').textContent='SUPER MOD Console';
    $('#operatorDescription').textContent='PÃ³ chá»§ nhiá»‡m: Ä‘iá»u phá»‘i kiá»ƒm duyá»‡t, há»— trá»£ thÃ nh viÃªn vÃ  xá»­ lÃ½ há»“ng chá»ng ná»™i dung.';
    $('#operatorSupportBtn').hidden=false;
  }else{
    $('#operatorTitle').textContent='MOD Console';
    $('#operatorDescription').textContent='Ban quáº£n lÃ½ tÃ y ngá»­n vá»™ gÃ©c rÃªn tÃªn Ä‘Æ°á»c gan chá»©c.';
    $('#operatorSupportBtn').hidden=true;
  }
  renderOperatorOutput('idle');
}
function renderOperatorOutput(mode){
  if(!operatorMode(session))return;
  const flagged=(state.posts||[]).filter(p=>p.moderation?.level==='high'||p.moderation?.action==='review').length;
  const pending=syncQueue.items.length;
  const text=mode==='review'?`Ná»™i dung cáº§n xem xÃ¨t: ${flagged}.`:mode==='queue'?`HÃ ng chá» Ä‘á»“ng bá»™/Ä‘iá»u há»™nh : ${pending}.`:mode==='support'?`Danh báº¡ hiá»‡n cÃ³ ${members.length} tÃ i khoáº£n CLB; quyá»n há»— trá»£ khÃ´ng bao gá»“m Admin Control Center.`:'Sáº·n sÃ ng Ä‘iá»u há»™nh theo pháº¡m vi Ä‘Æ°á»£c phÃ¢n quá»n.';
  $('#operatorOutput').textContent=text;
}
function renderMessages(){
  const threads=[...(state.threads||[])].sort((a,b)=>(b.lastMessage?.at||0)-(a.lastMessage?.at||0));
  const unread=unreadThreads(threads,state.currentUser.id);
  $('#messageUnreadCount').textContent=unread;
  if($('#messageUnreadCountMobile'))$('#messageUnreadCountMobile').textContent=unread;
  if(!activeThreadId&&threads[0])activeThreadId=threads[0].id;
  $('#messageThreads').innerHTML=threads.length?threads.map(t=>{const peerId=t.participants.find(x=>x!==state.currentUser.id),peer=personById(peerId);return `<button class="thread-btn ${t.id===activeThreadId?'active':''}" data-thread="${esc(t.id)}"><strong>${esc(peer.name)}</strong><span class="thread-preview">${esc(t.lastMessage?.body||'ChÃ³a cÃ³ tin nháº¯n')}</span></button>`}).join(''):'<div class="empty">ChÃ³a cÃ³ cuá»™c trÃ² chuyá»‡n.</div>';
  const active=threads.find(t=>t.id===activeThreadId);
  if(!active){$('#messageHeader').textContent='Chá»n cuá»™c trÃ² chuyá»‡n';$('#messageList').innerHTML='<div class="empty">Tin n2áº¯n sáº½ xuáº¥t hiá»‡n khi cÃ³ Ä‘á»‘i thÆ°áº¡i thá»±c.</div>';return}
  const peer=personById(active.participants.find(x=>x!==state.currentUser.id));$('#messageHeader').textContent=`${peer.name} Â· ${peer.specialty}`;
  $('#messageList').innerHTML=(active.messages||[]).map(m=>{const mine=m.senderId===state.currentUser.id,who=personById(m.senderId);return``<div class="message-bubble ${mine?'mine':''}"><strong>${mine?'Báº¡n":esc(who.name)}</strong><div>${esc(m.body)}</div><span class="message-time">${relative(m.at)}</span></div>`}).join('')||'<div class="empty">Báº¯t Ä‘áº§u cuá»™c trÃ²& ;
  $$('#messageThreads [data-thread]').forEach(b=>b.onclick=async()=>{activeThreadId=b.dataset.thread;const current=(state.threads||[]).find(t=>t.id===activeThreadId);state.threads=state.threads.map(t=>t.id===activeThreadId?markThreadRead(current,state.currentUser.id):t);await repo.patch({threads:state.threads});renderMessages()});
}
async function sendActiveMessage(){
  const input=$('#messageInput'),body=input.value.trim();if(!body||!activeThreadId)return;
  const t=(state.threads||[]).find(x=>x.id===activeThreadId);if(!t)return;
  const next=sendMessage(t,{id:'m'+Date.now(),senderId:state.currentUser.id,body,at:Date.now()});
  state.threads=state.threads.map(x=>x.id===activeThreadId?next:x);await repo.patch({threads:state.threads});await queueOperation('µµ•ÍÍ…”éÍ•¹œ±íÑ¡É•…‘%é…Ñ¥Ù•Q¡É•…‘%±µ•ÍÍ…•%é¹•áÐ¹±…ÍÑ5•ÍÍ…”¹¥‘ô¤í¥¹ÁÕÐ¹Ù…±Õ”ôœœíÉ•¹‘•É5•ÍÍ…•Ì ¤ì)ô)™Õ¹Ñ¥½¸É•¹‘•ÉM•…É ¡ÅÕ•Éä¥ì(€½¹ÍÐ‰½àô œÍ•…É¡I•ÍÕ±ÑÌœ¤ì(€½¹ÍÐ¡¥ÑÌõÍ•…É¡±°¡íÅÕ•Éä±Á½ÍÑÌè¡ÍÑ…Ñ”¹Á½ÍÑÍññmt¤¹™¥±Ñ•È¡Àôø…À¹ÍåÍÑ•´¤±Á•½Á±”éÍÑ…Ñ”¹Á•½Á±•ññmt±Ñ½Á¥Ìél£‰´†î¥Ôœ°Ã†îŒ±§†îÔœ°#†î5ŒÑ¡×†êµÐœ°!¿†ê…ÐƒG†îe¹œœ°†îe¹œƒG†îM¹œuô¤¹Í±¥” À°ÄÀ¤ì(€¥˜ …ÅÕ•Éä¹ÑÉ¥´ ¤¥í‰½à¹¡¥‘‘•¸õÑÉÕ”í‰½à¹¥¹¹•É!Q50ôœœì œ±½‰…±M•…É œ¤¹Í•ÑÑÑÉ¥‰ÕÑ” …É¥„µ•áÁ…¹‘•œ°™…±Í”œ¤íÉ•ÑÕÉ¹ô(€‰½à¹¥¹¹•É!Q50õ¡¥ÑÌ¹±•¹Ñ ý¡¥ÑÌ¹µ…À¡ ôù€ñ‰ÕÑÑ½¸±…ÍÌô‰Í•…É µ¡¥Ðˆ‘…Ñ„µÍ•…É µ­¥¹ôˆ‘í ¹­¥¹‘ôˆ‘…Ñ„µÍ•…É µ¥ôˆ‘í•ÍŒ¡ ¹¥¥ôˆøñÍÁ…¸±…ÍÌô‰Í•…É µ­¥¹ˆø‘í ¹­¥¹ôôôÁ½ÍÐœü¤Ù§†êýÐœé ¹­¥¹ôôôÁ•ÉÍ½¸œü#†îe¤Ù§©¸œè£†îœƒG†îôð½ÍÁ…¸øñÍÑÉ½¹œø‘í•ÍŒ¡ ¹Ñ¥Ñ±”¥ôð½ÍÑÉ½¹œø‘í ¹µ•Ñ„ý€ñ‘¥Ø±…ÍÌô‰µÕÑ•ˆø‘í•ÍŒ¡ ¹µ•Ñ„¥ôð½‘¥Øù€èØôð½‰ÕÑÑ½¸ù€¤¹©½¥¸ œœ¤èœñ‘¥Ø±…ÍÌô‰•µÁÑäˆù-£Ñ¹œÓ¡´Ñ£†ê•ä¯†êýÐÅ×†êŒ¸ð½‘¥Øøœì(€‰½à¹¡¥‘‘•¸õ™…±Í”ì œ±½‰…±M•…É œ¤¹Í•ÑÑÑÉ¥‰ÕÑ” …É¥„µ•áÁ…¹‘•œ°ÑÉÕ”œ¤ì(€€ œÍ•…É¡I•ÍÕ±ÑÌm‘…Ñ„µÍ•…É µ­¥¹‘tœ¤¹™½É… ¡ˆôùˆ¹½¹±¥¬ô ¤ôùí½¹ÍÐ­¥¹õˆ¹‘…Ñ…Í•Ð¹Í•…É¡-¥¹í¥˜¡¡¥¹ôôôÑ½Á¥Œœ¥¹…Ù¥…Ñ” ½µµÕ¹¥Ñäœ¤í•±Í”¥˜¡¡¥¹ôôôÁ•ÉÍ½¸œ¥¹…Ù¥…Ñ” ‘¥Í½Ù•Èœ¤í•±Í”¹…Ù¥…Ñ” ¡½µ”œ¤í‰½à¹¡¥‘‘•¸õÑÉÕ”ì œ±½‰…±M•…É œ¤¹Í•ÑÑÑÉ¥‰ÕÑ” …É¥„µ•áÁ…¹‘•œ°™…±Í”œ¥ô¤ì)ô)™Õ¹Ñ¥½¸ÉÕ¹ÍÍ¥ÍÑ…¹Ð ¥ì(€½¹ÍÐÄô œ…ÍÍ¥ÍÑ…¹ÑEÕ•Éäœ¤¹Ù…±Õ”¹ÑÉ¥´ ¤±½ÕÐô œ…ÍÍ¥ÍÑ…¹Ñ¹ÍÝ•Èœ¤í¥˜ …Ä¥É•ÑÕÉ¸ì(€½¹ÍÐÉ•ÍÕ±Ðõ…¹ÍÝ•É…‘•µ¥EÕ•Éä¡íÅÕ•ÉäéÄ±Í½ÕÉ•ÌéÍÑ…Ñ”¹……‘•µ¥M½ÕÉ•Íññmuô¤í½ÕÐ¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” µÕÑ•œ¤í½ÕÐ¹Ñ•áÑ½¹Ñ•¹Ðõ€‘íÉ•ÍÕ±Ð¹…¹ÍÝ•Éõq¹q¹9×†îM¸è€‘íÉ•ÍÕ±Ð¹¥Ñ…Ñ¥½¹Ì¹±•¹Ñ ýÉ•ÍÕ±Ð¹¥Ñ…Ñ¥½¹Ì¹©½¥¸ œ°€œ¤è£Á„Ì¹×†îM¸Á£ä£†îÀõq¸‘íÉ•ÍÕ±Ð¹Í…™•Ñåõ€í•µ¥ÑI•Í•…É  …ÍÍ¥ÍÑ…¹Ñ}ÅÕ•Éäœ±íÉ½Õ¹‘•éÉ•ÍÕ±Ð¹É½Õ¹‘•‘ô¤ì)ô)™Õ¹Ñ¥½¸É•¹‘•É•• ¥ì(€±•ÐÁ½ÍÑÌô¡ÍÑ…Ñ”¹Á½ÍÑÍññmt¤¹µ…À¡Àôø¡ì¸¸¹À±™½±±½Ý•‘ÕÑ¡½Èé™½±±½Ý•¡À¹…ÕÑ¡½É%¤±½µµ•¹ÑÌéÀ¹½µµ•¹ÑÍññmuô¤¤ì(€¥˜¡™••‘5½‘”ôôô™½±±½Ý¥¹œœ¥Á½ÍÑÌõÁ½ÍÑÌ¹™¥±Ñ•È¡ÀôùÀ¹ÍåÍÑ•µññÀ¹™½±±½Ý•‘ÕÑ¡½È¥í¥˜¡™••‘5½‘”ôôô±…Ñ•ÍÐœ¥Á½ÍÑÌõl¸¸¹Á½ÍÑÍt¹Í½ÉÐ ¡„±ˆ¤ôùˆ¹É•…Ñ•‘Ðµ„¹É•…Ñ•‘Ð¤í•±Í”Á½ÍÑÌõÉ…¹­••¡Á½ÍÑÌ¤ì(€€ œ™••œ¤¹¥¹¹•É!Q50õÁ½ÍÑÌ¹±•¹Ñ ýÁ½ÍÑÌ¹µ…À¡Á½ÍÑQ•µÁ±…Ñ”¤¹©½¥¸ œœ¤èœñ‘¥Ø±…ÍÌô‰…É•µÁÑä…ÉÑ½½¸µ…Éˆù£Á„Ì¹£†îe¤‘Õ¹œÁ£ä£†îÀ¸ð½‘¥Øøœí‰¥¹‘••‘Ù•¹ÑÌ ¤ì)ô)™Õ¹Ñ¥½¸Á½ÍÑQ•µÁ±…Ñ”¡À¥ì(€½¹ÍÐ•áÁ…¹‘•õ	½½±•…¸¡ÍÑ…Ñ”¹•áÁ…¹‘•‘½µµ•¹ÑÌü¹mÀ¹¥‘t¤±½µµ•¹ÑÌõÁÉ•Ù¥•Ý½µµ•¹ÑÌ¡À¹½µµ•¹ÑÌ±•áÁ…¹‘•¤±µåI•…Ñ¥½¸õÍÑ…Ñ”¹É•…Ñ¥½¹Ìü¹mÀ¹¥‘t±Í…Ù•ô¡ÍÑ…Ñ”¹‰½½­µ…É­Íññmt¤¹¥¹±Õ‘•Ì¡À¹¥¤ì(€É•ÑÕÉ¸€ñ…ÉÑ¥±”±…ÍÌô‰…ÉÁ½ÍÐ…ÉÑ½½¸µ…Éˆ‘…Ñ„µÁ½ÍÐôˆ‘í•ÍŒ¡À¹¥¥ôˆøñ¡•…‘•È±…ÍÌô‰Á½ÍÐµ¡•…ˆøñ‘¥Ø±…ÍÌô‰…Ù…Ñ…Èˆø‘í•ÍŒ ¡À¹…ÕÑ¡½É9…µ•ñðe œ¤¹ÍÁ±¥Ð ½qÌ¬¼¤¹Í±¥” ´È¤¹µ…À¡àôùálÁt¤¹©½¥¸ œœ¤¹Ñ½UÁÁ•É…Í” ¤¥ôð½‘¥Øøñ‘¥Ø±…ÍÌô‰Á½ÍÐµµ•Ñ„ˆøñÍÑÉ½¹œø‘í•ÍŒ¡À¹…ÕÑ¡½É9…µ”¥ôð½ÍÑÉ½¹œøñ‘¥Ø±…ÍÌô‰µÕÑ•ˆø‘í•ÍŒ¡À¹Ñ½Á¥Œ¥ôƒ
Ü€‘íÉ•±…Ñ¥Ù”¡À¹É•…Ñ•‘Ð¥ôð½‘¥Øøð½‘¥Øø‘ì…À¹ÍåÍÑ•´˜™À¹…ÕÑ¡½É%„ôõÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¹¥ý€ñ‰ÕÑÑ½¸±…ÍÌô‰‰Ñ¸¡½ÍÐˆ‘…Ñ„µ…Ñ¥½¸ô‰™½±±½Üˆø‘í™½±±½Ý•¡À¹…ÕÑ¡½É%¤üŸA…¹œÑ¡•¼“Õ¤œèQ¡•¼“Õ¤ôð½‰ÕÑÑ½¸ù€èœôð½¡•…‘•Èøñ‘¥Ø±…ÍÌô‰Á½ÍÐµ‰½‘äˆø‘í•ÍŒ¡À¹‰½‘ä¥ôð½‘¥Øø‘íÀ¹ÍåÍÑ•´üœ€œé€ñ‘¥Ø±…ÍÌô‰Á½ÍÐµ…Ñ¥½¹Ìˆøñ‰ÕÑÑ½¸‘…Ñ„µ…Ñ¥½¸ô‰É•…Ðˆ±…ÍÌôˆ‘íµåI•…Ñ¥½¸ü½¸œèœôˆûŠf”€‘í9Õµ‰•È¡À¹±¥­•ÍñðÀ¤¬¡µåI•…Ñ¥½¸üÄèÀ¥ôð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸‘…Ñ„µ…Ñ¥½¸ô‰™½ÕÌµ½µµ•¹ÐˆûÂ~J°€‘íÀ¹½µµ•¹ÑÌ¹±•¹Ñ¡ôð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸‘…Ñ„µ…Ñ¥½¸ô‰‰½½­µ…É¬ˆ±…ÍÌôˆ‘íÍ…Ù•ü½¸œèœôˆûŠZì€‘íÍ…Ù•üŸCŒ³ÁÔœè3ÁÔôð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸‘…Ñ„µ…Ñ¥½¸ô‰Í¡…É”ˆûŠ\¡¥„Ï†êìð½‰ÕÑÑ½¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰½µµ•¹ÑÌˆø‘í½µµ•¹ÑÌ¹µ…À¡Œôù€ñ‘¥Ø±…ÍÌô‰½µµ•¹Ðˆøñ‘¥Ø±…ÍÌô‰…Ù…Ñ…ÈˆÍÑå±”ô‰Ý¥‘Ñ èÌÉÁàí¡•¥¡ÐèÌÉÁàí‰½É‘•ÈµÉ…‘¥ÕÌèÄÁÁàˆø‘í•ÍŒ ¡Œ¹…ÕÑ¡½Éñðe œ¤¹Í±¥” À°È¤¹Ñ½UÁÁ•É…Í” ¤¥ôð½‘¥Øøñ‘¥Ø±…ÍÌô‰‰Õ‰‰±”ˆøñÍÑÉ½¹œø‘í•ÍŒ¡Œ¹…ÕÑ¡½Éñð#†îe¤Ù§©¸œ¥ôð½ÍÑÉ½¹œøñ‘¥Øø‘í•ÍŒ¡Œ¹‰½‘åñðœœ¥ôð½‘¥Øøð½‘¥Øøð½‘¥Øù€¤¹©½¥¸ œœ¥ô‘íÀ¹½µµ•¹ÑÌ¹±•¹Ñ øÌý€ñ‰ÕÑÑ½¸±…ÍÌô‰‰Ñ¸¡½ÍÐˆ‘…Ñ„µ…Ñ¥½¸ô‰Ñ½±”µ½µµ•¹ÑÌˆø‘í•áÁ…¹‘•üQ¡ÔŸ†î5¸œéa•´Ñ£©´€‘íÀ¹½µµ•¹ÑÌ¹±•¹Ñ ´Íô‹±¹ ±×†êµ¹ôð½‰ÕÑÑ½¸ù€èœôñ‘¥Ø±…ÍÌô‰½µµ•¹Ðµ½µÁ½Í”ˆøñÑ•áÑ…É•„…É¥„µ±…‰•°ô‰±¹ ±×†êµ¸ˆÁ±…•¡½±‘•Èô‰Y§†êýÐ‹±¹ ±×†êµ¸¸¸ˆøð½Ñ•áÑ…É•„øñ‰ÕÑÑ½¸±…ÍÌô‰‰Ñ¸ˆ‘…Ñ„µ…Ñ¥½¸ô‰•µ½©¤ˆûÂ~b(ð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰‰Ñ¸ÁÉ¥µ…Éäˆ‘…Ñ„µ…Ñ¥½¸ô‰Í•¹µ½µµ•¹Ðˆù†îµ¤ð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øùôð½…ÉÑ¥±”ù€ì)ô)™Õ¹Ñ¥½¸‰¥¹‘••‘Ù•¹ÑÌ ¥ì(€€ œ™••m‘…Ñ„µ…Ñ¥½¹tœ¤¹™½É… ¡‰Ñ¸ôù‰Ñ¸¹½¹±¥¬õ…Íå¹Œ ¤ôùì(€€€½¹ÍÐ…Éõ‰Ñ¸¹±½Í•ÍÐ m‘…Ñ„µÁ½ÍÑtœ¤±¥õ…É¹‘…Ñ…Í•Ð¹Á½ÍÐ±Àô¡ÍÑ…Ñ”¹Á½ÍÑÍññmt¤¹™¥¹¡àôùà¹¥ôôõ¥¤í¥˜ …À¥É•ÑÕÉ¸ì(€€€ÍÝ¥Ñ ¡‰Ñ¸¹‘…Ñ…Í•Ð¹…Ñ¥½¸¥ì(€€€€€…Í”™½±±½ÜœéÍÑ…Ñ”¹™½±±½Ý•‘A•½Á±”õÑ½±•M•Ñ%Ñ•´¡ÍÑ…Ñ”¹™½±±½Ý•‘A•½Á±•ññmt±À¹…ÕÑ¡½É%¤í‰É•…¬ì(€€€€€…Í”É•…ÐœéÍÑ…Ñ”¹É•…Ñ¥½¹ÌõÑ½±•I•…Ñ¥½¸¡ÍÑ…Ñ”¹É•…Ñ¥½¹Íññíô±¥°¡•…ÉÐœ¤í‰É•…¬ì(€€€€€…Í”‰½½­µ…É¬œéÍÑ…Ñ”¹‰½½­µ…É­ÌõÑ½±•M•Ñ%Ñ•´¡ÍÑ…Ñ”¹‰½½­µ…É­Íññmt±¥¤í‰É•…¬ì(€€€€€…Í”™½ÕÌµ½µµ•¹Ðœè œ¹½µµ•¹Ðµ½µÁ½Í”Ñ•áÑ…É•„œ±…É¤ü¹™½ÕÌ ¤íÉ•ÑÕÉ¸ì(€€€€€…Í”•µ½©¤œéí½¹ÍÐÐô œ¹½µµ•¹Ðµ½µÁ½Í”Ñ•áÑ…É•„œ±…É¤íÐ¹Ù…±Õ”¬ôŸÂ~b(œíÐ¹™½ÕÌ ¤íÉ•ÑÕÉ¹ô(€€€€€…Í”Ñ½±”µ½µµ•¹ÑÌœéÍÑ…Ñ”¹•áÁ…¹‘•‘½µµ•¹ÑÌõì¸¸¸¡ÍÑ…Ñ”¹•áÁ…¹‘•‘½µµ•¹ÑÍññíô¤±m¥‘tè…ÍÑ…Ñ”¹•áÁ…¹‘•‘½µµ•¹ÑÌü¹m¥‘uôí‰É•…¬ì(€€€€€…Í”Í¡…É”œéÑÉåí…Ý…¥Ð¹…Ù¥…Ñ½È¹±¥Á‰½…É¹ÝÉ¥Ñ•Q•áÐ¡±½…Ñ¥½¸¹¡É•˜¬œŒœ­¥¥õ…Ñ¡íõÉ•ÑÕÉ¸ì(€€€€€…Í”Í•¹µ½µµ•¹Ðœé…Ý…¥ÐÍ•¹‘½µµ•¹Ð¡…É±À¤íÉ•ÑÕÉ¸ì(€€€ô(€€€…Ý…¥ÐÉ•Á¼¹Á…Ñ ¡ÍÑ…Ñ”¤íÉ•¹‘•É±° ¤ì(€ô¤ì(€€ œ™••€¹½µµ•¹Ðµ½µÁ½Í”Ñ•áÑ…É•„œ¤¹™½É… ¡ÐôùÐ¹½¹­•å‘½Ý¸õ”ôùí¥˜¡”¹­•äôôô¹Ñ•Èœ˜˜…”¹Í¡¥™Ñ-•ä¥í”¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤íÐ¹±½Í•ÍÐ œ¹Á½ÍÐœ¤¹ÅÕ•ÉåM•±•Ñ½È m‘…Ñ„µ…Ñ¥½¸ô‰Í•¹µ½µµ•¹Ð‰tœ¤¹±¥¬ ¥õô¤ì)ô)…Íå¹Œ™Õ¹Ñ¥½¸Í•¹‘½µµ•¹Ð¡…É±À¥ì(€½¹ÍÐÐô œ¹½µµ•¹Ðµ½µÁ½Í”Ñ•áÑ…É•„œ±…É¤±‰½‘äõÐ¹Ù…±Õ”¹ÑÉ¥´ ¤í¥˜ …‰½‘ä¥É•ÑÕÉ¸ì(€½¹ÍÐÉ¥Í¬õ…ÍÍ•ÍÍ½¹Ñ•¹ÑI¥Í¬¡‰½‘ä¤í¥˜¡É¥Í¬¹±•Ù•°ôôô¡¥ œ˜˜…½¹™¥É´ ;†îe¤‘Õ¹œÌÑ£†î£†î¥„ÑÕç©¸ä­¡½„Ë†î¤É¼…¼¸†îµ¤Û¼£¹œ£†ît­§†î´‘Õç†îÐüœ¤¥É•ÑÕÉ¸ì(€½¹ÍÐÕÁ‘…Ñ•õ…‘‘½µµ•¹Ð¡À±í¥èŒœ­…Ñ”¹¹½Ü ¤±…ÕÑ¡½ÈéÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¹¹…µ”±‰½‘ä±…Ðé…Ñ”¹¹½Ü ¤±µ½‘•É…Ñ¥½¸éÉ¥Í­ô¤ì(€ÍÑ…Ñ”¹Á½ÍÑÌõÍÑ…Ñ”¹Á½ÍÑÌ¹µ…À¡àôùà¹¥ôôõÀ¹¥ýÕÁ‘…Ñ•éà¤ì(€ÍÑ…Ñ”¹¹½Ñ¥™¥…Ñ¥½¹Ìõµ•É•9½Ñ¥™¥…Ñ¥½¹Ì¡ÍÑ…Ñ”¹¹½Ñ¥™¥…Ñ¥½¹Íññmt±mí¥è¸œ­…Ñ”¹¹½Ü ¤±ÑåÁ”è½µµ•¹Ðœ±Ñ•áÐè±¹ ±×†êµ¸†î„‹†ê…¸ƒGŒƒGÃ†îŒ¡¤¹£†êµ¸œ±…Ðé…Ñ”¹¹½Ü ¤±É•…é™…±Í•õt¤ì(€…Ý…¥ÐÉ•Á¼¹Á…Ñ ¡ÍÑ…Ñ”¤í…Ý…¥ÐÅÕ•Õ•=Á•É…Ñ¥½¸ ½µµ•¹ÐéÉ•…Ñ”œ±íÁ½ÍÑ%éÀ¹¥±½µµ•¹Ñ%éÕÁ‘…Ñ•¹½µµ•¹ÑÌ¹…Ð ´Ä¤¹¥‘ô¤íÉ•¹‘•É±° ¤ì)ô)…Íå¹Œ™Õ¹Ñ¥½¸ÁÕ‰±¥Í  ¥ì(€½¹ÍÐ¥¹ÁÕÐô œÁ½ÍÑ%¹ÁÕÐœ¤±‰½‘äõ¥¹ÁÕÐ¹Ù…±Õ”¹ÑÉ¥´ ¤í¥˜ …‰½‘ä¥É•ÑÕÉ¸ì(€½¹ÍÐÉ¥Í¬õ…ÍÍ•ÍÍ½¹Ñ•¹ÑI¥Í¬¡‰½‘ä¤í¥˜¡É¥Í¬¹±•Ù•°ôôô¡¥ œ˜˜…½¹™¥É´ ¤Ù§†êýÐÌÑ£†î£†î¥„ÑÕç©¸‹†îDä­¡½„Ë†î¤É¼…¼Û€Ï†êôƒGÃ†îŒƒGÁ„Û¼£¹œ£†ît¸Q§†êýÀÓ†î•Œüœ¤¥É•ÑÕÉ¸ì(€½¹ÍÐÁ½ÍÐõÉ•…Ñ•A½ÍÐ¡í¥èÀœ­…Ñ”¹¹½Ü ¤±…ÕÑ¡½É%éÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¹¥±…ÕÑ¡½É9…µ”éÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¹¹…µ”±‰½‘ä±Ñ½Á¥Œè œÁ½ÍÑQ½Á¥Œœ¤¹Ù…±Õ”±É•…Ñ•‘Ðé…Ñ”¹¹½Ü ¥ô¤íÁ½ÍÐ¹µ½‘•É…Ñ¥½¸õÉ¥Í¬ì(€ÍÑ…Ñ”¹Á½ÍÑÌõmÁ½ÍÐ°¸¸¹ÍÑ…Ñ”¹Á½ÍÑÍtíÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•Èõì¸¸¹ÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È±ÍÑ…ÑÌéì¸¸¹ÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¹ÍÑ…ÑÌ±Á½ÍÑÌè¡ÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¹ÍÑ…ÑÌü¹Á½ÍÑÍñðÀ¤¬Åõôì(€…Ý…¥ÐÉ•Á¼¹Á…Ñ ¡ÍÑ…Ñ”¤í…Ý…¥ÐÅÕ•Õ•=Á•É…Ñ¥½¸ Á½ÍÐéÉ•…Ñ”œ±íÁ½ÍÑ%éÁ½ÍÐ¹¥‘ô¤í¥¹ÁÕÐ¹Ù…±Õ”ôœœíÉ•¹‘•É±° ¤ì)ô)™Õ¹Ñ¥½¸É•¹‘•É½µµÕ¹¥Ñä ¥ì(€½¹ÍÐÑ½Á¥Ìõl£‰´†î¥Ôœ°Ã†îŒ±§†îÔœ°#†î5ŒÑ¡×†êµÐœ°!¿†ê…ÐƒG†îe¹œœ°†îe¹œƒG†îM¹œtì(€€ œÑ½Á¥É¥œ¤¹¥¹¹•É!Q50õÑ½Á¥Ì¹µ…À¡Ñ½Á¥Œôùí½¹ÍÐÍÐõÑ½Á¥MÑ…ÑÌ¡ÍÑ…Ñ”¹Á½ÍÑÍññmt±Ñ½Á¥Œ¤±½¸ô¡ÍÑ…Ñ”¹™½±±½Ý•‘Q½Á¥Íññmt¤¹¥¹±Õ‘•Ì¡Ñ½Á¥Œ¤íÉ•ÑÕÉ¸€ñ…ÉÑ¥±”±…ÍÌô‰Ñ½Á¥Œµ…ÉˆøñÍÁ…¸±…ÍÌô‰Ñ½Á¥Œˆø‘í•ÍŒ¡Ñ½Á¥Œ¥ôð½ÍÁ…¸øñ Ìø‘í•ÍŒ¡Ñ½Á¥Œ¥ôð½ ÌøñÀ±…ÍÌô‰µÕÑ•ˆø‘íÍÐ¹Á½ÍÑÍô‹¤ƒ
Ü€‘íÍÐ¹½µµ•¹ÑÍô‹±¹ ±×†êµ¸ð½Àøñ‰ÕÑÑ½¸±…ÍÌô‰‰Ñ¸€‘í½¸üÁÉ¥µ…Éäœèœôˆ‘…Ñ„µÑ½Á¥Œôˆ‘í•ÍŒ¡Ñ½Á¥Œ¥ôˆø‘í½¸üŸA…¹œÑ¡•¼“Õ¤œèQ¡•¼“Õ¤£†îœƒG†îôð½‰ÕÑÑ½¸øð½…ÉÑ¥±”ùô¤¹©½¥¸ œœ¤ì(€€ m‘…Ñ„µÑ½Á¥tœ¤¹™½É… ¡ˆôùˆ¹½¹±¥¬õ…Íå¹Œ ¤ôùíÍÑ…Ñ”õ™½±±½ÝQ½Á¥Œ¡ì¸¸¹ÍÑ…Ñ”±™½±±½Ý•‘Q½Á¥ÌéÍÑ…Ñ”¹™½±±½Ý•‘Q½Á¥Íññmuô±ˆ¹‘…Ñ…Í•Ð¹Ñ½Á¥Œ¤í…Ý…¥ÐÉ•Á¼¹Á…Ñ ¡í™½±±½Ý•‘Q½Á¥ÌéÍÑ…Ñ”¹™½±±½Ý•‘Q½Á¥Íô¤íÉ•¹‘•É½µµÕ¹¥Ñä ¥ô¤ì(€€ œÉ½ÕÁÉ¥œ¤¹¥¹¹•É!Q50ô¡ÍÑ…Ñ”¹É½ÕÁÍññmt¤¹±•¹Ñ ü¡ÍÑ…Ñ”¹É½ÕÁÍññmt¤¹µ…À¡œôùí½¹ÍÐ©½¥¹•ô¡œ¹µ•µ‰•ÉÍññmt¤¹¥¹±Õ‘•Ì¡ÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¹¥¤íÉ•ÑÕÉ¸€ñ…ÉÑ¥±”±…ÍÌô‰Ñ½Á¥Œµ…ÉˆøñÍÁ…¸±…ÍÌô‰Ñ½Á¥Œˆù9#M4ð½ÍÁ…¸øñ Ìø‘í•ÍŒ¡œ¹¹…µ”¥ôð½ ÌøñÀ±…ÍÌô‰µÕÑ•ˆø‘í•ÍŒ¡œ¹‘•ÍÉ¥ÁÑ¥½¹ñðœœ¥ôƒ
Ü€‘ì¡œ¹µ•µ‰•ÉÍññmt¤¹±•¹Ñ¡ôÑ£¹ Ù§©¸ð½Àøñ‰ÕÑÑ½¸±…ÍÌô‰‰Ñ¸€‘í©½¥¹•üÁÉ¥µ…Éäœèœôˆ‘…Ñ„µÉ½ÕÀôˆ‘í•ÍŒ¡œ¹¥¥ôˆ€‘í©½¥¹•ü‘¥Í…‰±•œèœôø‘í©½¥¹•üŸCŒÑ¡…´¥„œèQ¡…´¥„¹£Í´ôð½‰ÕÑÑ½¸øð½…ÉÑ¥±”ùô¤¹©½¥¸ œœ¤èœñ‘¥Ø±…ÍÌô‰…É•µÁÑä…ÉÑ½½¸µ…Éˆù£Á„Ì¹£Í´¡Õç©¸·Ñ¸¸9£Í´Ï†êôƒGÃ†îŒÓ†ê…¼‹†î}¤ƒG†îe¤ƒE§†îÔ£¹ Ñ¡•¼¹¡Ô†êÔÑ£†îÅŒÓ†êü¸ð½‘¥Øøœì(€€ m‘…Ñ„µÉ½ÕÁtœ¤¹™½É… ¡ˆôùˆ¹½¹±¥¬õ…Íå¹Œ ¤ôùí½¹ÍÐœô¡ÍÑ…Ñ”¹É½ÕÁÍññmt¤¹™¥¹¡àôùà¹¥ôôõˆ¹‘…Ñ…Í•Ð¹É½ÕÀ¤í¥˜ …œ¥É•ÑÕÉ¸íÍÑ…Ñ”¹É½ÕÁÌõÍÑ…Ñ”¹É½ÕÁÌ¹µ…À¡àôùà¹¥ôôõœ¹¥ý©½¥¹É½ÕÀ¡œ±ÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¹¥¤éà¤í…Ý…¥ÐÉ•Á¼¹Á…Ñ ¡íÉ½ÕÁÌéÍÑ…Ñ”¹É½ÕÁÍô¤í…Ý…¥ÐÅÕ•Õ•=Á•É…Ñ¥½¸ É½ÕÀé©½¥¸œ±íÉ½ÕÁ%éœ¹¥‘ô¤íÉ•¹‘•É½µµÕ¹¥Ñä ¥ô¤ì(€½¹ÍÐÉ•…±Q¡É•…‘ÌõÉ…¹­QÉ•¹‘¥¹œ ¡ÍÑ…Ñ”¹Á½ÍÑÍññmt¤¹™¥±Ñ•È¡Àôø…À¹ÍåÍÑ•´¤¤ì(€€ œ½µµÕ¹¥ÑåQ¡É•…‘Ìœ¤¹¥¹¹•É!Q50õÉ•…±Q¡É•…‘Ì¹±•¹Ñ ýÉ•…±Q¡É•…‘Ì¹Í±¥” À°Ð¤¹µ…À¡Àôù€ñ‘¥Ø±…ÍÌô‰ÑÉ•¹ˆøñÍÑÉ½¹œø‘í•ÍŒ¡À¹‰½‘ä¹Í±¥” À°äÔ¤¥ô‘íÀ¹‰½‘ä¹±•¹Ñ øäÔüŸŠ˜œèœôð½ÍÑÉ½¹œøñ‘¥Ø±…ÍÌô‰µÕÑ•ˆø‘í•ÍŒ¡À¹Ñ½Á¥Œ¥ôƒ
Ü€‘íÀ¹½µµ•¹ÑÌü¹±•¹Ñ¡ñðÁôÁ£†ê¸£†îM¤ð½‘¥Øøð½‘¥Øù€¤¹©½¥¸ œœ¤èœñ‘¥Ø±…ÍÌô‰•µÁÑäˆù£Á„ÌÑ£†ê¼±×†êµ¸Ñ£¹ Ù§©¸¸ð½‘¥Øøœì)ô)™Õ¹Ñ¥½¸É•¹‘•É¥Í½Ù•È ¥ì(€½¹ÍÐÑÉ•¹‘¥¹œõÉ…¹­QÉ•¹‘¥¹œ ¡ÍÑ…Ñ”¹Á½ÍÑÍññmt¤¹™¥±Ñ•È¡Àôø…À¹ÍåÍÑ•´¤¤ì(€€ œ‘¥Í½Ù•ÉA½ÍÑÌœ¤¹¥¹¹•É!Q50õÑÉ•¹‘¥¹œ¹±•¹Ñ ýÑÉ•¹‘¥¹œ¹µ…À¡Àôù€ñ‘¥Ø±…ÍÌô‰ÑÉ•¹ˆøñÍÁ…¸±…ÍÌô‰Ñ½Á¥Œˆø‘í•ÍŒ¡À¹Ñ½Á¥Œ¥ôð½ÍÁ…¸øñÍÑÉ½¹œÍÑå±”ô‰‘¥ÍÁ±…äé‰±½¬íµ…É¥¸µÑ½ÀèÕÁàˆø‘í•ÍŒ¡À¹‰½‘ä¥ôð½ÍÑÉ½¹œøñ‘¥Ø±…ÍÌô‰µÕÑ•ˆûŠf”€‘íÀ¹±¥­•ÍñðÁôƒ
ÜƒÂ~J°€‘íÀ¹½µµ•¹ÑÌü¹±•¹Ñ¡ñðÁôð½‘¥Øøð½‘¥Øù€¤¹©½¥¸ œœ¤èœñ‘¥Ø±…ÍÌô‰•µÁÑäˆù£Á„Ì»†îe¤‘Õ¹œÑ£¹ Ù§©¸ƒG†îã†êýÀ£†ê…¹œ¸ð½‘¥Øøœì(€½¹ÍÐÁ•½Á±”ô¡ÍÑ…Ñ”¹Á•½Á±•ññmt¤¹™¥±Ñ•È¡ÀôùÀ¹¥„ôõÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¹¥¤¹Í±¥” À°ÌÀ¤ì(€€ œÁ•½Á±•É¥œ¤¹¥¹¹•É!Q50õÁ•½Á±”¹µ…À¡Àôù€ñ…ÉÑ¥±”±…ÍÌô‰Á•ÉÍ½¸µ…Éˆøñ‘¥Ø±…ÍÌô‰…Ù…Ñ…Èˆø‘í•ÍŒ¡À¹…Ù…Ñ…È¥ôð½‘¥Øøñ Ìø‘í•ÍŒ¡À¹¹…µ”¥ôð½ Ìøñ‘¥Ø±…ÍÌô‰µÕÑ•ˆø‘í•ÍŒ¡À¹Á½Í¥Ñ¥½¹ññÀ¹ÍÁ•¥…±Ñä¥ôð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÌô‰‰Ñ¸€‘í™½±±½Ý•¡À¹¥¤üÁÉ¥µ…Éäœèœôˆ‘…Ñ„µÁ•ÉÍ½¸ôˆ‘íÀ¹¥‘ôˆø‘í™½±±½Ý•¡À¹¥¤üŸA…¹œÑ¡•¼“Õ¤œèQ¡•¼“Õ¤ôð½‰ÕÑÑ½¸øð½…ÉÑ¥±”ù€¤¹©½¥¸ œœ¤ì(€€ m‘…Ñ„µÁ•ÉÍ½¹tœ¤¹™½É… ¡ˆôùˆ¹½¹±¥¬õ…Íå¹Œ ¤ôùíÍÑ…Ñ”¹™½±±½Ý•‘A•½Á±”õÑ½±•M•Ñ%Ñ•´¡ÍÑ…Ñ”¹™½±±½Ý•‘A•½Á±•ññmt±ˆ¹‘…Ñ…Í•Ð¹Á•ÉÍ½¸¤í…Ý…¥ÐÉ•Á¼¹Á…Ñ ¡í™½±±½Ý•‘A•½Á±”éÍÑ…Ñ”¹™½±±½Ý•‘A•½Á±•ô¤íÉ•¹‘•É±° ¥ô¤ì)ô)™Õ¹Ñ¥½¸É•¹‘•É9½Ñ¥™¥…Ñ¥½¹Ì ¥ì(€€ œ¹½Ñ¥•½Õ¹Ðœ¤¹Ñ•áÑ½¹Ñ•¹ÐõÕ¹É•…‘½Õ¹Ð¡ÍÑ…Ñ”¹¹½Ñ¥™¥…Ñ¥½¹Íññmt¤ì(€€ œ¹½Ñ¥•1¥ÍÐœ¤¹¥¹¹•É!Q50ô¡ÍÑ…Ñ”¹¹½Ñ¥™¥…Ñ¥½¹Íññmt¤¹±•¹Ñ ü¡ÍÑ…Ñ”¹¹½Ñ¥™¥…Ñ¥½¹Íññmt¤¹µ…À¡¸ôù€ñ‘¥Ø±…ÍÌô‰¹½Ñ¥”€‘í¸¹É•…üœœèÕ¹É•…ôˆø‘í¸¹É•…üœœèœñÍÁ…¸±…ÍÌô‰¹½Ñ¥”µ‘½Ðˆøð½ÍÁ…¸øôñ‘¥ØøñÍÑÉ½¹œø‘í•ÍŒ¡¸¹Ñ•áÐ¥ôð½ÍÑÉ½¹œøñ‘¥Ø±…ÍÌô‰µÕÑ•ˆø‘íÉ•±…Ñ¥Ù”¡¸¹…Ð¥ôð½‘¥Øøð½‘¥Øøð½‘¥Øù€¤¹©½¥¸ œœ¤èœñ‘¥Ø±…ÍÌô‰•µÁÑäˆù-£Ñ¹œÌÑ£Ñ¹œ‹…¼·†îm¤¸ð½‘¥Øøœì)ô)™Õ¹Ñ¥½¸É•¹‘•ÉAÉ½™¥±” ¥ì(€½¹ÍÐÀõ‘•É¥Ù•AÉ½™¥±•AÉ½É•ÍÌ¡ÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¹ÍÑ…ÑÍññíô¤ì œ‰…‘•Ìœ¤¹¥¹¹•É!Q50õÀ¹‰…‘•Ì¹µ…À¡ˆôù€ñÍÁ…¸±…ÍÌô‰‰…‘”ˆûŠr˜€‘í•ÍŒ¡ˆ¥ôð½ÍÁ…¸ù€¤¹©½¥¸ œœ¥ñðœñÍÁ…¸±…ÍÌô‰‰…‘”ˆûÂ~2üQ£¹ Ù§©¸e!PM=%0ð½ÍÁ…¸øœì(€½¹ÍÐÌõÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¹ÍÑ…ÑÍññíôì œÁÉ½™¥±•MÑ…ÑÌœ¤¹¥¹¹•É!Q50õml¤Ù§†êýÐœ±Ì¹Á½ÍÑÍñðÁt±l‰ÔÑË†êŒ³†îu¤ƒGÃ†îŒ£†î5¸œ±Ì¹…•ÁÑ•‘¹ÍÝ•ÉÍñðÁt±l#†î½Ôƒµ œ±Ì¹¡•±Á™Õ±I•…Ñ¥½¹ÍñðÁt±lO†îÄ­§†î¸œ±Ì¹•Ù•¹ÑÍ)½¥¹•‘ñðÁut¹µ…À ¡m¬±Ùt¤ôù€ñ‘¥Ø±…ÍÌô‰ÍÑ…Ðˆøñ‘¥Ø±…ÍÌô‰µÕÑ•ˆø‘í­ôð½‘¥ØøñÍÑÉ½¹œÍÑå±”ô‰™½¹ÐµÍ¥é”èÈÑÁàˆø‘íÙôð½ÍÑÉ½¹œøð½‘¥Øù€¤¹©½¥¸ œœ¤ì(€½¹ÍÐÁÉ•Øô¡À¹±•Ù•°´Ä¤¨ÔÀ±Á•É•¹Ðõ5…Ñ ¹µ¥¸ ÄÀÀ±5…Ñ ¹µ…à À°¡À¹Á½¥¹ÑÌµÁÉ•Ø¤¼¡À¹¹•áÑ1•Ù•±ÐµÁÉ•Ø¤¨ÄÀÀ¤¤ì œ±•Ù•±AÉ½É•ÍÌœ¤¹ÍÑå±”¹Ý¥‘Ñ õÁ•É•¹Ð¬œ”œì œ±•Ù•±Q•áÐœ¤¹Ñ•áÑ½¹Ñ•¹Ðõ†ê•À€‘íÀ¹±•Ù•±ôƒ
Ü€‘íÀ¹Á½¥¹ÑÍôƒE§†î´ƒGÍ¹œŸÍÀƒ
Ü·†îEŒÑ§†êýÀÑ¡•¼€‘íÀ¹¹•áÑ1•Ù•±Ñõ€ì)ô)™Õ¹Ñ¥½¸É•¹‘•ÉI¥¡Ð ¥ì(€½¹ÍÐ½Õ¹ÑÌõíôí™½È¡½¹ÍÐÀ½˜€¡ÍÑ…Ñ”¹Á½ÍÑÍññmt¤¹™¥±Ñ•È¡àôø…à¹ÍåÍÑ•´¤¥½Õ¹ÑÍmÀ¹Ñ½Á¥tô¡½Õ¹ÑÍmÀ¹Ñ½Á¥uñðÀ¤¬Äì(€€ œÑÉ•¹‘Q½Á¥Ìœ¤¹¥¹¹•É!Q50õ=‰©•Ð¹­•åÌ¡½Õ¹ÑÌ¤¹±•¹Ñ ý=‰©•Ð¹•¹ÑÉ¥•Ì¡½Õ¹ÑÌ¤¹Í½ÉÐ ¡„±ˆ¤ôù‰lÅtµ…lÅt¤¹µ…À ¡m¬±Ùt¤ôù€ñ‘¥Ø±…ÍÌô‰ÑÉ•¹ˆøñÍÑÉ½¹œøŒ‘í•ÍŒ¡¬¥ôð½ÍÑÉ½¹œøñ‘¥Ø±…ÍÌô‰µÕÑ•ˆø‘íÙô‹¤Ñ£†ê¼±×†êµ¸ð½‘¥Øøð½‘¥Øù€¤¹©½¥¸ œœ¤èœñ‘¥Ø±…ÍÌô‰•µÁÑäˆù£Á„ÌáÔ£Ã†îm¹œ¸ð½‘¥Øøœì(€€ œ•Ù•¹Ñ1¥ÍÐœ¤¹¥¹¹•É!Q50ô¡ÍÑ…Ñ”¹•Ù•¹ÑÍññmt¤¹±•¹Ñ ü¡ÍÑ…Ñ”¹•Ù•¹ÑÍññmt¤¹µ…À¡”ôù€ñ‘¥Ø±…ÍÌô‰•Ù•¹Ðˆøñ‘¥Ø±…ÍÌô‰•Ù•¹Ðµ‘…Ñ”ˆø‘í•ÍŒ¡”¹‘…Ñ”¥ôð½‘¥Øøñ‘¥ØøñÍÑÉ½¹œø‘í•ÍŒ¡”¹Ñ¥Ñ±”¥ôð½ÍÑÉ½¹œøñ‘¥Ø±…ÍÌô‰µÕÑ•ˆø‘í•ÍŒ¡”¹µ•Ñ„¥ôð½‘¥Øøð½‘¥Øøð½‘¥Øù€¤¹©½¥¸ œœ¤èœñ‘¥Ø±…ÍÌô‰•µÁÑäˆù£Á„Ì¡¿†ê…ÐƒG†îe¹œƒGÃ†îŒƒG¹œ¸ð½‘¥Øøœì)ô)™Õ¹Ñ¥½¸É•¹‘•É±° ¥í¥˜ …Í•ÍÍ¥½¹ñð…ÍÑ…Ñ”¹ÕÉÉ•¹ÑUÍ•È¥É•ÑÕÉ¸íÉ•¹‘•É%‘•¹Ñ¥Ñä ¤íÉ•¹‘•ÉMå¹MÑ…ÑÕÌ ¤íÉ•¹‘•É•• ¤íÉ•¹‘•É½µµÕ¹¥Ñä ¤íÉ•¹‘•É¥Í½Ù•È ¤íÉ•¹‘•É9½Ñ¥™¥…Ñ¥½¹Ì ¤íÉ•¹‘•É5•ÍÍ…•Ì ¤íÉ•¹‘•ÉAÉ½™¥±” ¤íÉ•¹‘•ÉI¥¡Ð ¥ô)™Õ¹Ñ¥½¸É•±…Ñ¥Ù”¡…Ð¥í½¹ÍÐ´õ5…Ñ ¹µ…à Ä±5…Ñ ¹™±½½È ¡…Ñ”¹¹½Ü ¤µ9Õµ‰•È¡…ÑñðÀ¤¤¼ØÀÀÀÀ¤¤íÉ•ÑÕÉ¸´ðØÀý€‘íµôÁ£éÐÑËÃ†îm€é´ðÄÐÐÀý€‘í5…Ñ ¹™±½½È¡´¼ØÀ¥ô§†îtÑËÃ†îm€é€‘í5…Ñ ¹™±½½È¡´¼ÄÐÐÀ¥ô¹ŸäÑËÃ†îmô)™Õ¹Ñ¥½¸±½Í•5½‰¥±•5½É” ¥í½¹ÍÐµ•¹Ôô œµ½‰¥±•5½É•5•¹Ôœ¤±µ½É”ô m‘…Ñ„µ…Ñ¥½¸ô‰µ½‰¥±”µµ½É”‰tœ¤í¥˜¡µ•¹Ô¥µ•¹Ô¹¡¥‘‘•¸õÑÉÕ”í¥˜¡µ½É”¥µ½É”¹Í•ÑÑÑÉ¥‰ÕÑ” …É¥„µ•áÁ…¹‘•œ°™…±Í”œ¥ô)™Õ¹Ñ¥½¸¹…Ù¥…Ñ”¡É½ÕÑ”¥ì œ¹Á…”œ¤¹™½É… ¡ÀôùÀ¹±…ÍÍ1¥ÍÐ¹Ñ½±” …Ñ¥Ù”œ±À¹¥ôôõÁ…”´‘íÉ½ÕÑ•õ€¤¤ì m‘…Ñ„µÉ½ÕÑ•tœ¤¹™½É… ¡ˆôùˆ¹±…ÍÍ1¥ÍÐ¹Ñ½±” …Ñ¥Ù”œ±ˆ¹‘…Ñ…Í•Ð¹É½ÕÑ”ôôõÉ½ÕÑ”¤¤í¡¥ÍÑ½Éä¹É•Á±…•MÑ…Ñ”¡¹Õ±°°œœ±É½ÕÑ”ôôô¡½µ”œüœ½å¡ÐµÍ½¥…°¼œé€½å¡ÐµÍ½¥…°¼Œ‘íÉ½ÕÑ•õ€¥ô(