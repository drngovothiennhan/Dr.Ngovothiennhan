(()=>{
  const style=document.createElement('style');
  style.textContent=`.tbimp-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.tbimp-grid select,.tbimp-grid input{width:100%;padding:10px;border:1px solid #cbdeda;border-radius:10px;background:#fff}.tbimp-progress{height:10px;border-radius:999px;overflow:hidden;background:#e7efed;margin:8px 0}.tbimp-progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,#086f68,#2dab8d);transition:width .2s}.tbimp-warn{padding:10px;border-radius:10px;background:#fff5dc;color:#795c14}.tbimp-map{font-size:12px;color:#6a7d80;white-space:pre-wrap}.tbimp-result{white-space:pre-wrap}@media(max-width:520px){.tbimp-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  const panel=document.getElementById('panel');
  if(!panel)return;
  const card=document.createElement('div');
  card.className='p';
  card.innerHTML=`
    <div class="row"><div><h3 style="margin:0">Nhập dữ liệu trực tiếp vào Neon</h3><span class="mut">XLSX/XLS/CSV • xử lý theo lô • không đưa file gốc lên web công khai</span></div><span class="pill">Admin</span></div>
    <div class="tbimp-grid" style="margin-top:12px">
      <label><b>Loại dữ liệu</b><select id="tbKind"><option value="screening">Danh sách đã khám</option><option value="resident">Danh sách dân cư / tham chiếu</option></select></label>
      <label><b>Khu phố</b><select id="tbKp"><option value="">Toàn phường / không cố định KP</option></select></label>
    </div>
    <label style="display:block;margin-top:9px"><b>Chọn file</b><input id="tbFile" type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"></label>
    <div id="tbWarn" class="tbimp-warn" style="margin-top:9px">Nếu chọn một KP cho “Danh sách đã khám”, file mới sẽ được coi là dữ liệu khám chuẩn của KP đó khi hoàn tất; hồ sơ cũ của KP không còn trong file có thể bị loại khỏi số đã khám.</div>
    <div id="tbMap" class="tbimp-map" style="margin-top:9px"></div>
    <button id="tbAnalyze" class="btn soft" style="margin-top:9px">1. Phân tích file</button>
    <button id="tbImport" class="btn" style="margin-top:9px" disabled>2. Nhập & cập nhật hệ thống</button>
    <div class="tbimp-progress"><i id="tbBar"></i></div>
    <div id="tbState" class="status">Chưa chọn file.</div>
    <div id="tbResult" class="tbimp-result small mut" style="margin-top:8px"></div>`;
  panel.appendChild(card);

  const kpSel=document.getElementById('tbKp');
  for(let i=1;i<=39;i++){const o=document.createElement('option');o.value=String(i);o.textContent='KP '+String(i).padStart(2,'0');kpSel.appendChild(o)}
  const fileEl=document.getElementById('tbFile'),kindEl=document.getElementById('tbKind'),stateEl=document.getElementById('tbState'),mapEl=document.getElementById('tbMap'),resultEl=document.getElementById('tbResult'),barEl=document.getElementById('tbBar'),importBtn=document.getElementById('tbImport');
  let prepared=null;

  function n(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]/g,'')}
  function choose(headers,aliases){const hs=headers.map(h=>({raw:h,key:n(h)})),as=aliases.map(n);for(const a of as){const z=hs.find(h=>h.key===a);if(z)return z.raw}for(const a of as){if(a.length<3)continue;const z=hs.find(h=>h.key.includes(a)||a.includes(h.key));if(z)return z.raw}return null}
  function detectMap(rows){const headers=[...new Set(rows.slice(0,50).flatMap(r=>Object.keys(r||{})))];return {
    full_name:choose(headers,['Họ tên','Họ và tên','Họ tên người khám','Họ tên công dân','Họ tên học sinh','Họ tên trẻ']),
    dob:choose(headers,['Ngày sinh','DOB','Date of birth','Năm sinh']),
    cccd:choose(headers,['CCCD','Số CCCD','CMND','Số CMND','ĐDCN','Số định danh','Định danh cá nhân']),
    neighborhood_no:choose(headers,['Khu phố','KP','Khu phố mới']),
    address_text:choose(headers,['Địa chỉ','Địa chỉ hiện tại','Nơi ở','Nơi cư trú']),
    permanent_address:choose(headers,['Thường trú','Địa chỉ thường trú','Nơi thường trú']),
    temporary_address:choose(headers,['Tạm trú','Địa chỉ tạm trú','Nơi tạm trú']),
    reference_address:choose(headers,['Địa chỉ tham chiếu','Địa chỉ hộ dân']),
    examined_date:choose(headers,['Ngày khám','Ngày khám sức khỏe','Ngày KSK']),
    phone:choose(headers,['Số điện thoại','Điện thoại','SĐT','Phone']),
    exam_unit:choose(headers,['Đơn vị khám','Nơi khám','Cơ sở khám']),
    screening_form:choose(headers,['Hình thức khám','Loại khám']),
    gender:choose(headers,['Giới tính','Sex']),
    ward_text:choose(headers,['Phường','Xã phường','Phường xã'])
  }}
  function val(r,k,map){const h=map[k];return h==null?'':r[h]}
  function isoDate(v){if(v==null||v==='')return null;if(v instanceof Date&&!isNaN(v)){const y=v.getFullYear(),m=String(v.getMonth()+1).padStart(2,'0'),d=String(v.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}let s=String(v).trim();if(!s)return null;if(/^\d{4}$/.test(s))return null;let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return null}
  function kp(v){const m=String(v??'').match(/(?:^|\D)([1-9]|[12]\d|3[0-9])(?:\D|$)/);return m?Number(m[1]):null}
  function clean(v){return String(v??'').trim()}
  function nonEmptyRow(r){return Object.values(r||{}).some(v=>clean(v)!=='')}
  function parseCSV(text){text=text.replace(/^\uFEFF/,'');const first=(text.split(/\r?\n/,1)[0]||'');const ds=[',',';','\t'];const delim=ds.sort((a,b)=>(first.split(b).length-first.split(a).length))[0];const out=[];let row=[],field='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){field+='"';i++}else if(c==='"')q=false;else field+=c}else{if(c==='"')q=true;else if(c===delim){row.push(field);field=''}else if(c==='\n'){row.push(field.replace(/\r$/,''));out.push(row);row=[];field=''}else field+=c}}row.push(field.replace(/\r$/,''));if(row.some(x=>x!==''))out.push(row);const head=(out.shift()||[]).map(x=>clean(x));return out.map(a=>Object.fromEntries(head.map((h,i)=>[h,a[i]??''])))}
  async function readRows(file,buf){const ext=(file.name.split('.').pop()||'').toLowerCase();if(ext==='csv'||file.type==='text/csv'){return parseCSV(new TextDecoder('utf-8').decode(buf))}let X;try{X=await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs')}catch(e){X=await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm')}const wb=X.read(buf,{type:'array',cellDates:true});const ws=wb.Sheets[wb.SheetNames[0]];if(!ws)throw Error('Không tìm thấy sheet dữ liệu');return X.utils.sheet_to_json(ws,{defval:'',raw:false,blankrows:false})}
  async function hash(buf){const h=await crypto.subtle.digest('SHA-256',buf.slice(0));return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')}
  function convert(rows,map,kind,chosenKp){return rows.filter(nonEmptyRow).map((r,i)=>{const base={source_row:i+2,full_name:clean(val(r,'full_name',map)),dob:isoDate(val(r,'dob',map)),cccd:clean(val(r,'cccd',map)),address_text:clean(val(r,'address_text',map)),neighborhood_no:kp(val(r,'neighborhood_no',map))||chosenKp||null};if(kind==='resident'){return {...base,permanent_address:clean(val(r,'permanent_address',map)),temporary_address:clean(val(r,'temporary_address',map)),reference_address:clean(val(r,'reference_address',map))}}return {...base,examined_date:isoDate(val(r,'examined_date',map)),source_neighborhood_no:kp(val(r,'neighborhood_no',map))||chosenKp||null,phone:clean(val(r,'phone',map)),exam_unit:clean(val(r,'exam_unit',map)),screening_form:clean(val(r,'screening_form',map)),gender:clean(val(r,'gender',map)),ward_text:clean(val(r,'ward_text',map))}})}
  function showState(t,ok){stateEl.textContent=t;stateEl.className='status '+(ok===true?'okbox':ok===false?'err':'')}
  function showMap(map,count){const lines=Object.entries(map).filter(([,v])=>v).map(([k,v])=>`${k} ← ${v}`);mapEl.textContent=`Nhận diện ${count.toLocaleString('vi-VN')} dòng.\n`+(lines.length?lines.join('\n'):'Chưa nhận diện được cột phù hợp.');}
  async function ensureAdmin(){if(!client)throw Error('Neon Auth chưa sẵn sàng');const s=await client.auth.getSession();const u=s?.data?.user||s?.data?.session?.user;if(!u||String(u.email||'').toLowerCase()!==ADMIN)throw Error('Cần đăng nhập tài khoản Admin trước khi nhập dữ liệu');if(String(u.role||'').toLowerCase()!=='admin'){/* role có thể nằm trong JWT dù user object không trả role; RPC vẫn là lớp kiểm soát cuối */}return u}
  async function rpc(name,args){const r=await client.rpc(name,args);if(r?.error)throw r.error;return r?.data}

  document.getElementById('tbAnalyze').onclick=async()=>{prepared=null;importBtn.disabled=true;barEl.style.width='0%';resultEl.textContent='';const f=fileEl.files?.[0];if(!f)return showState('Hãy chọn file XLSX/XLS/CSV.',false);if(f.size>50*1024*1024)return showState('File vượt 50 MB. Hãy chia nhỏ file trước khi nhập.',false);try{showState('Đang đọc và phân tích file…');const buf=await f.arrayBuffer();let rows=await readRows(f,buf);rows=rows.filter(nonEmptyRow);if(!rows.length)throw Error('File không có dòng dữ liệu');const map=detectMap(rows);const kind=kindEl.value;const chosenKp=kpSel.value?Number(kpSel.value):null;if(!map.full_name)throw Error('Không nhận diện được cột Họ tên');if(kind==='screening'&&!map.cccd&&!map.dob)throw Error('Danh sách khám cần có CCCD hoặc Ngày sinh để ghép an toàn');if(kind==='resident'&&!map.cccd&&!map.dob)throw Error('Danh sách dân cư cần CCCD hoặc Ngày sinh để định danh');const converted=convert(rows,map,kind,chosenKp);const good=converted.filter(x=>x.full_name&&(x.cccd||x.dob));if(!good.length)throw Error('Không có dòng đủ Họ tên + (CCCD hoặc Ngày sinh)');const digest=await hash(buf);prepared={file:f,kind,chosenKp,map,rows:good,sha256:digest};showMap(map,good.length);showState(`Sẵn sàng nhập ${good.length.toLocaleString('vi-VN')} dòng. SHA-256: ${digest.slice(0,16)}…`,true);importBtn.disabled=false}catch(e){showState(e.message||String(e),false)}};

  importBtn.onclick=async()=>{if(!prepared)return;importBtn.disabled=true;try{await ensureAdmin();const p=prepared;if(p.kind==='screening'&&p.chosenKp){const ok=confirm(`XÁC NHẬN: File này sẽ trở thành dữ liệu khám chuẩn cho KP ${String(p.chosenKp).padStart(2,'0')}. Sau khi hoàn tất, các hồ sơ khám cũ của KP không còn trong file mới có thể bị loại khỏi số đã khám. Tiếp tục?`);if(!ok){importBtn.disabled=false;return}}
      showState('Đang tạo phiên nhập…');const batch=await rpc('tam_binh_admin_begin_import',{p_file_name:p.file.name,p_dataset_kind:p.kind,p_row_count:p.rows.length,p_neighborhood_no:p.chosenKp,p_file_sha256:p.sha256});if(!batch)throw Error('Không tạo được phiên nhập');const chunk=250;let last=null;for(let i=0;i<p.rows.length;i+=chunk){const part=p.rows.slice(i,i+chunk);last=await rpc(p.kind==='resident'?'tam_binh_admin_process_resident_chunk':'tam_binh_admin_process_screening_chunk',{p_batch_id:batch,p_rows:part});const done=Math.min(p.rows.length,i+part.length),pc=Math.round(done*100/p.rows.length);barEl.style.width=pc+'%';showState(`Đang xử lý ${done.toLocaleString('vi-VN')}/${p.rows.length.toLocaleString('vi-VN')} dòng (${pc}%)…`,true)}showState('Đang hoàn tất, khử trùng và cập nhật dashboard…',true);const final=await rpc(p.kind==='resident'?'tam_binh_admin_finalize_resident':'tam_binh_admin_finalize_screening',{p_batch_id:batch});barEl.style.width='100%';showState('Nhập dữ liệu hoàn tất.',true);resultEl.textContent=JSON.stringify({batch_id:batch,chunk_result:last,final_result:final},null,2);try{anonToken=null;await loadMetrics();await loadPublic();await adminStats()}catch{}prepared=null;fileEl.value='';importBtn.disabled=true}catch(e){showState('Nhập dữ liệu dừng do lỗi: '+(e.message||String(e)),false);resultEl.textContent='Phiên nhập chưa được finalize. Dữ liệu cũ vẫn được giữ cho đến khi quy trình hoàn tất.';importBtn.disabled=false}}
})();
