const $ = id => document.getElementById(id);
const state = { stream: null, image: '', mimeType: 'image/jpeg', qc: null, analysis: null, serverKey: false };
const els = {
  health: $('healthBadge'), video: $('video'), preview: $('preview'), empty: $('emptyState'), camera: $('cameraBtn'), capture: $('captureBtn'), file: $('fileInput'), reset: $('resetBtn'), qcPanel: $('qcPanel'), qcChips: $('qcChips'), analyze: $('analyzeBtn'), resultCard: $('resultCard'), resultGrid: $('resultGrid'), summary: $('summaryText'), confidence: $('confidenceBadge'), model: $('modelLabel'), report: $('reportBtn'), reportBox: $('reportBox'), chatForm: $('chatForm'), chatInput: $('chatInput'), chatLog: $('chatLog'), settings: $('settingsBtn'), dialog: $('settingsDialog'), key: $('geminiKeyInput'), saveKey: $('saveKeyBtn'), clearKey: $('clearKeyBtn'), canvas: $('workCanvas')
};

function getLocalKey(){ return localStorage.getItem('aiThietChanGeminiKey') || ''; }
function setHealth(text, cls=''){ els.health.textContent = text; els.health.className = `status-pill ${cls}`.trim(); }
function stopCamera(){ if(state.stream){ state.stream.getTracks().forEach(t=>t.stop()); state.stream=null; } els.video.srcObject=null; els.video.hidden=true; els.capture.hidden=true; els.camera.textContent='Mở camera'; }
function escapeHtml(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function appendBubble(text, who='bot'){ const div=document.createElement('div'); div.className=`bubble ${who}`; div.textContent=text; els.chatLog.appendChild(div); els.chatLog.scrollTop=els.chatLog.scrollHeight; }

async function checkHealth(){
  try{
    const r=await fetch('/api/health',{cache:'no-store'}); const d=await r.json();
    if(!r.ok||!d.ok) throw new Error('health');
    state.serverKey=Boolean(d.providerConfigured);
    setHealth(state.serverKey||getLocalKey()?'Hệ thống sẵn sàng':'Web sẵn sàng · A.I cần khóa',state.serverKey||getLocalKey()?'good':'warn');
  }catch{ setHealth('Mất kết nối','bad'); }
}

async function openCamera(){
  if(state.stream){ stopCamera(); return; }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:960}},audio:false});
    state.stream=stream; els.video.srcObject=stream; els.video.hidden=false; els.preview.hidden=true; els.empty.hidden=true; els.capture.hidden=false; els.camera.textContent='Đóng camera';
  }catch(err){ appendBubble(err?.name==='NotAllowedError'?'Thiết bị đang chặn quyền camera. Bạn vẫn có thể chọn ảnh từ máy.':'Không mở được camera. Hãy thử chọn ảnh từ thiết bị.'); }
}

async function captureFrame(){
  if(!state.stream) return;
  const vw=els.video.videoWidth||1280, vh=els.video.videoHeight||960;
  els.canvas.width=vw; els.canvas.height=vh; els.canvas.getContext('2d').drawImage(els.video,0,0,vw,vh);
  const data=els.canvas.toDataURL('image/jpeg',.9); stopCamera(); await acceptImage(data,'image/jpeg');
}

function fileToDataUrl(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); }); }
function loadImage(src){ return new Promise((resolve,reject)=>{ const img=new Image(); img.onload=()=>resolve(img); img.onerror=reject; img.src=src; }); }

async function acceptImage(dataUrl,mimeType){
  const img=await loadImage(dataUrl);
  const max=1280, scale=Math.min(1,max/Math.max(img.width,img.height));
  const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
  els.canvas.width=w; els.canvas.height=h; const ctx=els.canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0,w,h);
  state.image=els.canvas.toDataURL('image/jpeg',.88); state.mimeType='image/jpeg'; state.qc=computeQc(ctx,w,h); state.analysis=null;
  els.preview.src=state.image; els.preview.hidden=false; els.video.hidden=true; els.empty.hidden=true; els.qcPanel.hidden=false; els.analyze.disabled=false; els.resultCard.hidden=true; els.reportBox.hidden=true;
  renderQc();
}

function computeQc(ctx,w,h){
  const sw=Math.min(240,w), sh=Math.max(1,Math.round(h*(sw/w))); const temp=document.createElement('canvas'); temp.width=sw; temp.height=sh; const t=temp.getContext('2d',{willReadFrequently:true}); t.drawImage(els.canvas,0,0,sw,sh);
  const d=t.getImageData(0,0,sw,sh).data; const gray=new Float32Array(sw*sh); let sum=0,sumSq=0,bright=0,dark=0;
  for(let i=0,p=0;i<d.length;i+=4,p++){ const g=.299*d[i]+.587*d[i+1]+.114*d[i+2]; gray[p]=g; sum+=g; sumSq+=g*g; if(g>245) bright++; if(g<35) dark++; }
  const n=gray.length, brightness=sum/n, variance=Math.max(0,sumSq/n-brightness*brightness), contrast=Math.sqrt(variance); let edge=0,count=0;
  for(let y=1;y<sh;y++){ for(let x=1;x<sw;x++){ const p=y*sw+x; edge+=Math.abs(gray[p]-gray[p-1])+Math.abs(gray[p]-gray[p-sw]); count+=2; } }
  const edgeScore=count?edge/count:0, glare=bright/n, darkness=dark/n;
  const checks={light:brightness>=65&&brightness<=220&&glare<.18,dynamic:contrast>=28,focus:edgeScore>=9,shadow:darkness<.22};
  const passed=Object.values(checks).filter(Boolean).length; const grade=passed===4?'good':passed>=2?'fair':'poor';
  return {grade,brightness:Number(brightness.toFixed(1)),contrast:Number(contrast.toFixed(1)),edge:Number(edgeScore.toFixed(1)),glare:Number((glare*100).toFixed(1)),darkness:Number((darkness*100).toFixed(1)),checks};
}

function renderQc(){
  const q=state.qc; if(!q) return;
  const labels=[['Ánh sáng',q.checks.light],['Tương phản',q.checks.dynamic],['Độ nét',q.checks.focus],['Bóng tối',q.checks.shadow]];
  els.qcChips.innerHTML=labels.map(([label,ok])=>`<span class="chip ${ok?'good':'warn'}">${ok?'✓':'!'} ${label}</span>`).join('')+`<span class="chip ${q.grade==='good'?'good':q.grade==='poor'?'bad':'warn'}">QC: ${q.grade.toUpperCase()}</span>`;
}

async function apiFetch(url,body){
  const headers={'content-type':'application/json'}; const k=getLocalKey(); if(k) headers['x-gemini-key']=k;
  const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)}); const d=await r.json().catch(()=>({}));
  if(r.status===428){ setHealth('A.I cần cấu hình','warn'); els.dialog.showModal(); throw new Error('Hãy nhập Gemini API key một lần trong Cài đặt A.I.'); }
  if(!r.ok) throw new Error(d?.message||d?.error||`HTTP ${r.status}`); return d;
}

async function analyze(){
  if(!state.image) return;
  els.analyze.disabled=true; const old=els.analyze.textContent; els.analyze.textContent='Đang phân tích…';
  try{
    const d=await apiFetch('/api/analyze',{image:state.image,mimeType:state.mimeType,qc:state.qc}); state.analysis=d.analysis; renderResult(d.model); setHealth('A.I hoạt động','good');
  }catch(err){ appendBubble(`Không thể phân tích: ${err.message}`); }
  finally{ els.analyze.disabled=false; els.analyze.textContent=old; }
}

function renderResult(model){
  const a=state.analysis||{}; const fields=[['Màu lưỡi',a.tongueColor],['Hình thể',a.shape],['Màu rêu',a.coatingColor],['Độ dày rêu',a.coatingThickness],['Độ ẩm',a.moisture],['Nứt',a.fissures],['Dấu răng',a.toothmarks],['Chất lượng A.I',a.quality]];
  els.resultGrid.innerHTML=fields.map(([k,v])=>`<div class="result-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v||'Không xác định')}</strong></div>`).join('');
  els.summary.textContent=a.summary||'Không có tóm tắt.'; const conf=Math.max(0,Math.min(1,Number(a.confidence)||0)); els.confidence.textContent=`Tin cậy ${Math.round(conf*100)}%`; els.model.textContent=model?`Mô hình: ${model}`:''; els.resultCard.hidden=false; els.resultCard.scrollIntoView({behavior:'smooth',block:'start'});
}

async function makeReport(){
  if(!state.analysis) return; els.report.disabled=true; const old=els.report.textContent; els.report.textContent='Đang tạo báo cáo…';
  try{ const d=await apiFetch('/api/report',{analysis:state.analysis,qc:state.qc}); els.reportBox.textContent=d.report; els.reportBox.hidden=false; }
  catch(err){ appendBubble(`Không tạo được báo cáo: ${err.message}`); }
  finally{ els.report.disabled=false; els.report.textContent=old; }
}

async function sendChat(ev){
  ev.preventDefault(); const message=els.chatInput.value.trim(); if(!message) return; els.chatInput.value=''; appendBubble(message,'user');
  const submit=els.chatForm.querySelector('button'); submit.disabled=true;
  try{ const d=await apiFetch('/api/chat',{analysis:state.analysis,message}); appendBubble(d.reply||'Không có phản hồi.'); }
  catch(err){ appendBubble(`Chatbot chưa trả lời được: ${err.message}`); }
  finally{ submit.disabled=false; }
}

function resetAll(){ stopCamera(); state.image=''; state.qc=null; state.analysis=null; els.preview.removeAttribute('src'); els.preview.hidden=true; els.empty.hidden=false; els.qcPanel.hidden=true; els.analyze.disabled=true; els.resultCard.hidden=true; els.reportBox.hidden=true; }

els.camera.addEventListener('click',openCamera); els.capture.addEventListener('click',captureFrame); els.reset.addEventListener('click',resetAll); els.analyze.addEventListener('click',analyze); els.report.addEventListener('click',makeReport); els.chatForm.addEventListener('submit',sendChat);
els.file.addEventListener('change',async e=>{ const file=e.target.files?.[0]; if(!file) return; if(!file.type.startsWith('image/')){ appendBubble('Tệp đã chọn không phải hình ảnh.'); return; } try{ await acceptImage(await fileToDataUrl(file),file.type); }catch{ appendBubble('Không đọc được ảnh đã chọn.'); } e.target.value=''; });
els.settings.addEventListener('click',()=>{ els.key.value=getLocalKey(); els.dialog.showModal(); });
els.saveKey.addEventListener('click',()=>{ const k=els.key.value.trim(); if(k) localStorage.setItem('aiThietChanGeminiKey',k); else localStorage.removeItem('aiThietChanGeminiKey'); els.dialog.close(); checkHealth(); });
els.clearKey.addEventListener('click',()=>{ localStorage.removeItem('aiThietChanGeminiKey'); els.key.value=''; els.dialog.close(); checkHealth(); });
window.addEventListener('beforeunload',stopCamera); document.addEventListener('visibilitychange',()=>{ if(document.hidden&&state.stream) stopCamera(); });
checkHealth();
