/* App Y tế VK — ATTP: nhập kiểm thực từ Excel / ảnh, xem trước & kiểm tra từng ô, lưu Drive/Sheets,
   nhắc việc hằng ngày và kiểm tra vận hành. Phụ thuộc: attp-core.js, attp-v2.js, google-sheets-connector.js */
(function(){
const C=window.AttpCore;
const SCHEMAS=C.SCHEMAS;
const NEXT={b1:'b2',b2:'b3',b3:'sample'};
let imp=null;

/* ---------- tải thư viện khi cần (không chặn trang đăng nhập) ---------- */
const libs={};
function loadScript(url){
  if(!libs[url])libs[url]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=url;s.onload=res;s.onerror=()=>{delete libs[url];rej(new Error('Không tải được thư viện: '+url))};document.head.appendChild(s)});
  return libs[url];
}
const needXLSX=()=>window.XLSX?Promise.resolve():loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
window.ensureXLSX=needXLSX;
const needOCR=()=>window.Tesseract?Promise.resolve():loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

/* ---------- CSS ---------- */
const st=document.createElement('style');
st.textContent=`
.imp-card{border:1px dashed #9bcfc6;background:#f1faf8;border-radius:16px;padding:13px;margin:10px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.imp-card b{flex:1;min-width:200px}
#attpImpModal .modal{width:min(1240px,100%)}
.imp-sum{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.imp-tablewrap{max-height:54vh;overflow:auto;border:1px solid var(--line);border-radius:14px}
.imp-table{min-width:980px;border-collapse:separate;border-spacing:0}
.imp-table th{position:sticky;top:0;z-index:2;background:#f3f8f7;white-space:nowrap}
.imp-table td{padding:4px;border-bottom:1px solid var(--line);vertical-align:middle}
.imp-table input[type=text],.imp-table select{width:100%;min-width:92px;border:1px solid #cfded9;border-radius:8px;padding:7px;font-size:12px;background:#fff}
.imp-table td.bad input,.imp-table td.bad select{border-color:#d92d20;background:#fff1f0}
.imp-table td.warn input,.imp-table td.warn select{border-color:#f79009;background:#fffaeb}
.imp-table td.ocr input{box-shadow:inset 0 0 0 1px #f5c04c}
.imp-table tr.off{opacity:.45}
.imp-table td[data-c$="At"] input{min-width:160px}
.imp-st{font-size:11px;white-space:nowrap;min-width:150px}
.imp-ok{color:#087443;font-weight:800}.imp-err{color:#b42318;font-weight:800}.imp-wr{color:#b54708;font-weight:800}
.imp-img{max-width:100%;max-height:260px;border-radius:12px;border:1px solid var(--line);cursor:zoom-in}
.imp-map{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.imp-map label{font-size:11px;color:#536862;display:flex;flex-direction:column;gap:2px;min-width:130px}
.imp-map select{font-size:12px;padding:5px;border-radius:8px;border:1px solid #cfded9}
.attp-daily{border-radius:16px;padding:12px 14px;margin:0 0 12px;display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;border:1px solid}
.attp-daily.warn{background:#fff7e6;border-color:#f5c04c;color:#7a4b00}
.attp-daily.ok{background:#ecfdf3;border-color:#abefc6;color:#05603a}
.attp-daily ul{margin:4px 0 0 18px;padding:0;font-size:13px}
.attp-daily .grow{flex:1;min-width:220px}
`;
document.head.appendChild(st);

/* ---------- tiện ích ---------- */
const $=id=>document.getElementById(id);
const sessionRows=(sheet,sid)=>objs(sheet).filter(x=>x.MealSessionID===sid);
function sessionCtx(){
  const s=attpSession();
  return{s,today:C.localDate(),sessionDate:s?String(s.Date||'').slice(0,10):'',
    b2Dishes:new Set(sessionRows('FoodStep2',s?.MealSessionID).map(x=>C.norm(x.DishName)))};
}
function fieldOf(k){return SCHEMAS[imp.target].fields.find(f=>f.k===k)}
function fixTimes(v){ // 'T07:30' (chỉ có giờ) → ngày của bữa ăn + giờ
  const d=sessionCtx().sessionDate||C.localDate();
  SCHEMAS[imp.target].fields.forEach(f=>{if(f.type==='dt'&&/^T\d{2}:\d{2}$/.test(String(v[f.k]||'')))v[f.k]=d+v[f.k]});
}

/* ---------- thẻ nhập nhanh trong màn hình Bước 1/2/3 ---------- */
function importCard(target){
  const sheet=SCHEMAS[target].sheet;
  if(!canWrite(sheet))return'';
  const imgOk=target==='b1';
  return'<div class="imp-card"><b>📥 Nhập nhanh từ file Excel'+(imgOk?' hoặc chụp ảnh phiếu/hóa đơn':'')+'</b>'+
    '<span class="muted">Hệ thống tự nhận diện → bạn kiểm tra từng ô → lưu vào Google Sheets.</span>'+
    '<button class="btn primary" onclick="AttpImp.open(\''+target+'\')">Chọn file'+(imgOk?' / chụp ảnh':'')+'</button>'+
    '<button class="btn soft" onclick="AttpImp.template(\''+target+'\')">Tải mẫu Excel</button></div>';
}
['b1','b2','b3'].forEach(t=>{
  const name={b1:'renderStep1',b2:'renderStep2',b3:'renderStep3'}[t];
  const orig=window[name];
  window[name]=function(s){
    let h=orig(s);
    h=h.replace(/<div class="ocr-box">[\s\S]*?<div id="ocrPreview"><\/div><\/div>/,'');
    return h.replace('<div class="attp-grid">',importCard(t)+'<div class="attp-grid">');
  };
});

/* ---------- mở hộp thoại nhập ---------- */
function modal(){
  let m=$('attpImpModal');
  if(!m){m=document.createElement('div');m.id='attpImpModal';m.className='modalbg';
    m.innerHTML='<div class="modal"><div class="modalhead"><div><h2 id="impTitle"></h2><div id="impSub" class="muted"></div></div><button class="close" onclick="AttpImp.close()">×</button></div><div id="impBody"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('change',onChange);
  }
  return m;
}
function open(target){
  const s=attpSession();
  if(!s)return alert('Hãy tạo hoặc chọn một bữa ăn trước khi nhập kiểm thực.');
  imp={target,rows:[],showAll:false,saving:false,confirm:false,file:null,src:'',sheets:[],matrix:null,headerRow:-1,mapping:[],ocr:null,imgUrl:''};
  modal().classList.add('open');
  $('impTitle').textContent='Nhập nhanh · '+SCHEMAS[target].label;
  $('impSub').textContent='Bữa ăn: '+(s.Date||'')+' · '+(s.Meal||'')+(s.Servings?' · '+s.Servings+' suất':'');
  $('impBody').innerHTML='<div class="field"><label>Chọn file Excel/CSV'+(target==='b1'?' hoặc ảnh phiếu giao hàng/hóa đơn':'')+'</label><input id="impFile" type="file" accept=".xlsx,.xls,.csv'+(target==='b1'?',image/*':'')+'" onchange="AttpImp.pick(this.files[0])"></div>'+
    (target==='b1'?'<div class="field"><label>Hoặc chụp ảnh bằng camera</label><input type="file" accept="image/*" capture="environment" onchange="AttpImp.pick(this.files[0])"></div>':'')+
    '<div class="notice">Dữ liệu chỉ được ghi sau khi bạn kiểm tra và bấm xác nhận. Dòng trùng với dữ liệu đã lưu sẽ tự động bị loại.</div><div id="impMsg"></div>';
}
function close(){const m=$('attpImpModal');if(m)m.classList.remove('open');if(imp?.imgUrl)URL.revokeObjectURL(imp.imgUrl);imp=null}
const msg=(h,c='')=>{const e=$('impMsg');if(e)e.innerHTML='<div class="notice '+c+'">'+h+'</div>'};

async function pick(file){
  if(!file||!imp)return;
  imp.file=file;
  try{
    if(/^image\//.test(file.type))await fromImage(file);
    else await fromSheet(file);
    revalidate();render();
  }catch(e){msg(esc(e.message||String(e)),'red')}
}

/* ---------- Excel / CSV ---------- */
function expandMerges(ws){
  (ws['!merges']||[]).forEach(r=>{
    const tl=ws[XLSX.utils.encode_cell(r.s)];if(!tl)return;
    for(let R=r.s.r;R<=r.e.r;R++)for(let c=r.s.c;c<=r.e.c;c++){
      const a=XLSX.utils.encode_cell({r:R,c});if(!ws[a])ws[a]={t:tl.t,v:tl.v,w:tl.w};
    }
  });
}
async function fromSheet(file){
  msg('Đang đọc file…');await needXLSX();
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
  imp.src='excel';imp.sheets=[];
  wb.SheetNames.forEach(n=>{
    const ws=wb.Sheets[n];expandMerges(ws);
    const matrix=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
    imp.sheets.push({name:n,matrix,hr:C.detectHeaderRow(matrix,imp.target)});
  });
  const best=imp.sheets.filter(x=>x.hr>=0).sort((a,b)=>b.matrix.length-a.matrix.length)[0];
  if(!best)throw new Error('Không tìm thấy dòng tiêu đề phù hợp. Hãy dùng “Tải mẫu Excel” hoặc đổi tên cột (vd: Tên thực phẩm, Số lượng, ĐVT, Hạn sử dụng…).');
  useSheet(best.name);
}
function useSheet(name){
  const sh=imp.sheets.find(x=>x.name===name);
  imp.sheetName=name;imp.matrix=sh.matrix;imp.headerRow=sh.hr>=0?sh.hr:0;
  imp.mapping=C.mapHeaders(sh.matrix[imp.headerRow].map(x=>String(x??'')),imp.target);
  rebuild();
}
function rebuild(){
  imp.rows=C.buildRows(imp.matrix,imp.headerRow,imp.mapping,imp.target);
  imp.rows.forEach(r=>fixTimes(r.v));
  if(!imp.rows.length)throw new Error('Không có dòng dữ liệu bên dưới dòng tiêu đề.');
  if(imp.rows.length>500)throw new Error('File có '+imp.rows.length+' dòng, tối đa 500 dòng mỗi lần. Hãy chia nhỏ file.');
  imp.firstPass=true;
}

/* ---------- ảnh + OCR ---------- */
async function preprocess(file){
  try{
    const bmp=await createImageBitmap(file),k=Math.min(2,2200/Math.max(bmp.width,bmp.height));
    const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
    const g=c.getContext('2d');g.drawImage(bmp,0,0,c.width,c.height);
    const d=g.getImageData(0,0,c.width,c.height),p=d.data;
    for(let i=0;i<p.length;i+=4){const y=0.3*p[i]+0.59*p[i+1]+0.11*p[i+2],v=Math.max(0,Math.min(255,(y-128)*1.35+128));p[i]=p[i+1]=p[i+2]=v}
    g.putImageData(d,0,0);return c;
  }catch(_){return file}
}
async function fromImage(file){
  if(imp.target!=='b1')throw new Error('Ảnh chỉ hỗ trợ Bước 1 (phiếu giao hàng/hóa đơn). Bước 2 và 3 hãy dùng file Excel.');
  imp.src='ocr';imp.imgUrl=URL.createObjectURL(file);
  msg('Đang tải bộ nhận diện chữ (lần đầu có thể mất vài chục giây)…');await needOCR();
  msg('<div class="muted">Đang nhận diện ảnh… <b id="impPct">0%</b></div>');
  const src=await preprocess(file);
  const res=await Tesseract.recognize(src,'vie+eng',{logger:m=>{const e=$('impPct');if(e&&m.progress!=null)e.textContent=Math.round(m.progress*100)+'%'}});
  const text=res.data?.text||'',conf=Math.round(res.data?.confidence||0),p=C.parseOcrText(text);
  imp.ocr={text,conf,...p};
  imp.rows=p.items.map(it=>({inc:true,src:'ocr',v:{FoodName:it.FoodName,Quantity:it.Quantity,Unit:it.Unit,ReceivedAt:p.ctx.received||'',SupplierName:p.ctx.supplier||'',SupplierContact:p.ctx.phone||'',InvoiceNo:p.ctx.invoice||''}}));
  imp.firstPass=true;
}

/* ---------- kiểm tra ---------- */
function revalidate(){
  const x=sessionCtx(),sheet=SCHEMAS[imp.target].sheet;
  imp.rows.forEach(r=>{const v=C.validateRow(imp.target,r,x);r.errs=v.errs;r.warns=v.warns});
  C.markDuplicates(imp.target,imp.rows,sessionRows(sheet,x.s?.MealSessionID));
  imp.rows.forEach(r=>{if(imp.firstPass&&r.dup)r.inc=false;if(r.dup)r.inc=false});
  imp.firstPass=false;
}
function stats(){
  const inc=imp.rows.filter(r=>r.inc);
  return{total:imp.rows.length,inc:inc.length,err:inc.filter(r=>r.errs.length).length,warn:inc.filter(r=>r.warns.length).length,dup:imp.rows.filter(r=>r.dup).length};
}

/* ---------- hiển thị ---------- */
function cell(r,i,f){
  const val=r.v[f.k]??'',err=r.errs.filter(e=>e.k===f.k),wr=r.warns.filter(e=>e.k===f.k);
  const cls=(err.length?'bad':wr.length?'warn':'')+(r.src==='ocr'&&val?' ocr':'');
  const tip=err.concat(wr).map(e=>e.msg).join(' • ');
  let ctl;
  if(f.type==='ok')ctl='<select data-r="'+i+'" data-k="'+f.k+'"><option value=""></option>'+[C.OK,C.NOT_OK].map(o=>'<option '+(val===o?'selected':'')+'>'+o+'</option>').join('')+'</select>';
  else if(f.type==='cat')ctl='<select data-r="'+i+'" data-k="'+f.k+'"><option value=""></option>'+[C.CAT_FRESH,C.CAT_DRY].map(o=>'<option '+(val===o?'selected':'')+'>'+esc(o)+'</option>').join('')+'</select>';
  else ctl='<input type="text" data-r="'+i+'" data-k="'+f.k+'" value="'+esc(val)+'">';
  return'<td class="'+cls+'" data-c="'+f.k+'" title="'+esc(tip)+'">'+ctl+'</td>';
}
function statusHtml(r){
  if(r.dup)return'<span class="imp-wr">Trùng — đã loại</span>';
  if(r.errs.length)return'<span class="imp-err">'+r.errs.length+' lỗi: '+esc(r.errs[0].msg)+'</span>';
  if(r.warns.length)return'<span class="imp-wr">Kiểm tra: '+esc(r.warns[0].msg)+'</span>';
  return'<span class="imp-ok">✓ Hợp lệ</span>';
}
function summaryHtml(){
  const s=stats();
  return'<span class="badge">'+s.inc+'/'+s.total+' dòng sẽ lưu</span>'+
    (s.err?'<span class="badge red">'+s.err+' dòng còn lỗi</span>':'<span class="badge">0 lỗi</span>')+
    (s.warn?'<span class="badge warn">'+s.warn+' dòng cần xem lại</span>':'')+
    (s.dup?'<span class="badge blue">'+s.dup+' dòng trùng đã loại</span>':'');
}
function canSave(){const s=stats();return!imp.saving&&s.inc>0&&s.err===0&&imp.confirm}
function render(){
  const fields=SCHEMAS[imp.target].fields.filter(f=>imp.showAll||f.main||imp.rows.some(r=>r.v[f.k]));
  let h='';
  if(imp.src==='ocr'){
    h+='<div class="attp-validation '+(imp.ocr.conf<75?'':'ok')+'">Độ tin cậy nhận diện: '+imp.ocr.conf+'%. '+(imp.ocr.conf<75?'Ảnh khó đọc — hãy đối chiếu kỹ từng dòng với ảnh gốc.':'Vẫn phải đối chiếu từng dòng với ảnh gốc.')+(imp.rows.length?'':' Không tách được dòng hàng nào; hãy thêm dòng thủ công.')+'</div>'+
      '<div class="row" style="align-items:flex-start;gap:12px"><a href="'+imp.imgUrl+'" target="_blank" rel="noopener"><img class="imp-img" src="'+imp.imgUrl+'" alt="Ảnh gốc"></a><details class="grow"><summary class="muted">Xem văn bản máy đọc được</summary><pre style="white-space:pre-wrap;font-size:12px">'+esc(imp.ocr.text)+'</pre></details></div>';
  }else{
    const hdr=imp.matrix[imp.headerRow]||[];
    h+='<div class="muted">File: <b>'+esc(imp.file.name)+'</b>'+(imp.sheets.length>1?' · Trang tính: <select onchange="AttpImp.sheet(this.value)">'+imp.sheets.map(x=>'<option '+(x.name===imp.sheetName?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select>':'')+' · Dòng tiêu đề: '+(imp.headerRow+1)+'</div>'+
      '<details><summary class="muted">Cách hệ thống nhận diện cột ('+imp.mapping.filter(Boolean).length+'/'+hdr.filter(x=>String(x).trim()).length+' cột được dùng) — bấm để chỉnh</summary><div class="imp-map">'+
      hdr.map((x,i)=>String(x).trim()?'<label>'+esc(x)+'<select onchange="AttpImp.map('+i+',this.value)"><option value="">(bỏ qua)</option>'+SCHEMAS[imp.target].fields.map(f=>'<option value="'+f.k+'" '+(imp.mapping[i]===f.k?'selected':'')+'>'+esc(f.label)+'</option>').join('')+'</select></label>':'').join('')+'</div></details>';
  }
  h+='<div id="impSum" class="imp-sum">'+summaryHtml()+'</div>'+
    '<div class="toolbar"><button class="btn soft mini" onclick="AttpImp.addRow()">+ Thêm dòng</button><button class="btn soft mini" onclick="AttpImp.toggleAll()">'+(imp.showAll?'Ẩn bớt cột':'Hiện tất cả cột')+'</button>'+bulkButtons()+'</div>'+
    '<div class="imp-tablewrap"><table class="imp-table"><thead><tr><th>Lưu</th><th>#</th><th>Trạng thái</th>'+fields.map(f=>'<th>'+esc(f.label)+(f.req?' *':'')+'</th>').join('')+'</tr></thead><tbody id="impBodyRows">'+
    imp.rows.map((r,i)=>'<tr data-r="'+i+'" class="'+(r.inc?'':'off')+'"><td><input type="checkbox" '+(r.inc?'checked':'')+' '+(r.dup?'disabled':'')+' onchange="AttpImp.inc('+i+',this.checked)"></td><td>'+(r.line||i+1)+'</td><td class="imp-st">'+statusHtml(r)+'</td>'+fields.map(f=>cell(r,i,f)).join('')+'</tr>').join('')+'</tbody></table></div>'+
    '<label class="notice" style="display:flex;gap:8px;align-items:flex-start;margin-top:10px"><input type="checkbox" id="impConfirm" '+(imp.confirm?'checked':'')+' onchange="AttpImp.setConfirm(this.checked)"><span>Tôi đã đối chiếu dữ liệu với '+(imp.src==='ocr'?'ảnh gốc':'file gốc / thực tế')+' và chịu trách nhiệm về tính chính xác của các dòng được lưu.</span></label>'+
    '<div id="impMsg"></div><div class="actions"><button class="btn soft" onclick="AttpImp.close()">Hủy</button><button id="impSave" class="btn primary" '+(canSave()?'':'disabled')+' onclick="AttpImp.save()">Lưu '+stats().inc+' dòng vào Google Sheets</button></div>';
  $('impBody').innerHTML=h;
}
function bulkButtons(){
  const empties=SCHEMAS[imp.target].fields.filter(f=>f.type==='ok'&&imp.rows.some(r=>r.inc&&!String(r.v[f.k]??'').trim()));
  const cat=imp.target==='b1'&&imp.rows.some(r=>r.inc&&!r.v.FoodCategory&&r.guessCat);
  return empties.map(f=>'<button class="btn soft mini" onclick="AttpImp.fillOk(\''+f.k+'\')">Điền ô trống “'+esc(f.label)+'” = Đạt</button>').join('')+(cat?'<button class="btn soft mini" onclick="AttpImp.useGuess()">Dùng nhóm gợi ý cho dòng chưa chọn</button>':'');
}
/* cập nhật tại chỗ để không mất con trỏ khi đang gõ */
function refreshInPlace(){
  const body=$('impBodyRows');if(!body)return;
  imp.rows.forEach((r,i)=>{
    const tr=body.querySelector('tr[data-r="'+i+'"]');if(!tr)return;
    tr.className=r.inc?'':'off';
    tr.querySelector('.imp-st').innerHTML=statusHtml(r);
    const chk=tr.querySelector('input[type=checkbox]');chk.checked=r.inc;chk.disabled=!!r.dup;
    tr.querySelectorAll('td[data-c]').forEach(td=>{
      const k=td.dataset.c,err=r.errs.filter(e=>e.k===k),wr=r.warns.filter(e=>e.k===k),val=r.v[k]??'';
      td.className=(err.length?'bad':wr.length?'warn':'')+(r.src==='ocr'&&val?' ocr':'');
      td.title=err.concat(wr).map(e=>e.msg).join(' • ');
      const ctl=td.firstElementChild;if(ctl&&ctl!==document.activeElement&&ctl.value!==val)ctl.value=val;
    });
  });
  $('impSum').innerHTML=summaryHtml();
  const b=$('impSave');if(b){b.disabled=!canSave();b.textContent='Lưu '+stats().inc+' dòng vào Google Sheets'}
}
function onChange(e){
  const t=e.target;if(!imp||!t.dataset||t.dataset.r===undefined||!t.dataset.k)return;
  const r=imp.rows[+t.dataset.r],f=fieldOf(t.dataset.k);if(!r||!f)return;
  r.v[f.k]=C.normalizeValue(f,t.value);fixTimes(r.v);const v=r.v[f.k];r.src=r.src==='ocr'?'ocr':r.src;
  if(t.tagName==='INPUT')t.value=v;
  revalidate();refreshInPlace();
}

/* ---------- thao tác ---------- */
const act={
  open,close,pick,
  sheet(n){try{useSheet(n);revalidate();render()}catch(e){msg(esc(e.message),'red')}},
  map(i,k){
    if(k)imp.mapping=imp.mapping.map(x=>x===k?'':x);
    imp.mapping[i]=k;
    try{rebuild();revalidate();render()}catch(e){msg(esc(e.message),'red')}
  },
  inc(i,on){imp.rows[i].inc=on;refreshInPlace()},
  setConfirm(on){imp.confirm=on;refreshInPlace()},
  toggleAll(){imp.showAll=!imp.showAll;render()},
  addRow(){imp.rows.push({inc:true,src:imp.src||'manual',v:{}});revalidate();render()},
  fillOk(k){
    if(!confirm('Xác nhận bạn đã kiểm tra thực tế và kết quả của các ô trống này đều là “Đạt”?'))return;
    imp.rows.forEach(r=>{if(r.inc&&!String(r.v[k]??'').trim())r.v[k]=C.OK});
    revalidate();render();
  },
  useGuess(){imp.rows.forEach(r=>{if(r.inc&&!r.v.FoodCategory&&r.guessCat)r.v.FoodCategory=r.guessCat});revalidate();render()},
  async template(target){
    await needXLSX();
    const f=SCHEMAS[target].fields;
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([f.map(x=>x.label)]),'Du lieu');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
      ['Hướng dẫn'],['Điền mỗi dòng một bản ghi ở trang “Du lieu”, giữ nguyên dòng tiêu đề.'],
      ['Ngày: ngày/tháng/năm (vd 03/10/2026); giờ: 07:30. Số lượng dùng số (vd 5,5).'],
      ['Cảm quan / vệ sinh: ghi Đạt hoặc Không đạt. Nếu Không đạt phải ghi biện pháp xử lý.'],
      ['Cột có dấu * trong app là bắt buộc: '+f.filter(x=>x.req).map(x=>x.label).join(', ')]]),'Huong dan');
    XLSX.writeFile(wb,'mau-kiem-thuc-'+target.toUpperCase()+'.xlsx');
  },
  async save(){
    if(!canSave())return;
    const {s}=sessionCtx(),u=state.user?.email||'',now=new Date().toISOString();
    const rows=imp.rows.filter(r=>r.inc);
    if(!confirm('Lưu '+rows.length+' dòng vào sổ kiểm thực?'))return;
    imp.saving=true;refreshInPlace();msg('Đang tải file gốc lên Drive…');
    try{
      let evidence='';
      if(imp.file){const up=await GoogleSheetsConnector.uploadDriveFile(imp.file);evidence=up.id||''}
      const base=Date.now(),sch=SCHEMAS[imp.target];
      msg('Đang ghi '+rows.length+' dòng vào Google Sheets…');
      const out=rows.map((r,i)=>C.toSheetRow(imp.target,r.v,{id:sch.prefix+'-'+base+'-'+(i+1),sessionId:s.MealSessionID,meal:s.Meal||'',evidence,
        ocrText:imp.src==='ocr'?imp.ocr.text.slice(0,4000):'',ocrConf:imp.src==='ocr'?String(imp.ocr.conf):'',status:'VERIFIED',user:u,now}));
      await GoogleSheetsConnector.appendRows(sch.range,out);
      // nhật ký chứng từ (không chặn nếu lỗi phụ)
      const aux=[];
      if(evidence)aux.push(GoogleSheetsConnector.appendRows('Documents!A:K',[['DOC-'+base,'ATTP_'+imp.target.toUpperCase()+'_IMPORT','MealSession',s.MealSessionID,evidence,imp.file.name,imp.file.type||'',now,imp.src==='ocr'?'OCR_REVIEWED':'EXCEL_IMPORTED',u,'rows='+rows.length]]));
      if(imp.src==='ocr')aux.push(GoogleSheetsConnector.appendRows('OCRInbox!A:O',[['OCR-'+base,now,u,'ATTP_RECEIPT',evidence,imp.file.name,imp.ocr.text.slice(0,4000),String(imp.ocr.conf),JSON.stringify(imp.ocr.ctx),'REVIEWED',u,now,'MealSession',s.MealSessionID,now]]));
      aux.push(GoogleSheetsConnector.appendAudit('ATTP_IMPORT_'+imp.target.toUpperCase(),sch.sheet,out[0][0],'rows='+rows.length+'; source='+imp.src+'; file='+(imp.file?.name||'')));
      await Promise.allSettled(aux);
      state.attpFlash='Đã lưu '+rows.length+' dòng ('+sch.label+') vào Google Sheets lúc '+new Date().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})+'.';
      const t=imp.target;close();
      await refresh([sch.sheet,'Documents','OCRInbox']);
      state.attpFocus=NEXT[t];renderPage();
    }catch(e){imp.saving=false;refreshInPlace();msg(esc(e.message||String(e)),'red')}
  }
};
window.AttpImp=act;

/* ================= Nhắc việc hằng ngày + kiểm tra hệ thống ================= */
function dailyMissing(){
  const day=C.localDate(),sessions=objs('MealSessions').filter(x=>String(x.Date).slice(0,10)===day),miss=[];
  if(!sessions.length)miss.push('Chưa tạo bữa ăn nào cho hôm nay');
  sessions.forEach(m=>{
    const id=m.MealSessionID,t=m.Meal||id;
    if(!sessionRows('FoodStep1',id).length)miss.push(t+': chưa lưu Bước 1 (trước chế biến)');
    if(!sessionRows('FoodStep2',id).length)miss.push(t+': chưa lưu Bước 2 (trong chế biến)');
    const d3=sessionRows('FoodStep3',id);
    if(!d3.length)miss.push(t+': chưa lưu Bước 3 (trước khi ăn)');
    const have=new Set(sessionRows('FoodSampleLog',id).map(x=>C.norm(x.SampleName)));
    const lack=d3.filter(x=>!have.has(C.norm(x.DishName)));
    if(d3.length&&lack.length)miss.push(t+': thiếu mẫu lưu '+lack.length+' món');
  });
  const due=dueSamples();if(due.length)miss.push('Có '+due.length+' mẫu lưu đã đủ hạn, cần ghi nhận hủy mẫu');
  return miss;
}
const isSchoolDay=()=>{const d=new Date().getDay();return d>=1&&d<=5};
function bannerHtml(){
  if(!state.authorized||!canWrite('MealSessions'))return'';
  if(!['MealSessions','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog'].every(k=>state.loaded.has(k)))return'';
  const flash=state.attpFlash?'<div class="attp-daily ok"><div class="grow">✓ '+esc(state.attpFlash)+'</div></div>':'';
  if(!isSchoolDay())return flash;
  const miss=dailyMissing(),hr=new Date().getHours();
  const perm=('Notification' in window)&&Notification.permission==='default'?'<button class="btn soft mini" onclick="AttpImp.notify()">🔔 Bật thông báo</button>':'';
  const health=state.role==='ADMIN'?'<button class="btn soft mini" onclick="AttpImp.health()">Kiểm tra hệ thống</button>':'';
  if(!miss.length)return flash+'<div class="attp-daily ok"><div class="grow">✓ Kiểm thực ATTP hôm nay đã lưu đủ.</div>'+health+'</div><div id="attpHealth"></div>';
  return flash+'<div class="attp-daily '+(hr>=8?'warn':'ok')+'"><div class="grow"><b>'+(hr>=8?'⏰ Kiểm thực hôm nay chưa hoàn tất':'Kiểm thực hôm nay')+'</b><ul>'+miss.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div><button class="btn primary mini" onclick="go(\'kitchen\')">Mở kiểm thực</button>'+perm+health+'</div><div id="attpHealth"></div>';
}
act.notify=async()=>{try{await Notification.requestPermission()}catch(_){}renderPage()};
act.health=async()=>{
  const box=$('attpHealth');if(!box)return;box.innerHTML='<div class="notice">Đang kiểm tra…</div>';
  try{
    const r=await GoogleSheetsConnector.healthCheck();
    box.innerHTML=r.checks&&r.checks.length?'<div class="notice '+(r.allOk?'ok':'red')+'"><b>'+(r.allOk?'Hệ thống ổn định':'Có mục chưa ổn')+'</b> · '+esc(new Date(r.checkedAt).toLocaleString('vi-VN'))+'<ul>'+r.checks.map(c=>'<li>'+(c.ok?'✓':'✗')+' '+esc(c.check)+(c.msg?' — '+esc(c.msg):'')+'</li>').join('')+'</ul></div>':'<div class="notice">'+esc(r.note||'Không có dữ liệu')+'</div>';
  }catch(e){box.innerHTML='<div class="notice red">Không kiểm tra được: '+esc(e.message||String(e))+'</div>'}
};
const __renderPage=window.renderPage;
window.renderPage=function(){
  __renderPage();
  if(state.page==='today'||state.page==='kitchen'){const m=$('main');if(m)m.insertAdjacentHTML('afterbegin',bannerHtml())}
};
const __authorize=window.authorize;
window.authorize=async function(){
  await __authorize();
  startWatch();
};
function startWatch(){
  if(window.__attpWatch)return;window.__attpWatch=true;
  const ATTP=['MealSessions','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog'];
  ensure(ATTP,true).catch(()=>{});
  setInterval(async()=>{
    if(!state.authorized||document.hidden)return;
    try{await refresh(ATTP)}catch(_){return}
    if(!isSchoolDay()||!('Notification' in window)||Notification.permission!=='granted')return;
    const now=new Date(),slot=now.getHours()*60+now.getMinutes()>=15*60?'pm':now.getHours()*60+now.getMinutes()>=10*60+30?'am':'';
    if(!slot)return;
    const key='attp_notified_'+C.localDate()+'_'+slot;
    if(localStorage.getItem(key))return;
    const miss=dailyMissing();if(!miss.length)return;
    localStorage.setItem(key,'1');
    try{new Notification('Kiểm thực ATTP chưa hoàn tất',{body:miss.slice(0,3).join('\n')})}catch(_){}
  },10*60*1000);
}
})();
