/* App Y tế VK — ATTP core: chuẩn hóa, kiểm tra hợp lệ, chống trùng, nhận diện cột/ảnh.
   Không phụ thuộc DOM → kiểm thử được bằng Node (xem tests/attp-core.test.js). */
(function(root){
'use strict';
const pad=n=>String(n).padStart(2,'0');
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
const localDate=(d=new Date())=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const addDays=(ymd,n)=>{const [y,m,d]=ymd.split('-').map(Number);const t=new Date(Date.UTC(y,m-1,d+n));return t.getUTCFullYear()+'-'+pad(t.getUTCMonth()+1)+'-'+pad(t.getUTCDate())};
const OK='Đạt',NOT_OK='Không đạt';
const CAT_FRESH='Tươi sống/đông lạnh',CAT_DRY='Khô/bao gói sẵn/phụ gia';

/* ---------- ngày giờ ---------- */
function validYMD(y,m,d){if(m<1||m>12||d<1||d>31)return false;const t=new Date(Date.UTC(y,m-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d}
function fromSerial(n){ // số ngày Excel → {ymd,hm}
  if(!(n>20000&&n<80000))return null;
  const days=Math.floor(n),ms=Math.round((n-days)*86400000);
  const t=new Date(Date.UTC(1899,11,30)+days*86400000+ms);
  return{ymd:t.getUTCFullYear()+'-'+pad(t.getUTCMonth()+1)+'-'+pad(t.getUTCDate()),hm:ms?pad(t.getUTCHours())+':'+pad(t.getUTCMinutes()):''};
}
function parseDT(v){ // → {ymd,hm} | null ; ngày theo kiểu Việt Nam: d/m/y
  if(v==null||v==='')return null;
  if(typeof v==='number')return fromSerial(v);
  const s=String(v).trim();if(!s)return null;
  let hm='';const tm=s.match(/(\d{1,2})\s*[:h]\s*(\d{2})/i);
  if(tm){const h=+tm[1],mi=+tm[2];if(h>23||mi>59)return null;hm=pad(h)+':'+pad(mi)}
  const iso=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(iso){const y=+iso[1],m=+iso[2],d=+iso[3];return validYMD(y,m,d)?{ymd:y+'-'+pad(m)+'-'+pad(d),hm}:null}
  const vn=s.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/);
  if(vn){let d=+vn[1],m=+vn[2],y=+vn[3];if(vn[3].length===2)y=2000+y;if(vn[3].length===3)return null;return validYMD(y,m,d)?{ymd:y+'-'+pad(m)+'-'+pad(d),hm}:null}
  if(/^\d+(\.\d+)?$/.test(s))return fromSerial(Number(s));
  return null;
}
const toDate=v=>{const p=parseDT(v);return p?p.ymd:''};
const toDT=v=>{const p=parseDT(v);return p?(p.hm?p.ymd+'T'+p.hm:p.ymd):''};

/* ---------- số, đơn vị, đạt/không đạt ---------- */
function parseNum(v){
  if(typeof v==='number')return Number.isFinite(v)?v:NaN;
  let t=String(v??'').trim().replace(/\s/g,'').replace(/[^0-9.,\-]/g,'');
  if(!t||t==='-')return NaN;
  if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t))t=t.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t))t=t.replace(/,/g,'');
  else t=t.replace(',','.');
  const n=Number(t);return Number.isFinite(n)?n:NaN;
}
const UNITS={kg:'kg',kgs:'kg',kilogram:'kg',kilo:'kg',g:'g',gr:'g',gram:'g',l:'lít',lit:'lít',liter:'lít',ml:'ml',hop:'hộp',goi:'gói',qua:'quả',trai:'quả',chai:'chai',bao:'bao',thung:'thùng',con:'con',bo:'bó',cu:'củ',lon:'lon',tui:'túi',chuc:'chục',vi:'vỉ',can:'can',tam:'tấm',ct:'cây',cay:'cây',mieng:'miếng',phan:'phần'};
function normUnit(v){const k=norm(v);return UNITS[k]||String(v??'').trim()}
const knownUnit=v=>Object.values(UNITS).includes(String(v||'').trim());
function normOK(v){
  const raw=String(v??'').trim();if(!raw)return'';
  if(/^[✓✔☑]$/.test(raw))return OK;
  if(/^[✗✘☒]$/.test(raw))return NOT_OK;
  const k=norm(raw);
  if(['dat','ok','co','tot','yes','true','hople','duongdat','binhthuong','bt','1'].includes(k))return OK;
  if(['khongdat','kdat','kd','ko','khong','fail','no','false','khonghople','0','khongdatyeucau'].includes(k))return NOT_OK;
  return raw; // giữ nguyên → validate sẽ báo lỗi
}
function guessCategory(name){
  const k=norm(name);
  if(/(thit|ca|tom|cua|muc|rau|cu|qua|trai|trung|ga|heo|bo|vit|haisan|dauhu|giacam|nem|chalua|dongl)/.test(k)&&!/(sua|bot|dau an|nuocmam)/.test(k))return CAT_FRESH;
  if(/(gao|sua|dau|duong|muoi|nuocmam|bot|mi|giavi|banh|hop|nuoc|kem|bun|mien|nui|ngucoc|yaourt|phomai)/.test(k))return CAT_DRY;
  return'';
}

/* ---------- lược đồ ---------- */
const S=(k,label,al,o={})=>Object.assign({k,label,al,type:'text'},o);
const SCHEMAS={
 b1:{label:'Bước 1 · Nguyên liệu nhập (trước chế biến)',sheet:'FoodStep1',range:'FoodStep1!A:Z',prefix:'FS1',
  fields:[
   S('FoodName','Tên thực phẩm',['tenthucpham','tenhang','tenmathang','thucpham','tennguyenlieu','nguyenlieu','mathang','tenvattu','tensanpham','sanpham','noidung','diengiai'],{req:1,main:1}),
   S('FoodCategory','Nhóm',['nhomthucpham','nhom','loaithucpham'],{type:'cat',main:1}),
   S('ReceivedAt','Thời gian nhập',['thoigiannhap','ngaynhaphang','ngaynhap','ngaygiao','thoigiangiao','ngay'],{type:'dt',req:1,main:1}),
   S('Quantity','Khối lượng',['khoiluong','soluong','soluongthucnhap','thucnhap','luong','sl','kl'],{type:'num',req:1,main:1}),
   S('Unit','ĐVT',['donvitinh','donvi','dvt','dvtinh'],{type:'unit',req:1,main:1}),
   S('SupplierName','Nơi cung cấp',['noicungcap','nhacungcap','nguoicungcap','donvigiao','tencoso','coso','ncc'],{main:1}),
   S('SupplierContact','Địa chỉ/SĐT NCC',['diachidienthoai','diachincc','dienthoai','sdt','lienhe','diachi']),
   S('DeliveryPerson','Người giao',['nguoigiaohang','nguoigiao']),
   S('InvoiceNo','Chứng từ/HĐ',['sophieugiaohang','sohoadon','somahoadon','sochungtu','sophieu','phieugiao','hoadon','chungtu'],{main:1}),
   S('VetCert','Giấy VS thú y',['giaydkvsthuy','giayvsthuy','vsthuy','giaykhamthuy','giaythuy']),
   S('QuarantineCert','Giấy kiểm dịch',['giaykiemdich','kiemdich']),
   S('Manufacturer','Cơ sở sản xuất',['cososanxuat','nhasanxuat','hangsanxuat','thuonghieu']),
   S('ManufacturerAddr','Địa chỉ SX',['diachisanxuat','diachicososanxuat','diachisx','dcsx']),
   S('ExpiryDate','Hạn sử dụng',['hansudung','handung','hethan','hsd'],{type:'date',main:1}),
   S('StorageCondition','Bảo quản',['dieukienbaoquan','baoquan']),
   S('SensoryResult','Cảm quan',['ketquacamquan','kiemtracamquan','camquan','danhgia','ketqua'],{type:'ok',req:1,main:1}),
   S('QuickTest','Xét nghiệm nhanh',['xetnghiemnhanh','testnhanh']),
   S('Action','Xử lý/Ghi chú',['bienphapxuly','bienphap','xuly','ghichu'],{main:1})
  ]},
 b2:{label:'Bước 2 · Trong chế biến',sheet:'FoodStep2',range:'FoodStep2!A:P',prefix:'FS2',
  fields:[
   S('DishName','Tên món ăn',['tenmonan','monan','tenmon','mon'],{req:1,main:1}),
   S('MainIngredients','Nguyên liệu chính',['nguyenlieuchinh','nguyenlieu','thanhphan'],{main:1}),
   S('Servings','Số suất',['sosuatan','suatan','sosuat','soluongsuat'],{type:'int',main:1}),
   S('PrepCompletedAt','Sơ chế xong',['thoigiansochexong','sochexong','thoigiansoche','soche'],{type:'dt',main:1}),
   S('CookCompletedAt','Chế biến xong',['thoigianchebienxong','chebienxong','thoigianchebien','chebien'],{type:'dt',main:1}),
   S('ProcessorHygiene','VS người CB',['vesinhnguoichebien','nguoichebien','vsnguoi','nhanvien'],{type:'ok',req:1,main:1}),
   S('EquipmentHygiene','Dụng cụ',['trangthietbidungcu','trangthietbi','dungcu'],{type:'ok',req:1,main:1}),
   S('AreaHygiene','Khu vực',['khuvucchebien','khuvuc'],{type:'ok',req:1,main:1}),
   S('SensoryResult','Cảm quan',['camquanthucan','camquan','ketqua','danhgia'],{type:'ok',req:1,main:1}),
   S('Action','Xử lý/Ghi chú',['bienphapxuly','bienphap','xuly','ghichu'],{main:1})
  ]},
 b3:{label:'Bước 3 · Trước khi ăn',sheet:'FoodStep3',range:'FoodStep3!A:N',prefix:'FS3',
  fields:[
   S('DishName','Tên món ăn',['tenmonan','monan','tenmon','mon'],{req:1,main:1}),
   S('Servings','Số suất',['sosuatan','suatan','sosuat'],{type:'int',main:1}),
   S('PortionCompletedAt','Chia món xong',['thoigianchiamonxong','chiamonxong','thoigianchia','chia'],{type:'dt',main:1}),
   S('MealStartAt','Bắt đầu ăn',['thoigianbatdauan','batdauan','giobatdauan'],{type:'dt',main:1}),
   S('ServingUtensilsCondition','Dụng cụ chia/che đậy',['dungcuchia','dungcuchiachuache','dungcuchiachuachedaybaoquan','dungcu'],{type:'ok',req:1,main:1}),
   S('MenuMatched','Đối chiếu thực đơn',['doichieuthucdon','thucdon'],{type:'ok',req:1,main:1}),
   S('SensoryResult','Cảm quan',['camquanmonan','camquan','ketqua','danhgia'],{type:'ok',req:1,main:1}),
   S('Action','Xử lý/Ghi chú',['bienphapxuly','bienphap','xuly','ghichu'],{main:1})
  ]}
};

/* ---------- nhận diện cột ---------- */
function scoreHeader(h,f){
  let best=0;
  for(const a of f.al){
    if(h===a)return 3;
    if(h.length>=4&&a.length>=4&&(h.startsWith(a)||a.startsWith(h)))best=Math.max(best,2);
    else if(a.length>=5&&h.includes(a))best=Math.max(best,1);
  }
  return best;
}
function mapHeaders(headers,target){
  const fields=SCHEMAS[target].fields,hs=headers.map(norm);
  const cand=[];
  hs.forEach((h,i)=>{if(!h)return;fields.forEach(f=>{const sc=scoreHeader(h,f);if(sc>0)cand.push({i,k:f.k,sc})})});
  cand.sort((a,b)=>b.sc-a.sc||a.i-b.i);
  const mapping=headers.map(()=>''),usedF=new Set(),usedI=new Set();
  cand.forEach(c=>{if(usedF.has(c.k)||usedI.has(c.i))return;usedF.add(c.k);usedI.add(c.i);mapping[c.i]=c.k});
  return mapping;
}
function detectHeaderRow(matrix,target){
  let best=-1,bestN=0;const key=SCHEMAS[target].fields[0].k;
  for(let i=0;i<Math.min(25,matrix.length);i++){
    const m=mapHeaders((matrix[i]||[]).map(x=>String(x??'')),target);
    const n=m.filter(Boolean).length;
    if(n>bestN&&m.includes(key)){bestN=n;best=i}
  }
  return bestN>=2?best:-1;
}
const isTotalRow=vals=>vals.some(x=>/^(tong|cong|tongcong|congkhoan)$/.test(norm(x)));

/* ---------- chuẩn hóa 1 giá trị theo kiểu trường ---------- */
function normalizeValue(f,raw){
  if(raw==null)return'';
  switch(f.type){
    case'dt':{
      // chỉ có giờ (vd 07:30 hoặc ô giờ Excel 0.3125) → trả 'THH:mm', giao diện sẽ ghép với ngày của bữa ăn
      if(typeof raw==='number'&&raw>0&&raw<1){const mins=Math.round(raw*1440);return'T'+pad(Math.floor(mins/60)%24)+':'+pad(mins%60)}
      const ts=String(raw).trim().match(/^(\d{1,2})\s*[:h]\s*(\d{2})$/i);
      if(ts&&+ts[1]<24&&+ts[2]<60)return'T'+pad(+ts[1])+':'+pad(+ts[2]);
      return toDT(raw)||String(raw).trim();
    }
    case'date':return toDate(raw)||String(raw).trim();
    case'num':{const n=parseNum(raw);return Number.isNaN(n)?String(raw).trim():String(n)}
    case'int':{const n=parseNum(raw);return Number.isNaN(n)?String(raw).trim():String(Math.round(n))}
    case'unit':return normUnit(raw);
    case'ok':return normOK(raw);
    case'cat':{const k=norm(raw);if(!k)return'';if(k.startsWith('tuoi')||k.startsWith('dong'))return CAT_FRESH;if(k.startsWith('kho')||k.startsWith('bao')||k.includes('phugia'))return CAT_DRY;return String(raw).trim()}
    default:return String(raw).trim();
  }
}
function buildRows(matrix,headerRow,mapping,target){
  const fields=Object.fromEntries(SCHEMAS[target].fields.map(f=>[f.k,f]));
  const rows=[];
  for(let r=headerRow+1;r<matrix.length;r++){
    const line=matrix[r]||[];
    if(!line.some(x=>String(x??'').trim()))continue;
    if(isTotalRow(line))continue;
    const v={};
    mapping.forEach((k,i)=>{if(k)v[k]=normalizeValue(fields[k],line[i])});
    if(!Object.values(v).some(x=>String(x).trim()))continue;
    rows.push({inc:true,v,src:'excel',line:r+1});
  }
  return rows;
}

/* ---------- OCR ảnh ---------- */
function parseOcrText(text){
  const t=String(text||'').replace(/[|¦]/g,' ');
  const pick=rx=>{const m=t.match(rx);return m?String(m[1]||'').trim():''};
  const ctx={
    received:toDT(pick(/(?:ngày\s*(?:giao|nhập)?|date)\s*[:\-]?\s*(\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4})/i)),
    invoice:pick(/(?:số\s*(?:hóa\s*đơn|phiếu|chứng\s*từ)|hóa\s*đơn|invoice|phiếu\s*giao(?:\s*hàng)?)\s*(?:số)?\s*[:#\-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,})/i),
    phone:pick(/(?:điện\s*thoại|sđt|tel|phone|đt)\s*[:\-]?\s*((?:0|\+84)[0-9 .-]{8,13})/i),
    supplier:pick(/(?:nhà\s*cung\s*cấp|đơn\s*vị\s*(?:giao|bán)|công\s*ty|cơ\s*sở|cửa\s*hàng)\s*[:\-]?\s*([^\n]{3,80})/i)
  };
  const unitRx='kg|kgs|g|gr|gram|lít|lit|l|ml|hộp|gói|quả|trái|chai|bao|thùng|con|bó|củ|lon|túi|chục|vỉ|can|tấm|cây|miếng';
  const rx=new RegExp('^\\s*(?:\\d{1,3}\\s*[.)\\-]?\\s+)?(.{2,60}?)\\s+(\\d+(?:[.,]\\d+)?)\\s*('+unitRx+')(?![A-Za-zÀ-ỹ0-9])','i');
  const items=[];
  t.split(/\r?\n/).forEach(line=>{
    const m=line.match(rx);if(!m)return;
    const name=m[1].replace(/[_:;]+$/,'').trim();
    if(!/[A-Za-zÀ-ỹ]{2,}/.test(name))return;
    if(/(tổng|cộng|ngày|điện thoại|địa chỉ|số\s)/i.test(name))return;
    const q=parseNum(m[2]);if(!(q>0))return;
    items.push({FoodName:name,Quantity:String(q),Unit:normUnit(m[3])});
  });
  return{ctx,items};
}

/* ---------- kiểm tra hợp lệ ---------- */
function validateRow(target,row,ctx){
  const v=row.v,errs=[],warns=[];
  const e=(k,m)=>errs.push({k,msg:m}),w=(k,m)=>warns.push({k,msg:m});
  const today=ctx.today,now=ctx.now||Date.now();
  const emptyReq=SCHEMAS[target].fields.filter(f=>f.req&&f.type!=='ok'&&!String(v[f.k]??'').trim());
  emptyReq.forEach(f=>e(f.k,'Thiếu '+f.label));
  const okField=(k,label)=>{
    const x=String(v[k]??'').trim();
    if(!x)return e(k,'Thiếu kết quả '+label+' (Đạt/Không đạt)');
    if(x!==OK&&x!==NOT_OK)return e(k,label+': chỉ nhận “Đạt” hoặc “Không đạt”');
    if(x===NOT_OK&&!String(v.Action||'').trim())e('Action','Có mục “Không đạt” → phải ghi biện pháp xử lý');
  };
  if(target==='b1'){
    const rd=parseDT(v.ReceivedAt);
    if(v.ReceivedAt&&!rd)e('ReceivedAt','Ngày giờ nhập không hợp lệ (định dạng ngày/tháng/năm)');
    if(rd){
      const t=new Date(rd.ymd+'T'+(rd.hm||'00:00')).getTime();
      if(t>now+36e5*24)e('ReceivedAt','Ngày nhập nằm ở tương lai');
      if(ctx.sessionDate&&rd.ymd<addDays(ctx.sessionDate,-7))w('ReceivedAt','Ngày nhập cách bữa ăn hơn 7 ngày — kiểm tra lại');
      if(!rd.hm)w('ReceivedAt','Chưa có giờ nhập');
    }
    if(String(v.Quantity??'').trim()){
      const q=parseNum(v.Quantity);
      if(Number.isNaN(q)||q<=0)e('Quantity','Khối lượng phải là số lớn hơn 0');
      else if(q>5000)w('Quantity','Số lượng lớn bất thường — kiểm tra đơn vị');
    }
    if(v.Unit&&!knownUnit(v.Unit))w('Unit','Đơn vị lạ “'+v.Unit+'”');
    let cat=String(v.FoodCategory||'').trim();
    if(!cat){const g=guessCategory(v.FoodName);row.guessCat=g;e('FoodCategory',g?'Chưa chọn nhóm — gợi ý “'+g+'” (bấm “Dùng nhóm gợi ý” hoặc tự chọn)':'Chọn nhóm thực phẩm')}
    else if(cat!==CAT_FRESH&&cat!==CAT_DRY)e('FoodCategory','Nhóm không hợp lệ');
    const ex=String(v.ExpiryDate||'').trim();
    if(ex){
      const d=toDate(ex);
      if(!d)e('ExpiryDate','Hạn sử dụng không hợp lệ');
      else{
        if(d<today)e('ExpiryDate','Đã hết hạn sử dụng ('+d+')');
        else if(rd&&d<rd.ymd)e('ExpiryDate','Hạn sử dụng trước ngày nhập');
        else if(d<=addDays(today,3))w('ExpiryDate','Sắp hết hạn (≤3 ngày)');
      }
    }else if(cat===CAT_DRY)e('ExpiryDate','Thực phẩm bao gói/khô phải có hạn sử dụng');
    okField('SensoryResult','cảm quan');
    if(cat===CAT_FRESH&&!String(v.VetCert||v.QuarantineCert||v.InvoiceNo||'').trim())w('VetCert','Thực phẩm tươi sống chưa có giấy thú y/kiểm dịch/chứng từ');
    if(!String(v.SupplierName||'').trim())w('SupplierName','Chưa có nơi cung cấp');
  }
  if(target==='b2'){
    okField('ProcessorHygiene','vệ sinh người chế biến');okField('EquipmentHygiene','dụng cụ');okField('AreaHygiene','khu vực');okField('SensoryResult','cảm quan');
    const p=parseDT(v.PrepCompletedAt),c=parseDT(v.CookCompletedAt);
    if(v.PrepCompletedAt&&!p)e('PrepCompletedAt','Giờ sơ chế không hợp lệ');
    if(v.CookCompletedAt&&!c)e('CookCompletedAt','Giờ chế biến không hợp lệ');
    if(p&&c&&p.ymd+(p.hm||'')>c.ymd+(c.hm||''))e('CookCompletedAt','Chế biến xong trước khi sơ chế xong');
    if(!p||!c)w('PrepCompletedAt','Thiếu thời gian sơ chế/chế biến');
    if(String(v.Servings??'').trim()){const n=parseNum(v.Servings);if(Number.isNaN(n)||n<=0)e('Servings','Số suất phải > 0')}else w('Servings','Chưa có số suất');
  }
  if(target==='b3'){
    okField('ServingUtensilsCondition','dụng cụ chia/che đậy');okField('MenuMatched','đối chiếu thực đơn');okField('SensoryResult','cảm quan');
    const p=parseDT(v.PortionCompletedAt),m=parseDT(v.MealStartAt);
    if(v.PortionCompletedAt&&!p)e('PortionCompletedAt','Giờ chia món không hợp lệ');
    if(v.MealStartAt&&!m)e('MealStartAt','Giờ bắt đầu ăn không hợp lệ');
    if(p&&m&&m.ymd+(m.hm||'')<p.ymd+(p.hm||''))e('MealStartAt','Bắt đầu ăn trước khi chia món xong');
    if(!p||!m)w('PortionCompletedAt','Thiếu thời gian chia món/bắt đầu ăn');
    if(String(v.Servings??'').trim()){const n=parseNum(v.Servings);if(Number.isNaN(n)||n<=0)e('Servings','Số suất phải > 0')}else w('Servings','Chưa có số suất');
    if(ctx.b2Dishes&&v.DishName&&!ctx.b2Dishes.has(norm(v.DishName)))w('DishName','Món chưa có ở Bước 2 của bữa này');
  }
  return{errs,warns};
}
function dedupeKey(target,v){
  if(target==='b1')return[norm(v.FoodName),norm(v.InvoiceNo),toDate(v.ReceivedAt),String(parseNum(v.Quantity))].join('|');
  return norm(v.DishName);
}
/** Gắn cờ trùng với dữ liệu đã lưu và trùng trong cùng lô. */
function markDuplicates(target,rows,existing){
  const seen=new Set(existing.map(o=>dedupeKey(target,{FoodName:o.FoodName,InvoiceNo:o.InvoiceNo,ReceivedAt:o.ReceivedAt,Quantity:o.Quantity,DishName:o.DishName})));
  rows.forEach(r=>{
    const k=dedupeKey(target,r.v);r.dup='';
    if(!k||k==='|||NaN'||k==='')return;
    if(seen.has(k))r.dup='Đã có trong sổ hoặc trùng dòng khác trong file';
    seen.add(k);
  });
}
/** Dựng mảng ô theo đúng thứ tự cột của tab Master. */
function toSheetRow(target,v,m){
  const f=k=>String(v[k]??'').trim();
  if(target==='b1')return[m.id,m.sessionId,f('FoodCategory'),f('FoodName'),f('Manufacturer'),f('ManufacturerAddr'),f('ReceivedAt'),f('Quantity'),f('Unit'),f('SupplierName'),f('SupplierContact'),f('DeliveryPerson'),f('InvoiceNo'),f('VetCert'),f('QuarantineCert'),f('ExpiryDate'),f('StorageCondition'),f('SensoryResult'),f('QuickTest'),f('Action'),m.evidence||'',m.ocrText||'',m.ocrConf||'',m.status,m.user,m.now];
  if(target==='b2')return[m.id,m.sessionId,m.meal||'',f('DishName'),f('MainIngredients'),f('Servings'),f('PrepCompletedAt'),f('CookCompletedAt'),f('ProcessorHygiene'),f('EquipmentHygiene'),f('AreaHygiene'),f('SensoryResult'),f('Action'),m.evidence||'',m.user,m.now];
  return[m.id,m.sessionId,m.meal||'',f('DishName'),f('Servings'),f('PortionCompletedAt'),f('MealStartAt'),f('ServingUtensilsCondition'),f('MenuMatched'),f('SensoryResult'),f('Action'),m.evidence||'',m.user,m.now];
}
root.AttpCore={norm,localDate,addDays,parseDT,toDate,toDT,parseNum,normUnit,normOK,guessCategory,SCHEMAS,mapHeaders,detectHeaderRow,buildRows,parseOcrText,validateRow,markDuplicates,dedupeKey,toSheetRow,normalizeValue,OK,NOT_OK,CAT_FRESH,CAT_DRY};
if(typeof module!=='undefined')module.exports=root.AttpCore;
})(typeof globalThis!=='undefined'?globalThis:this);
