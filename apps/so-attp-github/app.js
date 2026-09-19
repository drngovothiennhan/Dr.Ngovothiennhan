const API='https://br-old-shape-avehrcx0-attpapi.compute.c-11.us-east-1.aws.neon.tech';
const ACCESS_KEY='attp_access_v2';
const SESSION_KEY='attp_session_v2';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
let accessToken=sessionStorage.getItem(ACCESS_KEY)||'';
let sessionCookie=sessionStorage.getItem(SESSION_KEY)||'';
let selectedImageFile=null;
let preparedImage=null;
let deferredInstallPrompt=null;
let state={records:[],inventory:[],menus:[],ocr:null,user:null};

function esc(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}
function toast(message){
  const el=$('#toast');
  el.textContent=message;
  el.style.display='block';
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>{el.style.display='none'},3600);
}
function fmt(value){return value?new Date(value).toLocaleString('vi-VN'):'—'}
function clearAuth(){
  accessToken='';
  sessionCookie='';
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}
function saveAuth(data){
  accessToken=data.token||'';
  sessionCookie=data.sessionCookie||sessionCookie||'';
  if(accessToken) sessionStorage.setItem(ACCESS_KEY,accessToken);
  if(sessionCookie) sessionStorage.setItem(SESSION_KEY,sessionCookie);
}

async function request(path,options={},authenticated=true,retried=false){
  const headers={'content-type':'application/json',...(options.headers||{})};
  if(authenticated&&accessToken) headers.authorization='Bearer '+accessToken;
  const response=await fetch(API+path,{...options,headers,mode:'cors'});
  const data=await response.json().catch(()=>({}));

  if(response.status===401&&authenticated&&!retried&&sessionCookie){
    const refreshed=await refreshAccess();
    if(refreshed) return request(path,options,authenticated,true);
  }
  if(response.status===401&&authenticated){
    clearAuth();
    await showLoggedOut();
    throw new Error('Phiên đăng nhập đã hết. Hãy đăng nhập lại.');
  }
  if(!response.ok) throw new Error(data.message||data.error||('HTTP '+response.status));
  return data;
}

async function refreshAccess(){
  if(!sessionCookie) return false;
  try{
    const response=await fetch(API+'/api/auth/refresh',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({sessionCookie}),
      mode:'cors'
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.token) return false;
    accessToken=data.token;
    sessionStorage.setItem(ACCESS_KEY,accessToken);
    if(data.user) state.user=data.user;
    return true;
  }catch{return false}
}

async function health(){
  try{
    const response=await fetch(API+'/health',{mode:'cors'});
    const d=await response.json();
    const parts=[];
    if(d.dbConfigured) parts.push('DB');
    if(d.storageConfigured) parts.push('Storage');
    if(d.authConfigured) parts.push('Auth');
    if(d.localFallback) parts.push('OCR local');
    if(d.aiOperational) parts.push('AI fallback');
    $('#health').textContent=parts.length?parts.join(' + '):'Backend chưa sẵn sàng';
    $('#health').className='status '+((d.dbConfigured&&d.storageConfigured&&d.authConfigured)?'':'warn');
  }catch{
    $('#health').textContent='Mất kết nối backend';
    $('#health').className='status bad';
  }
}

async function showLoggedIn(user){
  state.user=user||state.user;
  $('#authGate').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  $('#signOutBtn').classList.remove('hidden');
  $('#signOutBtn').textContent=state.user?.email?('Đăng xuất · '+state.user.email):'Đăng xuất';
  await load();
}
async function showLoggedOut(){
  state.user=null;
  $('#appShell').classList.add('hidden');
  $('#signOutBtn').classList.add('hidden');
  $('#authGate').classList.remove('hidden');
}
async function restoreSession(){
  if(!sessionCookie) return showLoggedOut();
  const ok=await refreshAccess();
  if(!ok){clearAuth();return showLoggedOut()}
  return showLoggedIn(state.user);
}

$('#authForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const email=$('#authEmail').value.trim();
  const password=$('#authPassword').value;
  $('#authSubmit').disabled=true;
  $('#authMsg').textContent='Đang đăng nhập…';
  try{
    const response=await fetch(API+'/api/auth/login',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({email,password}),
      mode:'cors'
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message||data.error||'Đăng nhập không thành công');
    saveAuth(data);
    state.user=data.user;
    $('#authPassword').value='';
    $('#authMsg').textContent='';
    await showLoggedIn(data.user);
  }catch(error){
    $('#authMsg').textContent=error.message||'Đăng nhập không thành công';
  }finally{$('#authSubmit').disabled=false}
});

$('#signOutBtn').addEventListener('click',async()=>{
  const cookie=sessionCookie;
  clearAuth();
  try{
    if(cookie) await fetch(API+'/api/auth/logout',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({sessionCookie:cookie}),
      mode:'cors'
    });
  }catch{}
  await showLoggedOut();
});

async function load(){
  try{
    const data=await request('/api/bootstrap');
    state={...state,...data};
    if(data.user) state.user={...state.user,...data.user};
    render();
  }catch(error){toast('Không tải được dữ liệu: '+error.message)}
}

function render(){
  $('#recordsBody').innerHTML=state.records.map(r=>{
    const fields=Object.entries(r.fields||{}).slice(0,4)
      .map(([k,v])=>esc(k)+': '+esc(v?.value??v)).join('<br>');
    const badge=r.status==='ĐÃ XÁC MINH'?'ok':'warn';
    return '<tr><td>'+esc(r.id)+'</td><td>'+esc(r.kind)+'</td><td><span class="badge '+badge+'">'+esc(r.status)+'</span></td><td>'+fields+'</td><td>'+esc(fmt(r.created_at))+'</td></tr>';
  }).join('')||'<tr><td colspan="5">Chưa có dữ liệu.</td></tr>';

  $('#inventoryBody').innerHTML=state.inventory.map(x=>{
    const days=Math.ceil((new Date(x.expiry)-new Date())/86400000);
    const cls=days<0?'bad':days<=7?'warn':'ok';
    const label=days<0?'QUÁ HẠN':days<=7?'SẮP HẾT HẠN':'CÒN HẠN';
    return '<tr><td>'+esc(x.name)+'</td><td>'+esc(x.in_qty)+' '+esc(x.unit||'')+'</td><td>'+esc(x.out_qty)+'</td><td>'+esc(x.balance)+'</td><td>'+esc(x.expiry?.slice(0,10)||'—')+'</td><td><span class="badge '+cls+'">'+label+'</span></td></tr>';
  }).join('')||'<tr><td colspan="6">Chưa có dữ liệu kho.</td></tr>';
}

$$('#nav button').forEach(button=>{
  button.addEventListener('click',()=>{
    $$('#nav button').forEach(x=>x.classList.toggle('active',x===button));
    $$('.tab').forEach(tab=>tab.classList.toggle('active',tab.id==='tab-'+button.dataset.tab));
  });
});

function setSelectedImage(file){
  if(!file) return;
  if(!file.type?.startsWith('image/')) return toast('Vui lòng chọn đúng file ảnh.');
  selectedImageFile=file;
  preparedImage=null;
  $('#preview').src=URL.createObjectURL(file);
  $('#selectedFile').textContent=file.name||'Ảnh vừa chụp';
  $('#ocrMsg').textContent='Ảnh đã sẵn sàng. OCR local sẽ chạy trên thiết bị.';
}
$('#takePhoto').addEventListener('click',()=>$('#cameraInput').click());
$('#choosePhoto').addEventListener('click',()=>$('#fileInput').click());
$('#cameraInput').addEventListener('change',e=>setSelectedImage(e.target.files?.[0]));
$('#fileInput').addEventListener('change',e=>setSelectedImage(e.target.files?.[0]));

async function prepareImage(file,max=1600){
  if(preparedImage&&preparedImage.source===file) return preparedImage;
  const bitmap=await createImageBitmap(file);
  let width=bitmap.width,height=bitmap.height;
  const scale=Math.min(1,max/Math.max(width,height),Math.sqrt(2000000/(width*height)));
  width=Math.max(1,Math.round(width*scale));
  height=Math.max(1,Math.round(height*scale));
  const canvas=document.createElement('canvas');
  canvas.width=width; canvas.height=height;
  canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,width,height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));
  const data=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.onerror=reject;
    reader.readAsDataURL(blob);
  });
  preparedImage={source:file,blob,data,mimeType:'image/jpeg',width,height};
  return preparedImage;
}

function numericToken(value){
  return /^[0-9]+(?:[.,][0-9]+)?$/.test(String(value||'').replace(/\s/g,''));
}
function parseInvoiceLines(rawText,baseConfidence,kind){
  const units=new Set(['kg','g','l','ml','cái','cai','gói','goi','hộp','hop','thùng','thung','chai','lon','bịch','bich','bao','khay']);
  const rows=[];
  for(const sourceLine of String(rawText||'').split(/\r?\n/)){
    const line=sourceLine.replace(/\s+/g,' ').trim();
    if(!line) continue;
    const tokens=line.split(' ');
    if(tokens.length<5) continue;
    const stt=tokens[0].replace(/[.)]/g,'');
    const code=(tokens[1]||'').replace(/[,:;]/g,'');
    if(!/^\d{1,3}$/.test(stt)||!/^[A-Za-z0-9][A-Za-z0-9._/-]{1,}$/.test(code)) continue;
    let unitIndex=-1;
    for(let i=2;i<tokens.length-1;i++){
      const u=tokens[i].toLowerCase().replace(/[,:;]/g,'');
      if(units.has(u)){unitIndex=i;break}
    }
    if(unitIndex<3) continue;
    const quantity=(tokens[unitIndex+1]||'').replace(/[,:;]$/g,'');
    if(!numericToken(quantity)) continue;
    const name=tokens.slice(2,unitIndex).join(' ').trim();
    if(name.length<2) continue;
    rows.push({
      code,name,unit:tokens[unitIndex],quantity,expiry:'',
      confidence:Math.min(90,Math.max(55,baseConfidence||70)),
      kindSuggestion:kind,
      reason:'OCR local; bắt buộc dò lại trước khi xác minh',
      columnVerified:false,
      evidenceLine:line
    });
  }
  return rows.slice(0,100);
}

async function runLocalOcr(prepared,kind){
  $('#ocrMsg').textContent='Đang OCR local trên thiết bị… lần đầu có thể tải bộ nhận dạng.';
  const mod=await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js');
  const worker=await mod.createWorker('vie+eng',1,{
    logger:m=>{
      if(m?.status==='recognizing text'&&Number.isFinite(m.progress)){
        $('#ocrMsg').textContent='OCR local '+Math.round(m.progress*100)+'%';
      }
    }
  });
  try{
    const result=await worker.recognize(prepared.blob);
    const rawText=result?.data?.text||'';
    const baseConfidence=Math.round(result?.data?.confidence||70);
    const lineItems=(kind==='1a'||kind==='1b')?parseInvoiceLines(rawText,baseConfidence,kind):[];
    const persisted=await request('/api/ocr-local',{
      method:'POST',
      body:JSON.stringify({
        kind,
        image:{data:prepared.data,mimeType:prepared.mimeType},
        rawText,
        lineItems
      })
    });
    return {
      jobId:persisted.jobId,
      fields:[],
      lineItems:persisted.lineItems||lineItems,
      rawText,
      imageKey:persisted.imageKey,
      imageSha256:persisted.imageSha256,
      passes:1,
      model:'Tesseract local',
      localFallback:true
    };
  }finally{await worker.terminate()}
}

function localResultNeedsCloud(result,kind){
  if(kind==='1a'||kind==='1b') return !(result.lineItems||[]).length;
  return true;
}
async function tryCloudFallback(prepared,kind,localResult){
  if(!localResultNeedsCloud(localResult,kind)) return localResult;
  $('#ocrMsg').textContent='OCR local chưa đủ cấu trúc. Đang thử AI dự phòng…';
  try{
    const cloud=await request('/api/ocr',{
      method:'POST',
      body:JSON.stringify({kind,image:{data:prepared.data,mimeType:prepared.mimeType}})
    });
    return {...cloud,localFallback:false};
  }catch(error){
    localResult.cloudError=error.message;
    return localResult;
  }
}

$('#runOcr').addEventListener('click',async()=>{
  if(!selectedImageFile) return toast('Hãy chụp ảnh hoặc tải ảnh từ máy trước.');
  $('#runOcr').disabled=true;
  state.ocr=null;
  $('#ocrResult').innerHTML='';
  try{
    const prepared=await prepareImage(selectedImageFile);
    const local=await runLocalOcr(prepared,$('#kind').value);
    state.ocr=await tryCloudFallback(prepared,$('#kind').value,local);
    renderOcr();
  }catch(error){
    $('#ocrMsg').textContent='OCR lỗi: '+error.message;
    toast('OCR lỗi: '+error.message);
  }finally{$('#runOcr').disabled=false}
});

function renderOcr(){
  const o=state.ocr;
  if(!o) return;
  const local=o.localFallback===true;
  const mode=local?'OCR local · bắt buộc dò lại':('AI · '+(o.model||'model'));
  $('#ocrMsg').textContent=mode+(o.cloudError?' · AI dự phòng chưa khả dụng':'');
  const fields=(o.fields||[]).map((x,i)=>
    '<div class="field-row"><b>'+esc(x.key)+'</b><input data-fi="'+i+'" value="'+esc(x.value)+'"><span class="badge '+(x.confidence>=95&&!local?'ok':'warn')+'">'+Math.round(x.confidence||0)+'%</span></div>'
  ).join('');
  const lines=(o.lineItems||[]).map((x,i)=>
    '<div class="ocr-line">'+
      '<input aria-label="Tên hàng" data-ln="'+i+'" data-k="name" value="'+esc(x.name)+'">'+
      '<input aria-label="Số lượng" data-ln="'+i+'" data-k="quantity" value="'+esc(x.quantity||'')+'">'+
      '<input aria-label="ĐVT" data-ln="'+i+'" data-k="unit" value="'+esc(x.unit||'')+'">'+
      '<input aria-label="HSD" data-ln="'+i+'" data-k="expiry" placeholder="HSD" value="'+esc(x.expiry||'')+'">'+
      '<select aria-label="Loại" data-ln="'+i+'" data-k="kind">'+
        '<option '+(x.kindSuggestion==='1a'?'selected':'')+'>1a</option>'+
        '<option '+(x.kindSuggestion==='1b'?'selected':'')+'>1b</option>'+
        '<option '+(x.kindSuggestion==='review'?'selected':'')+'>review</option>'+
      '</select>'+
      '<span class="badge '+(x.confidence>=95&&x.columnVerified&&!local?'ok':'warn')+'">'+Math.round(x.confidence||0)+'% '+(x.columnVerified?'✓ cột':'dò lại')+'</span>'+
    '</div>'
  ).join('');
  const structured=fields.length||lines.length;
  const action=structured?'<button class="primary" id="saveOcr" type="button">Lưu bản ghi</button>':'<span class="badge warn">Chưa đủ dữ liệu cấu trúc để lưu</span>';
  $('#ocrResult').innerHTML=
    '<div class="card">'+
      (local?'<p class="badge warn">OCR local: mọi kết quả phải được người dùng dò lại.</p>':'')+
      '<h3>Trường chung</h3>'+(fields||'<p class="muted">Chưa trích được trường chung.</p>')+
      '<h3>Dòng hàng</h3>'+(lines||'<p class="muted">Chưa tách được dòng hàng.</p>')+
      '<div class="actions">'+action+'</div>'+
      '<details><summary>OCR thô</summary><pre>'+esc(o.rawText||'')+'</pre></details>'+
    '</div>';
  if(structured) $('#saveOcr').addEventListener('click',saveOcr);
}

async function saveOcr(){
  const o=state.ocr;
  const kind=$('#kind').value;
  const fields={};
  (o.fields||[]).forEach((x,i)=>{
    fields[x.key]={
      value:document.querySelector('[data-fi="'+i+'"]').value,
      confidence:Number(x.confidence||0),
      confirmed:!o.localFallback&&Number(x.confidence||0)>=95
    };
  });
  const lines=(o.lineItems||[]).map((x,i)=>{
    const get=key=>document.querySelector('[data-ln="'+i+'"][data-k="'+key+'"]').value;
    return {
      ...x,
      name:get('name'),
      quantity:get('quantity'),
      unit:get('unit'),
      expiry:get('expiry'),
      kind:get('kind'),
      confidence:o.localFallback?Math.min(90,Number(x.confidence||0)):Number(x.confidence||0)
    };
  });
  try{
    if((kind==='1a'||kind==='1b')&&lines.length){
      const usable=lines.filter(x=>['1a','1b'].includes(x.kind));
      const d=await request('/api/invoice-records',{
        method:'POST',
        body:JSON.stringify({
          sharedFields:fields,
          lines:usable,
          rawText:o.rawText,
          imageKey:o.imageKey,
          ocrJobId:o.jobId
        })
      });
      toast('Đã lưu '+d.saved+' dòng; '+d.review+' dòng cần dò lại.');
    }else{
      await request('/api/records',{
        method:'POST',
        body:JSON.stringify({
          kind,fields,rawText:o.rawText,imageKey:o.imageKey,ocrJobId:o.jobId,
          localFallback:o.localFallback===true
        })
      });
      toast(o.localFallback?'Đã lưu ở trạng thái CẦN DÒ LẠI.':'Đã lưu bản ghi.');
    }
    await load();
  }catch(error){toast('Không lưu được: '+error.message)}
}

$('#inventoryForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const payload=Object.fromEntries(new FormData(event.target));
  try{
    await request('/api/inventory',{method:'POST',body:JSON.stringify(payload)});
    toast('Đã nhập kho.');
    event.target.reset();
    await load();
  }catch(error){toast(error.message)}
});

$('#menuForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=Object.fromEntries(new FormData(event.target));
  const items=String(form.lines||'').split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{
    const [dish='',ingredients='',servings='0']=line.split('|').map(x=>x.trim());
    return {date:form.date,meal:form.meal,dish,ingredients,servings};
  });
  try{
    await request('/api/menu',{method:'POST',body:JSON.stringify({items})});
    toast('Đã lưu thực đơn.');
    event.target.reset();
    await load();
  }catch(error){toast(error.message)}
});

$$('[data-period]').forEach(button=>button.addEventListener('click',async()=>{
  try{
    const d=await request('/api/report?period='+button.dataset.period);
    $('#reportBox').textContent=
      'Kỳ: '+d.period+'\n'+
      'Bước 1: '+d.step1+'\n'+
      'Bước 2: '+d.step2+'\n'+
      'Bước 3: '+d.step3+'\n'+
      'Mẫu lưu: '+d.samples+'\n'+
      'Cần dò OCR: '+d.needs+'\n'+
      'Sắp hết hạn: '+d.expiring+'\n'+
      'Quá hạn: '+d.expired;
  }catch(error){toast(error.message)}
}));

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  $('#installBtn').classList.remove('hidden');
});
$('#installBtn').addEventListener('click',async()=>{
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt=null;
  $('#installBtn').classList.add('hidden');
});
window.addEventListener('appinstalled',()=>$('#installBtn').classList.add('hidden'));

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

health();
restoreSession();
setInterval(health,60000);
