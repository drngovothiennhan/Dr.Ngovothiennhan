const $=id=>document.getElementById(id);
const emptyImage=()=>({data:'',mimeType:'image/jpeg',qc:null});
const state={
  mode:'normal',stream:null,facingMode:'environment',videoInputs:[],activeTarget:null,
  images:{top:emptyImage(),bottom:emptyImage()},assessment:null,serverKey:false,knowledgeVersion:'',model:'',history:[]
};
const els={
  health:$('healthBadge'),normalMode:$('normalModeBtn'),generalMode:$('generalModeBtn'),generalGuide:$('generalGuide'),bottomCaptureCard:$('bottomCaptureCard'),
  video:$('video'),cameraPanel:$('cameraPanel'),cameraTargetLabel:$('cameraTargetLabel'),switchCamera:$('switchCameraBtn'),capture:$('captureBtn'),closeCamera:$('closeCameraBtn'),
  topPreview:$('topPreview'),topEmpty:$('topEmpty'),topCamera:$('topCameraBtn'),topFile:$('topFileInput'),topReset:$('topResetBtn'),topQcPanel:$('topQcPanel'),topQcChips:$('topQcChips'),
  bottomPreview:$('bottomPreview'),bottomEmpty:$('bottomEmpty'),bottomCamera:$('bottomCameraBtn'),bottomFile:$('bottomFileInput'),bottomReset:$('bottomResetBtn'),bottomQcPanel:$('bottomQcPanel'),bottomQcChips:$('bottomQcChips'),
  analyze:$('analyzeBtn'),resultCard:$('resultCard'),topResultGrid:$('topResultGrid'),topLimitations:$('topLimitations'),bottomResultSection:$('bottomResultSection'),bottomResultGrid:$('bottomResultGrid'),bottomLimitations:$('bottomLimitations'),combinedTitle:$('combinedTitle'),theoryBox:$('theoryBox'),summary:$('summaryText'),confidence:$('confidenceBadge'),modelLabel:$('modelLabel'),report:$('reportBtn'),reportBox:$('reportBox'),
  chatForm:$('chatForm'),chatInput:$('chatInput'),chatLog:$('chatLog'),historyList:$('historyList'),historyCount:$('historyCount'),refreshHistory:$('refreshHistoryBtn'),canvas:$('workCanvas')
};

function setHealth(text,cls=''){els.health.textContent=text;els.health.className=`status-pill ${cls}`.trim();}
function escapeHtml(v){return String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));}
function appendBubble(text,who='bot'){const div=document.createElement('div');div.className=`bubble ${who}`;div.textContent=text;els.chatLog.appendChild(div);els.chatLog.scrollTop=els.chatLog.scrollHeight;}
function formatDate(v){try{return new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));}catch{return v||'';}}
function viewLabel(target){return target==='bottom'?'mặt dưới lưỡi':'mặt trên lưỡi';}
function imageState(target){return state.images[target];}

function updateAnalyzeState(){
  const topReady=Boolean(state.images.top.data);
  const bottomReady=Boolean(state.images.bottom.data);
  els.analyze.disabled=state.mode==='general'?!topReady||!bottomReady:!topReady;
}
function setMode(mode){
  state.mode=mode==='general'?'general':'normal';
  els.normalMode.classList.toggle('active',state.mode==='normal');
  els.generalMode.classList.toggle('active',state.mode==='general');
  els.generalGuide.hidden=state.mode!=='general';
  els.bottomCaptureCard.hidden=state.mode!=='general';
  state.assessment=null;els.resultCard.hidden=true;els.reportBox.hidden=true;
  if(state.stream) stopCamera();
  updateAnalyzeState();
}

function stopCamera(){
  if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
  els.video.srcObject=null;els.video.classList.remove('mirror');els.cameraPanel.hidden=true;state.activeTarget=null;
}
async function refreshVideoInputs(){
  try{const devices=await navigator.mediaDevices.enumerateDevices();state.videoInputs=devices.filter(d=>d.kind==='videoinput');}catch{state.videoInputs=[];}
  els.switchCamera.disabled=state.videoInputs.length<2;
}
async function startCamera(target,facingMode=state.facingMode){
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('CAMERA_UNSUPPORTED');
  if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facingMode},width:{ideal:1600},height:{ideal:1200}},audio:false});
  state.stream=stream;state.facingMode=facingMode;state.activeTarget=target;els.video.srcObject=stream;els.video.classList.toggle('mirror',facingMode==='user');els.cameraPanel.hidden=false;els.cameraTargetLabel.textContent=`Đang chụp ${viewLabel(target)}`;await refreshVideoInputs();els.cameraPanel.scrollIntoView({behavior:'smooth',block:'center'});
}
async function openCamera(target){
  try{await startCamera(target,state.facingMode);}catch(err){appendBubble(err?.name==='NotAllowedError'?'Thiết bị đang chặn quyền camera. Bạn vẫn có thể chọn ảnh từ máy.':`Không mở được camera để chụp ${viewLabel(target)}. Hãy thử chọn ảnh từ thiết bị.`);}
}
async function switchCamera(){
  if(!state.stream||!state.activeTarget)return;const target=state.activeTarget,previous=state.facingMode,next=previous==='environment'?'user':'environment';els.switchCamera.disabled=true;
  try{await startCamera(target,next);els.switchCamera.textContent=next==='user'?'↻ Camera sau':'↻ Camera trước';}
  catch{try{await startCamera(target,previous);}catch{stopCamera();}appendBubble('Không chuyển được camera trên thiết bị này.');}
  finally{els.switchCamera.disabled=false;}
}
async function captureFrame(){
  if(!state.stream||!state.activeTarget)return;const target=state.activeTarget,vw=els.video.videoWidth||1280,vh=els.video.videoHeight||960;els.canvas.width=vw;els.canvas.height=vh;els.canvas.getContext('2d').drawImage(els.video,0,0,vw,vh);const data=els.canvas.toDataURL('image/jpeg',.9);stopCamera();await acceptImage(target,data,'image/jpeg');
}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});}

async function acceptImage(target,dataUrl,mimeType){
  const img=await loadImage(dataUrl),max=1280,scale=Math.min(1,max/Math.max(img.width,img.height)),w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
  state.images[target]={data:c.toDataURL('image/jpeg',.88),mimeType:'image/jpeg',qc:computeQc(ctx,w,h)};state.assessment=null;els.resultCard.hidden=true;els.reportBox.hidden=true;renderImageSlot(target);updateAnalyzeState();
}
function clearImage(target){state.images[target]=emptyImage();state.assessment=null;renderImageSlot(target);els.resultCard.hidden=true;els.reportBox.hidden=true;updateAnalyzeState();}
function renderImageSlot(target){
  const current=imageState(target),preview=target==='top'?els.topPreview:els.bottomPreview,empty=target==='top'?els.topEmpty:els.bottomEmpty,panel=target==='top'?els.topQcPanel:els.bottomQcPanel,chips=target==='top'?els.topQcChips:els.bottomQcChips;
  if(current.data){preview.src=current.data;preview.hidden=false;empty.hidden=true;panel.hidden=false;renderQc(current.qc,chips);}else{preview.removeAttribute('src');preview.hidden=true;empty.hidden=false;panel.hidden=true;chips.innerHTML='';}
}
function computeQc(ctx,w,h){
  const sw=Math.min(280,w),sh=Math.max(1,Math.round(h*(sw/w))),temp=document.createElement('canvas');temp.width=sw;temp.height=sh;const t=temp.getContext('2d',{willReadFrequently:true});t.drawImage(ctx.canvas,0,0,sw,sh);const d=t.getImageData(0,0,sw,sh).data;
  const gray=new Float32Array(sw*sh);let sum=0,sumSq=0,bright=0,dark=0;
  for(let i=0,p=0;i<d.length;i+=4,p++){const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];gray[p]=g;sum+=g;sumSq+=g*g;if(g>245)bright++;if(g<35)dark++;}
  const n=gray.length,brightness=sum/n,variance=Math.max(0,sumSq/n-brightness*brightness),contrast=Math.sqrt(variance);let edge=0,count=0,lapSum=0,lapSq=0,lapCount=0;
  for(let y=1;y<sh;y++)for(let x=1;x<sw;x++){const p=y*sw+x;edge+=Math.abs(gray[p]-gray[p-1])+Math.abs(gray[p]-gray[p-sw]);count+=2;}
  for(let y=1;y<sh-1;y++)for(let x=1;x<sw-1;x++){const p=y*sw+x,lap=4*gray[p]-gray[p-1]-gray[p+1]-gray[p-sw]-gray[p+sw];lapSum+=lap;lapSq+=lap*lap;lapCount++;}
  const edgeScore=count?edge/count:0,lapMean=lapCount?lapSum/lapCount:0,laplacianVariance=lapCount?Math.max(0,lapSq/lapCount-lapMean*lapMean):0,glare=bright/n,darkness=dark/n,minSide=Math.min(w,h);
  const checks={resolution:minSide>=480,light:brightness>=60&&brightness<=225&&glare<.15,dynamic:contrast>=25,focus:laplacianVariance>=55&&edgeScore>=7,clipping:glare<.15&&darkness<.20};
  const passed=Object.values(checks).filter(Boolean).length,grade=passed===5?'good':passed>=3?'fair':'poor';
  return {grade,width:w,height:h,brightness:Number(brightness.toFixed(1)),contrast:Number(contrast.toFixed(1)),edge:Number(edgeScore.toFixed(1)),laplacianVariance:Number(laplacianVariance.toFixed(1)),glare:Number((glare*100).toFixed(1)),darkness:Number((darkness*100).toFixed(1)),checks};
}
function renderQc(q,chips){if(!q)return;const labels=[['Độ phân giải',q.checks.resolution],['Ánh sáng',q.checks.light],['Tương phản',q.checks.dynamic],['Độ nét',q.checks.focus],['Cháy/tối',q.checks.clipping]];chips.innerHTML=labels.map(([label,ok])=>`<span class="chip ${ok?'good':'warn'}">${ok?'✓':'!'} ${label}</span>`).join('')+`<span class="chip ${q.grade==='good'?'good':q.grade==='poor'?'bad':'warn'}">QC: ${q.grade.toUpperCase()}</span>`;}

async function checkHealth(){
  try{const r=await fetch('/api/health',{cache:'no-store'}),d=await r.json();if(!r.ok||!d.ok)throw new Error('health');state.serverKey=Boolean(d.providerConfigured);state.knowledgeVersion=d.knowledgeVersion||'';state.model=d.model||'';const collectionReady=Boolean(d.caseCollection?.storeReady);setHealth(state.serverKey&&collectionReady?'A.I + dữ liệu học máy sẵn sàng':state.serverKey?'A.I sẵn sàng · dữ liệu đang kết nối':'A.I máy chủ chưa cấu hình',state.serverKey?'good':'warn');}catch{setHealth('Mất kết nối','bad');}
}
async function apiFetch(url,body){
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));
  if(r.status===428){setHealth('A.I máy chủ chưa cấu hình','warn');throw new Error('Khóa Gemini dùng chung chưa được cấu hình trên máy chủ.');}
  if(r.status===429)throw new Error(`Đang vượt giới hạn bảo vệ khóa dùng chung. Thử lại sau ${d.retryAfter||'ít phút'} giây.`);
  if(!r.ok)throw new Error(d?.message||d?.error||`HTTP ${r.status}`);return d;
}
async function apiGet(url){const r=await fetch(url,{cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.message||d?.error||`HTTP ${r.status}`);return d;}

async function analyze(){
  if(els.analyze.disabled)return;els.analyze.disabled=true;const old=els.analyze.textContent;els.analyze.textContent='Đang phân tích…';
  try{
    const top=state.images.top,bottom=state.images.bottom;
    const d=await apiFetch('/api/analyze',{mode:state.mode,topImage:top.data,topMimeType:top.mimeType,topQc:top.qc,bottomImage:state.mode==='general'?bottom.data:null,bottomMimeType:bottom.mimeType,bottomQc:state.mode==='general'?bottom.qc:null});
    state.assessment=d.assessment||d.analysis;state.knowledgeVersion=d.knowledgeVersion||state.knowledgeVersion;state.model=d.model||state.model;renderResult();
    setHealth(d.collection?.ok?'A.I + dữ liệu học máy hoạt động':'A.I hoạt động · chưa lưu được dữ liệu',d.collection?.ok?'good':'warn');
    if(d.collection?.ok)await loadHistory();else appendBubble('Ca đã phân tích nhưng chưa đồng bộ vào kho dữ liệu học máy.');
  }catch(err){appendBubble(`Không thể phân tích: ${err.message}`);}finally{updateAnalyzeState();els.analyze.textContent=old;}
}

function fieldGrid(fields){return fields.map(([k,v])=>`<div class="result-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v??'Không xác định')}</strong></div>`).join('');}
function renderLimitations(node,items){const list=Array.isArray(items)?items.filter(Boolean):[];node.hidden=!list.length;node.innerHTML=list.length?`<strong>Giới hạn</strong><ul>${list.map(v=>`<li>${escapeHtml(v)}</li>`).join('')}</ul>`:'';}
function renderTheoryAssessment(a){
  const combined=a?.combined||{},general=Array.isArray(combined.generalSignals)?combined.generalSignals:[],stomach=Array.isArray(combined.stomachPatternSignals)?combined.stomachPatternSignals:[],cannot=Array.isArray(combined.cannotConclude)?combined.cannotConclude:[];
  if(!general.length&&!stomach.length&&!cannot.length){els.theoryBox.hidden=true;els.theoryBox.innerHTML='';return;}
  const generalHtml=general.map(item=>`<li><strong>${escapeHtml(item.label||'Tín hiệu')}</strong><span>${escapeHtml(item.evidence||'')}</span>${item.rule?`<small>${escapeHtml(item.rule)}</small>`:''}</li>`).join('');
  const stomachHtml=stomach.map(item=>{const pct=Math.round(Math.max(0,Math.min(1,Number(item.confidence)||0))*100);return `<li><strong>${escapeHtml(item.label||'')}</strong><span>${escapeHtml(item.evidence||'')}</span><small>Phù hợp thiệt tượng: ${pct}%${item.missingForConclusion?` · Còn thiếu: ${escapeHtml(item.missingForConclusion)}`:''}</small></li>`;}).join('');
  const cannotHtml=cannot.map(v=>`<li><span>${escapeHtml(v)}</span></li>`).join('');
  els.theoryBox.innerHTML=`<strong>Đối chiếu lý thuyết thiệt chẩn</strong>${generalHtml?`<div class="theory-title">Tín hiệu chung</div><ul>${generalHtml}</ul>`:''}${stomachHtml?`<div class="theory-title">Tín hiệu Vị quản</div><ul>${stomachHtml}</ul>`:''}${cannotHtml?`<div class="theory-title">Chưa thể kết luận</div><ul>${cannotHtml}</ul>`:''}`;els.theoryBox.hidden=false;
}
function renderResult(){
  const a=state.assessment||{},top=a.top||{},tv=top.visualValidity||{};
  els.topResultGrid.innerHTML=fieldGrid([
    ['Đúng mặt trên',tv.tongueVisible===true?'Đã xác nhận':tv.tongueVisible===false?'Không xác nhận':'Không xác định'],['Toàn bộ lưỡi',tv.wholeTongueVisible===true?'Thấy rõ':tv.wholeTongueVisible===false?'Chưa đủ':'Không xác định'],['Phần sau/gốc lưỡi',tv.rootVisible===true?'Thấy rõ':tv.rootVisible===false?'Chưa thấy rõ':'Không xác định'],['Độ tin cậy màu',tv.colorReliability],['Màu lưỡi',top.tongueColor],['Hình thể',top.shape],['Màu rêu',top.coatingColor],['Độ dày rêu',top.coatingThickness],['Tính chất rêu',top.coatingTexture],['Độ ẩm',top.moisture],['Nứt',top.fissures],['Dấu răng',top.toothmarks],['Gai/điểm',top.pricklesSpots],['Ban/điểm ứ',top.stasisMarks],['Chất lượng A.I',top.quality]
  ]);renderLimitations(els.topLimitations,top.limitations);

  if(a.mode==='general'&&a.bottom){
    const bottom=a.bottom,bv=bottom.visualValidity||{},v=bottom.vessels||{};els.bottomResultSection.hidden=false;
    els.bottomResultGrid.innerHTML=fieldGrid([
      ['Đúng mặt dưới',bv.undersideVisible===true?'Đã xác nhận':bv.undersideVisible===false?'Không xác nhận':'Không xác định'],['Mạch dưới lưỡi',bv.vesselsVisible===true?'Thấy rõ':bv.vesselsVisible===false?'Chưa thấy rõ':'Không xác định'],['Độ tin cậy màu',bv.colorReliability],['Màu mặt dưới',bottom.undersideColor],['Màu mạch',v.color],['Mức nổi',v.prominence],['Giãn',v.dilation],['Uốn lượn/ngoằn ngoèo',v.tortuosity],['Dấu ứ nhìn thấy',v.stasisSigns],['Đo kích thước',v.measurement],['Chất lượng A.I',bottom.quality]
    ]);renderLimitations(els.bottomLimitations,bottom.limitations);els.combinedTitle.textContent='3. Tổng hợp nhận định';
  }else{els.bottomResultSection.hidden=true;els.bottomResultGrid.innerHTML='';els.bottomLimitations.hidden=true;els.combinedTitle.textContent='2. Tổng hợp nhận định';}

  renderTheoryAssessment(a);const combined=a.combined||{};els.summary.textContent=combined.summary||top.summary||'Không có tóm tắt.';const conf=Math.max(0,Math.min(1,Number(combined.confidence)||0));els.confidence.textContent=`Tin cậy ${Math.round(conf*100)}%`;els.modelLabel.textContent=[a.mode==='general'?'Tổng quát · 2 ảnh':'Bình thường · 1 ảnh',state.model?`Mô hình: ${state.model}`:'',state.knowledgeVersion?`KB: ${state.knowledgeVersion}`:''].filter(Boolean).join(' · ');els.resultCard.hidden=false;els.resultCard.scrollIntoView({behavior:'smooth',block:'start'});
}

async function makeReport(){
  if(!state.assessment)return;els.report.disabled=true;const old=els.report.textContent;els.report.textContent='Đang tạo báo cáo…';
  try{const d=await apiFetch('/api/report',{mode:state.mode,assessment:state.assessment,topQc:state.images.top.qc,bottomQc:state.mode==='general'?state.images.bottom.qc:null});els.reportBox.textContent=d.report;els.reportBox.hidden=false;}catch(err){appendBubble(`Không tạo được báo cáo: ${err.message}`);}finally{els.report.disabled=false;els.report.textContent=old;}
}
async function sendChat(ev){ev.preventDefault();const message=els.chatInput.value.trim();if(!message)return;els.chatInput.value='';appendBubble(message,'user');const submit=els.chatForm.querySelector('button');submit.disabled=true;try{const d=await apiFetch('/api/chat',{assessment:state.assessment,message});appendBubble(d.reply||'Không có phản hồi.');}catch(err){appendBubble(`Chatbot chưa trả lời được: ${err.message}`);}finally{submit.disabled=false;}}

function renderHistory(){
  const cases=state.history||[];els.historyCount.textContent=`${cases.length} ca gần nhất`;
  if(!cases.length){els.historyList.innerHTML='<div class="history-empty">Chưa có ca được lưu.</div>';return;}
  els.historyList.innerHTML=cases.map(item=>{
    const conf=Math.round(Math.max(0,Math.min(1,Number(item.confidence)||0))*100),mode=item.assessment_mode==='general'?'Tổng quát · 2 ảnh':'Bình thường · 1 ảnh';
    const bottom=item.assessment_mode==='general'&&item.bottom_vessels?` · Mạch dưới: ${escapeHtml(item.bottom_vessels)}`:'';
    return `<article class="history-item"><div class="history-top"><strong>${escapeHtml(formatDate(item.created_at))}</strong><span class="chip">${mode}</span><span class="chip ${item.top_qc_grade==='good'?'good':item.top_qc_grade==='poor'?'bad':'warn'}">QC trên ${escapeHtml((item.top_qc_grade||'').toUpperCase())}</span>${item.assessment_mode==='general'?`<span class="chip ${item.bottom_qc_grade==='good'?'good':item.bottom_qc_grade==='poor'?'bad':'warn'}">QC dưới ${escapeHtml((item.bottom_qc_grade||'').toUpperCase())}</span>`:''}<span class="status-pill good">${conf}%</span></div><div class="history-features">${item.top_tongue_color?`Lưỡi: ${escapeHtml(item.top_tongue_color)}`:''}${item.top_coating_color?` · Rêu: ${escapeHtml(item.top_coating_color)}`:''}${bottom}</div><p>${escapeHtml(item.summary||'Không có tóm tắt.')}</p></article>`;
  }).join('');
}
async function loadHistory(){if(!els.historyList)return;els.refreshHistory.disabled=true;try{const d=await apiGet('/api/cases?limit=30');state.history=Array.isArray(d.cases)?d.cases:[];renderHistory();}catch{els.historyList.innerHTML='<div class="history-empty">Chưa tải được lịch sử ca.</div>';}finally{els.refreshHistory.disabled=false;}}

async function handleFile(target,input){const file=input.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){appendBubble('Tệp đã chọn không phải hình ảnh.');input.value='';return;}try{await acceptImage(target,await fileToDataUrl(file),file.type);}catch{appendBubble(`Không đọc được ảnh ${viewLabel(target)} đã chọn.`);}input.value='';}

els.normalMode.addEventListener('click',()=>setMode('normal'));els.generalMode.addEventListener('click',()=>setMode('general'));
els.topCamera.addEventListener('click',()=>openCamera('top'));els.bottomCamera.addEventListener('click',()=>openCamera('bottom'));els.switchCamera.addEventListener('click',switchCamera);els.capture.addEventListener('click',captureFrame);els.closeCamera.addEventListener('click',stopCamera);
els.topReset.addEventListener('click',()=>clearImage('top'));els.bottomReset.addEventListener('click',()=>clearImage('bottom'));els.topFile.addEventListener('change',()=>handleFile('top',els.topFile));els.bottomFile.addEventListener('change',()=>handleFile('bottom',els.bottomFile));
els.analyze.addEventListener('click',analyze);els.report.addEventListener('click',makeReport);els.chatForm.addEventListener('submit',sendChat);els.refreshHistory.addEventListener('click',loadHistory);
window.addEventListener('beforeunload',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.stream)stopCamera();});
setMode('normal');checkHealth();loadHistory();
