
/* App Y tế VK — ATTP V2 aligned to Quyết định 1246/QĐ-BYT */
state.attpFocus=state.attpFocus||'b1';
state.ocrDraft=state.ocrDraft||null;

const ATTP_KEYS=['MealSessions','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','Inventory','OCRInbox'];
const fmtDT=v=>v?String(v).replace('T',' ').slice(0,16):'';
const isoLocalInput=()=>{
  const d=new Date(),off=d.getTimezoneOffset()*60000;
  return new Date(d.getTime()-off).toISOString().slice(0,16);
};
const addHoursIso=(s,h)=>{const d=s?new Date(s):new Date();return new Date(d.getTime()+h*3600000).toISOString()};
const field=(id,label,value='',type='text',cls='')=>'<div class="field '+cls+'"><label>'+esc(label)+'</label><input id="'+id+'" type="'+type+'" value="'+esc(value)+'"></div>';
const sel=(id,label,opts,value='',cls='')=>'<div class="field '+cls+'"><label>'+esc(label)+'</label><select id="'+id+'">'+opts.map(o=>'<option value="'+esc(o)+'" '+(o===value?'selected':'')+'>'+esc(o)+'</option>').join('')+'</select></div>';
const ta=(id,label,value='',cls='wide')=>'<div class="field '+cls+'"><label>'+esc(label)+'</label><textarea id="'+id+'">'+esc(value)+'</textarea></div>';

function attpSession(){
  const sessions=objs('MealSessions').slice().sort((a,b)=>String(b.Date).localeCompare(String(a.Date)));
  if(!state.kitchenSession&&sessions[0])state.kitchenSession=sessions[0].MealSessionID;
  return sessions.find(x=>x.MealSessionID===state.kitchenSession)||null;
}
function attpDone(sessionId,key){
  const map={b1:'FoodStep1',b2:'FoodStep2',b3:'FoodStep3',sample:'FoodSampleLog'};
  return objs(map[key]).some(x=>x.MealSessionID===sessionId);
}
function attpDishNames(sessionId){
  return [...new Set(objs('FoodStep3').filter(x=>x.MealSessionID===sessionId).map(x=>x.DishName).filter(Boolean))];
}
function attpSampleMissing(sessionId){
  const dishes=attpDishNames(sessionId);
  const samples=new Set(objs('FoodSampleLog').filter(x=>x.MealSessionID===sessionId).map(x=>norm(x.SampleName)));
  return dishes.filter(d=>!samples.has(norm(d)));
}
function attpStageBox(k,n,title,done){
  return '<div class="attp-stage '+(done?'done ':'')+(state.attpFocus===k?'active':'')+'" onclick="state.attpFocus=\''+k+'\';renderPage()"><div class="num">'+(done?'✓':n)+'</div><b>'+esc(title)+'</b><div class="muted">'+(done?'Đã lưu':'Chưa hoàn tất')+'</div></div>';
}

kitchenPage=function(){
  ensure(ATTP_KEYS,false);
  const sessions=objs('MealSessions').slice().sort((a,b)=>String(b.Date).localeCompare(String(a.Date)));
  const s=attpSession();
  const missing=s?attpSampleMissing(s.MealSessionID):[];
  const sampleRequired=s&&Number(s.Servings||0)>=30;
  return '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">An toàn thực phẩm · kiểm thực 3 bước</h2><div class="muted">Quy trình điện tử theo QĐ 1246/QĐ-BYT; mỗi thao tác lưu vào Master và AuditLog.</div></div>'+
    (canWrite('MealSessions')?'<button class="btn primary" onclick="newMealSession1246()">+ Bữa ăn</button>':'')+'</div>'+
    '<div class="attp-law"><b>Cấu trúc bắt buộc:</b> Bước 1 kiểm tra trước chế biến → Bước 2 kiểm tra trong chế biến → Bước 3 kiểm tra trước khi ăn → lưu mẫu. Với bữa từ 30 suất trở lên, lưu mẫu áp dụng cho tất cả món; mẫu đặc tối thiểu 100 g, mẫu lỏng tối thiểu 150 ml, bảo quản 2–8°C và ít nhất 24 giờ.</div>'+
    '<div class="toolbar"><select onchange="state.kitchenSession=this.value;state.attpFocus=\'b1\';renderPage()"><option value="">Chọn bữa ăn</option>'+sessions.slice(0,80).map(x=>'<option value="'+esc(x.MealSessionID)+'" '+(x.MealSessionID===state.kitchenSession?'selected':'')+'>'+esc((x.Date||'')+' · '+(x.Meal||''))+'</option>').join('')+'</select>'+
    '<a class="btn soft mini" target="_blank" rel="noopener" href="https://thuvienphapluat.vn/van-ban/The-thao-Y-te/Quyet-dinh-1246-QD-BYT-che-do-kiem-thuc-ba-buoc-luu-mau-thuc-an-kinh-doanh-dich-vu-an-uong-2017-345320.aspx" style="text-decoration:none">QĐ 1246/QĐ-BYT</a></div>'+
    (s?'<div class="attp-progress">'+attpStageBox('b1','1','Trước chế biến',attpDone(s.MealSessionID,'b1'))+attpStageBox('b2','2','Trong chế biến',attpDone(s.MealSessionID,'b2'))+attpStageBox('b3','3','Trước khi ăn',attpDone(s.MealSessionID,'b3'))+attpStageBox('sample','4','Lưu mẫu',attpDone(s.MealSessionID,'sample'))+'</div>'+
      (sampleRequired&&missing.length?'<div class="attp-validation">Bữa ≥30 suất: còn thiếu mẫu lưu cho '+missing.length+' món: '+esc(missing.join(', '))+'.</div>':'')+
      renderAttpFocus(s):'<div class="empty">Tạo hoặc chọn một bữa ăn để bắt đầu kiểm thực.</div>')+
    '</div>'+
    renderInventoryOfficial();
};

function renderAttpFocus(s){
  if(state.attpFocus==='b2')return renderStep2(s);
  if(state.attpFocus==='b3')return renderStep3(s);
  if(state.attpFocus==='sample')return renderSampleStep(s);
  return renderStep1(s);
}

function renderStep1(s){
  const list=objs('FoodStep1').filter(x=>x.MealSessionID===s.MealSessionID);
  const ocr=(state.role==='ADMIN')?'<div class="ocr-box"><b>📷 OCR phiếu giao hàng / hóa đơn</b><div class="muted">Ảnh chỉ được dùng để gợi ý dữ liệu. Admin kiểm tra rồi mới lưu Master.</div><input id="attpOcrFile" type="file" accept="image/*" capture="environment" onchange="runAttpOCR(this.files[0])"><div id="ocrStatus"></div><div id="ocrPreview"></div></div>':'';
  return '<div class="attp-form"><h3>Bước 1 · Kiểm tra trước khi chế biến</h3><div class="attp-help">Ghi nhận nguyên liệu thực phẩm trước khi nhập/chế biến, giấy tờ kèm theo, cảm quan và biện pháp xử lý.</div>'+ocr+
    '<div class="attp-grid">'+
    sel('b1cat','Nhóm thực phẩm',['Tươi sống/đông lạnh','Khô/bao gói sẵn/phụ gia'],'Tươi sống/đông lạnh')+
    field('b1name','Tên thực phẩm *','')+field('b1received','Thời gian nhập',isoLocalInput(),'datetime-local')+
    field('b1qty','Khối lượng','', 'number')+field('b1unit','Đơn vị','kg')+
    field('b1supplier','Nơi cung cấp / tên cơ sở','')+field('b1supplierContact','Địa chỉ, điện thoại nhà cung cấp','')+
    field('b1delivery','Người giao hàng','')+field('b1invoice','Chứng từ / hóa đơn','')+
    field('b1vet','Giấy ĐK VS thú y','')+field('b1quarantine','Giấy kiểm dịch','')+
    field('b1manufacturer','Cơ sở sản xuất','')+field('b1manufacturerAddr','Địa chỉ sản xuất','')+
    field('b1expiry','Hạn sử dụng','', 'date')+field('b1storage','Điều kiện bảo quản','')+
    sel('b1sensory','Kiểm tra cảm quan',['Đạt','Không đạt'],'Đạt')+field('b1quick','Xét nghiệm nhanh (nếu có)','')+
    ta('b1action','Biện pháp xử lý / ghi chú','')+
    '</div><div id="attpMsg"></div><div class="actions"><button class="btn primary" onclick="saveStep1()">Lưu Bước 1</button></div></div>'+
    attpTable(list,['ReceivedAt','FoodCategory','FoodName','Quantity','Unit','SupplierName','InvoiceNo','SensoryResult','VerificationStatus']);
}

function renderStep2(s){
  const list=objs('FoodStep2').filter(x=>x.MealSessionID===s.MealSessionID);
  return '<div class="attp-form"><h3>Bước 2 · Kiểm tra trong quá trình chế biến</h3><div class="attp-help">Kiểm tra người chế biến, trang thiết bị, khu vực chế biến; cảm quan món ăn và thời gian sơ chế/chế biến.</div><div class="attp-grid">'+
    field('b2dish','Tên món ăn *','')+field('b2ingredients','Nguyên liệu chính (tên, số lượng)','', 'text','span2')+
    field('b2servings','Số suất ăn',s.Servings||'', 'number')+
    field('b2prep','Thời gian sơ chế xong',isoLocalInput(),'datetime-local')+
    field('b2cook','Thời gian chế biến xong',isoLocalInput(),'datetime-local')+
    sel('b2person','Vệ sinh người chế biến',['Đạt','Không đạt'],'Đạt')+
    sel('b2equip','Trang thiết bị, dụng cụ',['Đạt','Không đạt'],'Đạt')+
    sel('b2area','Khu vực chế biến và phụ trợ',['Đạt','Không đạt'],'Đạt')+
    sel('b2sensory','Cảm quan thức ăn',['Đạt','Không đạt'],'Đạt')+
    ta('b2action','Biện pháp xử lý / ghi chú','')+
    '</div><div id="attpMsg"></div><div class="actions"><button class="btn primary" onclick="saveStep2()">Lưu Bước 2</button></div></div>'+
    attpTable(list,['Meal','DishName','MainIngredients','Servings','PrepCompletedAt','CookCompletedAt','ProcessorHygiene','EquipmentHygiene','AreaHygiene','SensoryResult']);
}

function renderStep3(s){
  const list=objs('FoodStep3').filter(x=>x.MealSessionID===s.MealSessionID);
  return '<div class="attp-form"><h3>Bước 3 · Kiểm tra trước khi ăn</h3><div class="attp-help">Đối chiếu thực đơn, kiểm tra chia thức ăn, dụng cụ, che đậy/bảo quản và cảm quan món ăn.</div><div class="attp-grid">'+
    field('b3dish','Tên món ăn *','')+field('b3servings','Số suất ăn',s.Servings||'','number')+
    field('b3portion','Thời gian chia món xong',isoLocalInput(),'datetime-local')+
    field('b3mealstart','Thời gian bắt đầu ăn',isoLocalInput(),'datetime-local')+
    sel('b3menu','Đối chiếu thực đơn',['Đạt','Không đạt'],'Đạt')+
    sel('b3utensils','Dụng cụ chia/chứa/che đậy/bảo quản',['Đạt','Không đạt'],'Đạt','span2')+
    sel('b3sensory','Cảm quan món ăn',['Đạt','Không đạt'],'Đạt')+
    ta('b3action','Biện pháp xử lý / ghi chú','')+
    '</div><div id="attpMsg"></div><div class="actions"><button class="btn primary" onclick="saveStep3()">Lưu Bước 3</button></div></div>'+
    attpTable(list,['Meal','DishName','Servings','PortionCompletedAt','MealStartAt','ServingUtensilsCondition','MenuMatched','SensoryResult']);
}

function renderSampleStep(s){
  const list=objs('FoodSampleLog').filter(x=>x.MealSessionID===s.MealSessionID);
  const missing=attpSampleMissing(s.MealSessionID);
  const d=missing[0]||'';
  return '<div class="attp-form"><h3>Lưu mẫu thức ăn</h3><div class="attp-help">Mỗi món dùng một dụng cụ riêng, niêm phong; lấy trước khi bắt đầu ăn. Bữa từ 30 suất trở lên phải lưu mẫu tất cả món.</div>'+
    (missing.length?'<div class="attp-validation">Còn thiếu: '+esc(missing.join(', '))+'</div>':'<div class="attp-validation ok">Các món đã ghi ở Bước 3 hiện đều có mẫu lưu.</div>')+
    '<div class="attp-grid">'+
    field('smname','Tên mẫu thức ăn *',d)+field('smservings','Số suất ăn',s.Servings||'','number')+
    sel('smtype','Loại mẫu',['Thức ăn đặc / rau quả ăn ngay','Thức ăn lỏng'],'Thức ăn đặc / rau quả ăn ngay')+
    field('smamount','Khối lượng / thể tích mẫu','100','number')+field('smunit','Đơn vị','g')+
    field('smcontainer','Dụng cụ chứa mẫu','Hộp có nắp đậy kín')+
    field('smtemp','Nhiệt độ bảo quản (°C)','4','number')+
    field('smcollected','Thời gian lấy mẫu',isoLocalInput(),'datetime-local')+
    field('smdestroy','Thời gian dự kiến hủy',fmtForInput(addHoursIso(new Date().toISOString(),24)),'datetime-local')+
    sel('smsealed','Đã niêm phong',['Có','Không'],'Có')+
    sel('smhold','Giữ mẫu do nghi ngờ sự cố/yêu cầu cơ quan quản lý',['Không','Có'],'Không')+
    ta('smnote','Ghi chú chất lượng mẫu','')+
    '</div><div id="sampleValidation"></div><div id="attpMsg"></div><div class="actions"><button class="btn primary" onclick="saveSample()">Lưu mẫu</button></div></div>'+
    attpTable(list,['SampleName','Meal','Servings','SampleAmount','Unit','StorageTempC','CollectedAt','DestroyAt','Sealed','Min24hOK','AmountOK']);
}
function fmtForInput(v){if(!v)return'';const d=new Date(v),off=d.getTimezoneOffset()*60000;return new Date(d.getTime()-off).toISOString().slice(0,16)}
function attpTable(list,cols){
  if(!list.length)return'<div class="attp-records empty">Chưa có bản ghi.</div>';
  return'<div class="attp-records table"><table><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+list.slice().reverse().map(o=>'<tr>'+cols.map(c=>'<td>'+esc(o[c]||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function msgAttp(text,ok=false){
  const m=document.getElementById('attpMsg');if(m)m.innerHTML='<div class="notice '+(ok?'ok':'')+'">'+esc(text)+'</div>';
}
function getv(id){return document.getElementById(id)?.value?.trim?.()||''}

async function saveStep1(){
  const s=attpSession();if(!s)return;
  const food=getv('b1name');if(!food)return msgAttp('Tên thực phẩm là bắt buộc.');
  const now=new Date().toISOString(),ocr=state.ocrDraft;
  let evidence='',ocrText='',ocrConf='';
  try{
    msgAttp('Đang lưu Bước 1…');
    if(ocr?.file){
      const up=await GoogleSheetsConnector.uploadDriveFile(ocr.file);
      evidence=up.id||'';ocrText=ocr.text||'';ocrConf=String(ocr.confidence??'');
      await GoogleSheetsConnector.appendRows('OCRInbox!A:O',[[
        'OCR-'+Date.now(),now,state.user?.email||'', 'ATTP_RECEIPT',evidence,ocr.file.name,ocrText,ocrConf,
        JSON.stringify(ocr.parsed||{}),'REVIEWED',state.user?.email||'',now,'MealSession',s.MealSessionID,now
      ]]);
    }
    const row=[
      'FS1-'+Date.now(),s.MealSessionID,getv('b1cat'),food,getv('b1manufacturer'),getv('b1manufacturerAddr'),
      getv('b1received'),getv('b1qty'),getv('b1unit'),getv('b1supplier'),getv('b1supplierContact'),getv('b1delivery'),
      getv('b1invoice'),getv('b1vet'),getv('b1quarantine'),getv('b1expiry'),getv('b1storage'),getv('b1sensory'),
      getv('b1quick'),getv('b1action'),evidence,ocrText,ocrConf,'VERIFIED',state.user?.email||'',now
    ];
    await GoogleSheetsConnector.appendRows('FoodStep1!A:Z',[row]);
    GoogleSheetsConnector.appendAudit('ATTP_STEP1_SAVE','FoodStep1',row[0],food).catch(()=>{});
    state.ocrDraft=null;await refresh(['FoodStep1','OCRInbox']);state.attpFocus='b2';renderPage();
  }catch(e){msgAttp(e.message||String(e))}
}
async function saveStep2(){
  const s=attpSession();if(!s)return;const dish=getv('b2dish');if(!dish)return msgAttp('Tên món ăn là bắt buộc.');
  const now=new Date().toISOString(),row=['FS2-'+Date.now(),s.MealSessionID,s.Meal||'',dish,getv('b2ingredients'),getv('b2servings'),getv('b2prep'),getv('b2cook'),getv('b2person'),getv('b2equip'),getv('b2area'),getv('b2sensory'),getv('b2action'),'',state.user?.email||'',now];
  try{await GoogleSheetsConnector.appendRows('FoodStep2!A:P',[row]);GoogleSheetsConnector.appendAudit('ATTP_STEP2_SAVE','FoodStep2',row[0],dish).catch(()=>{});await refresh(['FoodStep2']);state.attpFocus='b3';renderPage()}catch(e){msgAttp(e.message||String(e))}
}
async function saveStep3(){
  const s=attpSession();if(!s)return;const dish=getv('b3dish');if(!dish)return msgAttp('Tên món ăn là bắt buộc.');
  const now=new Date().toISOString(),row=['FS3-'+Date.now(),s.MealSessionID,s.Meal||'',dish,getv('b3servings'),getv('b3portion'),getv('b3mealstart'),getv('b3utensils'),getv('b3menu'),getv('b3sensory'),getv('b3action'),'',state.user?.email||'',now];
  try{await GoogleSheetsConnector.appendRows('FoodStep3!A:N',[row]);GoogleSheetsConnector.appendAudit('ATTP_STEP3_SAVE','FoodStep3',row[0],dish).catch(()=>{});await refresh(['FoodStep3']);state.attpFocus='sample';renderPage()}catch(e){msgAttp(e.message||String(e))}
}
async function saveSample(){
  const s=attpSession();if(!s)return;const name=getv('smname');if(!name)return msgAttp('Tên mẫu là bắt buộc.');
  const amt=Number(getv('smamount')),temp=Number(getv('smtemp')),type=getv('smtype'),unit=getv('smunit'),collected=getv('smcollected'),destroy=getv('smdestroy');
  const minAmount=type.startsWith('Thức ăn lỏng')?150:100;
  const amountOK=amt>=minAmount;
  const tempOK=temp>=2&&temp<=8;
  const hours=(new Date(destroy)-new Date(collected))/3600000;
  const min24=hours>=24;
  const sealed=getv('smsealed')==='Có';
  const messages=[];if(!amountOK)messages.push('Lượng mẫu chưa đạt tối thiểu '+minAmount+' '+(type.startsWith('Thức ăn lỏng')?'ml':'g'));if(!tempOK)messages.push('Nhiệt độ phải trong khoảng 2–8°C');if(!min24)messages.push('Thời gian lưu phải ít nhất 24 giờ');if(!sealed)messages.push('Mẫu phải được niêm phong.');
  const box=document.getElementById('sampleValidation');
  if(messages.length){if(box)box.innerHTML='<div class="attp-validation">'+esc(messages.join(' · '))+'</div>';return}
  const now=new Date().toISOString(),row=['SMP-'+Date.now(),s.MealSessionID,name,s.Meal||'',getv('smservings'),String(amt),unit,getv('smcontainer'),String(temp),collected,destroy,getv('smnote'),state.user?.email||'','',sealed?'YES':'NO',min24?'YES':'NO',amountOK?'YES':'NO',getv('smhold')==='Có'?'YES':'NO','',now];
  try{await GoogleSheetsConnector.appendRows('FoodSampleLog!A:T',[row]);GoogleSheetsConnector.appendAudit('ATTP_SAMPLE_SAVE','FoodSampleLog',row[0],name).catch(()=>{});await refresh(['FoodSampleLog']);renderPage()}catch(e){msgAttp(e.message||String(e))}
}

async function newMealSession1246(){
  const meal=prompt('Tên ca/bữa ăn','Bữa trưa');if(!meal)return;
  const servings=prompt('Số suất ăn dự kiến','');
  const id='MEAL-'+today().replaceAll('-','')+'-'+Date.now().toString().slice(-5);
  const now=new Date().toISOString();
  const row=[id,today(),meal,'','','','','','OPEN',now,String(servings||''),state.user?.name||state.user?.email||'', '', ''];
  try{
    await GoogleSheetsConnector.appendRows('MealSessions!A:N',[row]);
    GoogleSheetsConnector.appendAudit('CREATE_MEAL_SESSION_1246','MealSession',id,'meal='+meal+'; servings='+String(servings||'')).catch(()=>{});
    state.kitchenSession=id;state.attpFocus='b1';await refresh(['MealSessions']);renderPage();
  }catch(e){alert(e.message||e)}
}

async function runAttpOCR(file){
  if(!file)return;
  if(state.role!=='ADMIN')return alert('Chỉ ADMIN được dùng OCR nhập chứng từ.');
  const st=document.getElementById('ocrStatus'),pv=document.getElementById('ocrPreview');
  if(!window.Tesseract){if(st)st.innerHTML='<div class="notice red">Bộ OCR chưa tải được.</div>';return}
  try{
    st.innerHTML='<div class="ocr-progress"><i id="ocrBar"></i></div><div class="muted">Đang nhận diện ảnh…</div>';
    const res=await Tesseract.recognize(file,'vie+eng',{logger:m=>{const b=document.getElementById('ocrBar');if(b&&m.progress!=null)b.style.width=Math.round(m.progress*100)+'%'}});
    const text=res.data?.text||'',confidence=Math.round(res.data?.confidence||0),parsed=parseAttpOCR(text);
    state.ocrDraft={file,text,confidence,parsed};
    applyAttpOCR(parsed);
    pv.innerHTML='<div class="attp-validation ok">OCR '+confidence+'% · đã tự điền các trường nhận diện được. Admin cần kiểm tra trước khi lưu.</div><div class="ocr-preview">'+esc(text)+'</div>';
    st.innerHTML='';
  }catch(e){st.innerHTML='<div class="notice red">'+esc(e.message||e)+'</div>'}
}
function parseAttpOCR(text){
  const t=String(text||''),lines=t.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const pick=(rx)=>{const m=t.match(rx);return m?String(m[1]||'').trim():''};
  const dateRaw=pick(/(?:ngày|date|ngày giao|ngày nhập)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i);
  const invoice=pick(/(?:số hóa đơn|hóa đơn|invoice|số phiếu|phiếu giao)\s*[:#\-]?\s*([A-Z0-9._\/-]{3,})/i);
  const phone=pick(/(?:điện thoại|sđt|tel|phone)\s*[:\-]?\s*((?:0|\+84)[0-9 .-]{8,13})/i);
  const supplier=pick(/(?:nhà cung cấp|đơn vị giao|công ty|cơ sở)\s*[:\-]?\s*([^\n]{3,80})/i);
  const qty=pick(/(?:khối lượng|số lượng|qty|quantity)\s*[:\-]?\s*([0-9.,]+)/i);
  const expiry=pick(/(?:hạn sử dụng|hạn dùng|hsd|expiry)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i);
  const itemLine=lines.find(x=>/(kg|g|lít|lit|ml|thịt|cá|rau|sữa|gạo|trứng|dầu|gia vị)/i.test(x)&&x.length<100)||'';
  return{supplier,invoice,phone,qty,received:dateRaw,expiry,foodName:itemLine};
}
function normalizeDateInput(s){
  const m=String(s||'').match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);if(!m)return'';
  let y=m[3];if(y.length===2)y='20'+y;return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
}
function applyAttpOCR(p){
  const set=(id,v)=>{const e=document.getElementById(id);if(e&&v)e.value=v};
  set('b1supplier',p.supplier);set('b1supplierContact',p.phone);set('b1invoice',p.invoice);set('b1qty',String(p.qty||'').replace(',','.'));set('b1name',p.foodName);set('b1expiry',normalizeDateInput(p.expiry));
}
function renderInventoryOfficial(){
  const list=objs('Inventory').slice().sort((a,b)=>Number(a.DaysRemaining||99999)-Number(b.DaysRemaining||99999));
  return'<div id="inventoryCard" class="card"><div class="row"><div class="grow"><h2 style="margin:0">Kho thực phẩm & sữa</h2><div class="muted">FEFO · ưu tiên xuất lô gần HSD trước.</div></div>'+(canWrite('Inventory')?'<button class="btn primary" onclick="openGeneric(\'Inventory\')">+ Nhập kho</button>':'')+'</div><div class="table"><table><thead><tr><th>Mặt hàng</th><th>Lô</th><th>Tồn</th><th>HSD</th><th>Bảo quản</th><th>Cảnh báo</th></tr></thead><tbody>'+list.slice(0,400).map(x=>'<tr><td><b>'+esc(x.ItemName)+'</b></td><td>'+esc(x.BatchNo)+'</td><td>'+esc(x.CurrentQty)+' '+esc(x.Unit)+'</td><td>'+esc(x.ExpiryDate)+'</td><td>'+esc(x.StorageCondition)+'</td><td>'+(Number(x.DaysRemaining)<=7?badge('Còn '+x.DaysRemaining+' ngày','warn'):badge(x.ExpiryStatus||'Ổn'))+'</td></tr>').join('')+'</tbody></table></div></div>';
}
