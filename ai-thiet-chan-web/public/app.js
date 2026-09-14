const $ = id => document.getElementById(id);
const state = {
  stream: null,
  facingMode: 'environment',
  videoInputs: [],
  image: '',
  mimeType: 'image/jpeg',
  qc: null,
  analysis: null,
  serverKey: false,
  knowledgeVersion: '',
  model: ''
};
const els = {
  health: $('healthBadge'),
  video: $('video'),
  preview: $('preview'),
  empty: $('emptyState'),
  camera: $('cameraBtn'),
  switchCamera: $('switchCameraBtn'),
  capture: $('captureBtn'),
  file: $('fileInput'),
  reset: $('resetBtn'),
  qcPanel: $('qcPanel'),
  qcChips: $('qcChips'),
  analyze: $('analyzeBtn'),
  resultCard: $('resultCard'),
  resultGrid: $('resultGrid'),
  theoryBox: $('theoryBox'),
  summary: $('summaryText'),
  confidence: $('confidenceBadge'),
  modelLabel: $('modelLabel'),
  report: $('reportBtn'),
  exportMl: $('exportMlBtn'),
  reportBox: $('reportBox'),
  chatForm: $('chatForm'),
  chatInput: $('chatInput'),
  chatLog: $('chatLog'),
  canvas: $('workCanvas')
};

function setHealth(text, cls=''){ els.health.textContent = text; els.health.className = `status-pill ${cls}`.trim(); }
function escapeHtml(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function appendBubble(text, who='bot'){ const div=document.createElement('div'); div.className=`bubble ${who}`; div.textContent=text; els.chatLog.appendChild(div); els.chatLog.scrollTop=els.chatLog.scrollHeight; }

function stopCamera(){
  if(state.stream){ state.stream.getTracks().forEach(t=>t.stop()); state.stream=null; }
  els.video.srcObject=null;
  els.video.hidden=true;
  els.video.classList.remove('mirror');
  els.capture.hidden=true;
  els.switchCamera.hidden=true;
  els.camera.textContent='Mở camera';
}

async function refreshVideoInputs(){
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    state.videoInputs=devices.filter(d=>d.kind==='videoinput');
  }catch{ state.videoInputs=[]; }
  els.switchCamera.hidden=!state.stream || state.videoInputs.length<2;
}

async function checkHealth(){
  try{
    const r=await fetch('/api/health',{cache:'no-store'}); const d=await r.json();
    if(!r.ok||!d.ok) throw new Error('health');
    state.serverKey=Boolean(d.providerConfigured);
    state.knowledgeVersion=d.knowledgeVersion||'';
    state.model=d.model||'';
    setHealth(state.serverKey?'A.I dùng chung sẵn sàng':'A.I máy chủ chưa cấu hình',state.serverKey?'good':'warn');
  }catch{ setHealth('Mất kết nối','bad'); }
}

async function startCamera(facingMode=state.facingMode){
  if(!navigator.mediaDevices?.getUserMedia){ throw new Error('CAMERA_UNSUPPORTED'); }
  if(state.stream){ state.stream.getTracks().forEach(t=>t.stop()); state.stream=null; }
  const stream=await navigator.mediaDevices.getUserMedia({
    video:{facingMode:{ideal:facingMode},width:{ideal:1280},height:{ideal:960}},
    audio:false
  });
  state.stream=stream;
  state.facingMode=facingMode;
  els.video.srcObject=stream;
  els.video.hidden=false;
  els.video.classList.toggle('mirror',facingMode==='user');
  els.preview.hidden=true;
  els.empty.hidden=true;
  els.capture.hidden=false;
  els.camera.textContent='Đóng camera';
  await refreshVideoInputs();
}

async function openCamera(){
  if(state.stream){ stopCamera(); return; }
  try{ await startCamera(state.facingMode); }
  catch(err){ appendBubble(err?.name==='NotAllowedError'?'Thiết bị đang chặn quyền camera. Bạn vẫn có thể chọn ảnh từ máy.':'Không mở được camera. Hãy thử chọn ảnh từ thiết bị.'); }
}

async function switchCamera(){
  if(!state.stream) return;
  const previous=state.facingMode;
  const next=previous==='environment'?'user':'environment';
  els.switchCamera.disabled=true;
  try{
    await startCamera(next);
    els.switchCamera.textContent=next==='user'?'↻ Camera sau':'↻ Camera trước';
  }catch{
    try{ await startCamera(previous); }catch{ stopCamera(); }
    appendBubble('Không chuyển được camera trên thiết bị này.');
  }finally{ els.switchCamera.disabled=false; }
}

async function captureFrame(){
  if(!state.stream) return;
  const vw=els.video.videoWidth||1280, vh=els.video.videoHeight||960;
  els.canvas.width=vw; els.canvas.height=vh;
  els.canvas.getContext('2d').drawImage(els.video,0,0,vw,vh);
  const data=els.canvas.toDataURL('image/jpeg',.9);
  stopCamera();
  await acceptImage(data,'image/jpeg');
}

function fileToDataUrl(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); }); }
function loadImage(src){ return new Promise((resolve,reject)=>{ const img=new Image(); img.onload=()=>resolve(img); img.onerror=reject; img.src=src; }); }

async function acceptImage(dataUrl,mimeType){
  const img=await loadImage(dataUrl);
  const max=1280, scale=Math.min(1,max/Math.max(img.width,img.height));
  const w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
  els.canvas.width=w; els.canvas.height=h;
  const ctx=els.canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(img,0,0,w,h);
  state.image=els.canvas.toDataURL('image/jpeg',.88);
  state.mimeType='image/jpeg';
  state.qc=computeQc(ctx,w,h);
  state.analysis=null;
  els.preview.src=state.image;
  els.preview.hidden=false;
  els.video.hidden=true;
  els.empty.hidden=true;
  els.qcPanel.hidden=false;
  els.analyze.disabled=false;
  els.resultCard.hidden=true;
  els.theoryBox.hidden=true;
  els.reportBox.hidden=true;
  renderQc();
}

function computeQc(ctx,w,h){
  const sw=Math.min(280,w), sh=Math.max(1,Math.round(h*(sw/w)));
  const temp=document.createElement('canvas'); temp.width=sw; temp.height=sh;
  const t=temp.getContext('2d',{willReadFrequently:true}); t.drawImage(els.canvas,0,0,sw,sh);
  const d=t.getImageData(0,0,sw,sh).data;
  const gray=new Float32Array(sw*sh);
  let sum=0,sumSq=0,bright=0,dark=0;
  for(let i=0,p=0;i<d.length;i+=4,p++){
    const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];
    gray[p]=g; sum+=g; sumSq+=g*g;
    if(g>245) bright++;
    if(g<35) dark++;
  }
  const n=gray.length;
  const brightness=sum/n;
  const variance=Math.max(0,sumSq/n-brightness*brightness);
  const contrast=Math.sqrt(variance);
  let edge=0,count=0,lapSum=0,lapSq=0,lapCount=0;
  for(let y=1;y<sh;y++){
    for(let x=1;x<sw;x++){
      const p=y*sw+x;
      edge+=Math.abs(gray[p]-gray[p-1])+Math.abs(gray[p]-gray[p-sw]);
      count+=2;
    }
  }
  for(let y=1;y<sh-1;y++){
    for(let x=1;x<sw-1;x++){
      const p=y*sw+x;
      const lap=4*gray[p]-gray[p-1]-gray[p+1]-gray[p-sw]-gray[p+sw];
      lapSum+=lap; lapSq+=lap*lap; lapCount++;
    }
  }
  const edgeScore=count?edge/count:0;
  const lapMean=lapCount?lapSum/lapCount:0;
  const laplacianVariance=lapCount?Math.max(0,lapSq/lapCount-lapMean*lapMean):0;
  const glare=bright/n, darkness=dark/n;
  const minSide=Math.min(w,h);
  const checks={
    resolution:minSide>=480,
    light:brightness>=60&&brightness<=225&&glare<.15,
    dynamic:contrast>=25,
    focus:laplacianVariance>=55&&edgeScore>=7,
    clipping:glare<.15&&darkness<.20
  };
  const passed=Object.values(checks).filter(Boolean).length;
  const grade=passed===5?'good':passed>=3?'fair':'poor';
  return {
    grade,
    width:w,
    height:h,
    brightness:Number(brightness.toFixed(1)),
    contrast:Number(contrast.toFixed(1)),
    edge:Number(edgeScore.toFixed(1)),
    laplacianVariance:Number(laplacianVariance.toFixed(1)),
    glare:Number((glare*100).toFixed(1)),
    darkness:Number((darkness*100).toFixed(1)),
    checks
  };
}

function renderQc(){
  const q=state.qc; if(!q) return;
  const labels=[
    ['Độ phân giải',q.checks.resolution],
    ['Ánh sáng',q.checks.light],
    ['Tương phản',q.checks.dynamic],
    ['Độ nét',q.checks.focus],
    ['Cháy/tối',q.checks.clipping]
  ];
  els.qcChips.innerHTML=labels.map(([label,ok])=>`<span class="chip ${ok?'good':'warn'}">${ok?'✓':'!'} ${label}</span>`).join('')+`<span class="chip ${q.grade==='good'?'good':q.grade==='poor'?'bad':'warn'}">QC: ${q.grade.toUpperCase()}</span>`;
}

async function apiFetch(url,body){
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));
  if(r.status===428){ setHealth('A.I máy chủ chưa cấu hình','warn'); throw new Error('Khóa Gemini dùng chung chưa được cấu hình trên máy chủ.'); }
  if(r.status===429){ throw new Error(`Đang vượt giới hạn bảo vệ khóa dùng chung. Thử lại sau ${d.retryAfter||'ít phút'} giây.`); }
  if(!r.ok) throw new Error(d?.message||d?.error||`HTTP ${r.status}`);
  return d;
}

async function analyze(){
  if(!state.image) return;
  els.analyze.disabled=true; const old=els.analyze.textContent; els.analyze.textContent='Đang phân tích…';
  try{
    const d=await apiFetch('/api/analyze',{image:state.image,mimeType:state.mimeType,qc:state.qc});
    state.analysis=d.analysis;
    state.knowledgeVersion=d.knowledgeVersion||state.knowledgeVersion;
    state.model=d.model||state.model;
    renderResult();
    setHealth('A.I dùng chung hoạt động','good');
  }catch(err){ appendBubble(`Không thể phân tích: ${err.message}`); }
  finally{ els.analyze.disabled=false; els.analyze.textContent=old; }
}

function renderTheoryAssessment(a){
  const ta=a?.theoryAssessment||{};
  const general=Array.isArray(ta.generalSignals)?ta.generalSignals:[];
  const stomach=Array.isArray(ta.stomachPatternSignals)?ta.stomachPatternSignals:[];
  const cannot=Array.isArray(ta.cannotConclude)?ta.cannotConclude:[];
  if(!general.length&&!stomach.length&&!cannot.length){ els.theoryBox.hidden=true; els.theoryBox.innerHTML=''; return; }
  const generalHtml=general.map(item=>`<li><strong>${escapeHtml(item.label||'Tín hiệu')}</strong><span>${escapeHtml(item.evidence||'')}</span></li>`).join('');
  const stomachHtml=stomach.map(item=>{
    const pct=Math.round(Math.max(0,Math.min(1,Number(item.confidence)||0))*100);
    return `<li><strong>${escapeHtml(item.label||'')}</strong><span>${escapeHtml(item.evidence||'')}</span><small>Phù hợp thiệt tượng: ${pct}%${item.missingForConclusion?` · Còn thiếu: ${escapeHtml(item.missingForConclusion)}`:''}</small></li>`;
  }).join('');
  const cannotHtml=cannot.map(v=>`<li><span>${escapeHtml(v)}</span></li>`).join('');
  els.theoryBox.innerHTML=`<strong>Đối chiếu lý thuyết thiệt chẩn</strong>${generalHtml?`<div class="theory-title">Tín hiệu chung</div><ul>${generalHtml}</ul>`:''}${stomachHtml?`<div class="theory-title">Tín hiệu Vị quản</div><ul>${stomachHtml}</ul>`:''}${cannotHtml?`<div class="theory-title">Chưa thể kết luận</div><ul>${cannotHtml}</ul>`:''}`;
  els.theoryBox.hidden=false;
}

function renderResult(){
  const a=state.analysis||{};
  const vv=a.visualValidity||{};
  const fields=[
    ['Vùng lưỡi',vv.tongueVisible===false?'Không xác nhận':vv.tongueVisible===true?'Đã xác nhận':'Không xác định'],
    ['Bố cục ảnh',vv.framing],
    ['Độ tin cậy màu',vv.colorReliability],
    ['Màu lưỡi',a.tongueColor],
    ['Hình thể',a.shape],
    ['Màu rêu',a.coatingColor],
    ['Độ dày rêu',a.coatingThickness],
    ['Tính chất rêu',a.coatingTexture],
    ['Độ ẩm',a.moisture],
    ['Nứt',a.fissures],
    ['Dấu răng',a.toothmarks],
    ['Gai/điểm',a.pricklesSpots],
    ['Ban/điểm ứ',a.stasisMarks],
    ['TM dưới lưỡi',a.sublingualVeins?.visible?a.sublingualVeins?.description:'Không đánh giá'],
    ['Chất lượng A.I',a.quality]
  ];
  els.resultGrid.innerHTML=fields.map(([k,v])=>`<div class="result-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v||'Không xác định')}</strong></div>`).join('');
  renderTheoryAssessment(a);
  els.summary.textContent=a.summary||'Không có tóm tắt.';
  const conf=Math.max(0,Math.min(1,Number(a.confidence)||0));
  els.confidence.textContent=`Tin cậy ${Math.round(conf*100)}%`;
  const meta=[state.model?`Mô hình: ${state.model}`:'',state.knowledgeVersion?`KB: ${state.knowledgeVersion}`:''].filter(Boolean).join(' · ');
  els.modelLabel.textContent=meta;
  els.resultCard.hidden=false;
  els.resultCard.scrollIntoView({behavior:'smooth',block:'start'});
}

async function makeReport(){
  if(!state.analysis) return;
  els.report.disabled=true; const old=els.report.textContent; els.report.textContent='Đang tạo báo cáo…';
  try{ const d=await apiFetch('/api/report',{analysis:state.analysis,qc:state.qc}); els.reportBox.textContent=d.report; els.reportBox.hidden=false; }
  catch(err){ appendBubble(`Không tạo được báo cáo: ${err.message}`); }
  finally{ els.report.disabled=false; els.report.textContent=old; }
}

function exportMlSample(){
  if(!state.analysis||!state.image) return;
  const payload={
    schemaVersion:'ai-thiet-chan-training-sample-v1',
    createdAt:new Date().toISOString(),
    mimeType:state.mimeType,
    imageDataUrl:state.image,
    qc:state.qc,
    analysis:state.analysis,
    model:state.model,
    knowledgeVersion:state.knowledgeVersion,
    note:'Mẫu xuất cục bộ để kiểm định/gán nhãn trước khi dùng huấn luyện; ứng dụng không tự tải mẫu này lên máy chủ.'
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`ai-thiet-chan-ml-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

async function sendChat(ev){
  ev.preventDefault(); const message=els.chatInput.value.trim(); if(!message) return; els.chatInput.value=''; appendBubble(message,'user');
  const submit=els.chatForm.querySelector('button'); submit.disabled=true;
  try{ const d=await apiFetch('/api/chat',{analysis:state.analysis,message}); appendBubble(d.reply||'Không có phản hồi.'); }
  catch(err){ appendBubble(`Chatbot chưa trả lời được: ${err.message}`); }
  finally{ submit.disabled=false; }
}

function resetAll(){
  stopCamera(); state.image=''; state.qc=null; state.analysis=null;
  els.preview.removeAttribute('src'); els.preview.hidden=true; els.empty.hidden=false; els.qcPanel.hidden=true; els.analyze.disabled=true; els.resultCard.hidden=true; els.theoryBox.hidden=true; els.reportBox.hidden=true;
}

els.camera.addEventListener('click',openCamera);
els.switchCamera.addEventListener('click',switchCamera);
els.capture.addEventListener('click',captureFrame);
els.reset.addEventListener('click',resetAll);
els.analyze.addEventListener('click',analyze);
els.report.addEventListener('click',makeReport);
els.exportMl.addEventListener('click',exportMlSample);
els.chatForm.addEventListener('submit',sendChat);
els.file.addEventListener('change',async e=>{
  const file=e.target.files?.[0]; if(!file) return;
  if(!file.type.startsWith('image/')){ appendBubble('Tệp đã chọn không phải hình ảnh.'); return; }
  try{ await acceptImage(await fileToDataUrl(file),file.type); }catch{ appendBubble('Không đọc được ảnh đã chọn.'); }
  e.target.value='';
});
window.addEventListener('beforeunload',stopCamera);
document.addEventListener('visibilitychange',()=>{ if(document.hidden&&state.stream) stopCamera(); });
checkHealth();
