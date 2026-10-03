/* App Y tế VK V3 — Cầu nối Google Sheets ⇄ Cloudflare (CHỈ gọi ra ngoài, không cần deploy Web App).
   Dán TOÀN BỘ file này thay cho Code.gs cũ trong dự án Apps Script gắn với Master Sheet.
   Script Properties (Project Settings ▸ Script properties) cần có:
     WORKER_URL      = https://<tên>.workers.dev        (địa chỉ app, không có dấu / cuối)
     SYNC_KEY        = khóa đồng bộ do Claude cung cấp
     REMINDER_EMAILS = email1@gmail.com,email2@gmail.com  (người nhận nhắc việc & cảnh báo)
   Các bước: 1) chạy syncToCloud MỘT LẦN (chuyển dữ liệu cũ lên Cloudflare)  2) chạy setupTriggers. */
const MASTER_ID='169Iu_tlE8LkbSLsNiEsnTdkjyLSsVzDM7_fQl_HTXUI';
const TZ='Asia/Ho_Chi_Minh';
const TABS=['Students','SchoolYears','Classes','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','OCRInbox','MenuPlan','StockIssuePlan','WarehouseCatalog','WarehouseLedger','MealSessions','Inventory','Documents','Tasks','AuditLog','Config'];
const MAX_CHUNK_BYTES=400000,MAX_CHUNK_ROWS=400;

function prop_(k){const v=PropertiesService.getScriptProperties().getProperty(k);if(!v)throw new Error('Thiếu Script property: '+k);return v}
function api_(path,method,body){
  const r=UrlFetchApp.fetch(prop_('WORKER_URL').replace(/\/+$/,'')+path,{method:method||'get',contentType:'application/json',headers:{'x-sync-key':prop_('SYNC_KEY')},payload:body?JSON.stringify(body):undefined,muteHttpExceptions:true});
  const t=r.getContentText();let d;try{d=JSON.parse(t)}catch(_){throw new Error('Máy chủ trả về không hợp lệ ('+r.getResponseCode()+'): '+t.slice(0,200))}
  if(r.getResponseCode()>=300||d.ok===false)throw new Error(d.error||('Lỗi '+r.getResponseCode()));
  return d;
}
function trim_(v){
  let h=v.length;while(h>1&&v[h-1].every(c=>String(c).trim()===''))h--;
  v=v.slice(0,h);let w=0;v.forEach(r=>{for(let i=r.length;i>0;i--)if(String(r[i-1]).trim()!==''){w=Math.max(w,i);break}});
  return v.map(r=>r.slice(0,w).map(c=>String(c)));
}

/** CHUYỂN DỮ LIỆU LẦN ĐẦU: Google Sheet → Cloudflare. Chỉ chạy được MỘT lần (tránh ghi đè dữ liệu mới). */
function syncToCloud(){
  const P=PropertiesService.getScriptProperties();
  if(P.getProperty('CLOUD_IS_MASTER')==='1')throw new Error('Cloudflare đã là nguồn dữ liệu chính; không chạy lại để khỏi ghi đè dữ liệu mới. Nếu thật sự cần, chạy forceSyncToCloud.');
  const out=pushAll_();P.setProperty('CLOUD_IS_MASTER','1');return out;
}
function forceSyncToCloud(){const out=pushAll_();PropertiesService.getScriptProperties().setProperty('CLOUD_IS_MASTER','1');return out}
function pushAll_(){
  const ss=SpreadsheetApp.openById(MASTER_ID),log=[];
  TABS.forEach(name=>{
    const sh=ss.getSheetByName(name);if(!sh){log.push(name+': không có tab, bỏ qua');return}
    const v=trim_(sh.getDataRange().getDisplayValues());
    if(!v.length||v[0].every(c=>c==='')){log.push(name+': trống, bỏ qua');return}
    let i=0,first=true,sent=0;
    while(i<v.length){
      const chunk=[];let bytes=0;
      while(i<v.length&&chunk.length<MAX_CHUNK_ROWS&&bytes<MAX_CHUNK_BYTES){chunk.push(v[i]);bytes+=JSON.stringify(v[i]).length;i++}
      api_('/api/sync/import','post',{sheet:name,reset:first,rows:chunk});first=false;sent+=chunk.length;
    }
    log.push(name+': '+sent+' dòng (gồm tiêu đề)');
  });
  api_('/api/sync/done','post',{});
  Logger.log(log.join('\n'));return log.join('\n');
}

/** SAO LƯU HẰNG ĐÊM: Cloudflare → Google Sheet (bản sao đọc được, ghi đè nội dung các tab). */
function syncFromCloud(){
  const d=api_('/api/sync/export','get'),ss=SpreadsheetApp.openById(MASTER_ID),log=[];
  Object.keys(d.sheets).forEach(name=>{
    const rows=d.sheets[name];if(!rows||!rows.length)return;
    const w=Math.max.apply(null,rows.map(r=>r.length)),vals=rows.map(r=>{const a=r.slice();while(a.length<w)a.push('');return a});
    const sh=ss.getSheetByName(name)||ss.insertSheet(name);
    sh.clearContents();sh.getRange(1,1,vals.length,w).setNumberFormat('@').setValues(vals);
    log.push(name+': '+vals.length);
  });
  api_('/api/sync/done','post',{});Logger.log(log.join('\n'));return log.join('\n');
}

/* ---------- Nhắc việc hằng ngày (đọc thẳng từ Cloudflare, không phụ thuộc bản sao) ---------- */
function rowsOf_(sheets,name){
  const v=sheets[name]||[];if(v.length<2)return[];
  return v.slice(1).map(r=>{const o={};v[0].forEach((k,i)=>o[k]=r[i]===undefined?'':r[i]);return o});
}
function attpMissing_(sheets,dateStr){
  const sessions=rowsOf_(sheets,'MealSessions').filter(x=>String(x.Date).slice(0,10)===dateStr),miss=[];
  if(!sessions.length)miss.push('Chưa tạo bữa ăn nào cho ngày '+dateStr);
  const s1=rowsOf_(sheets,'FoodStep1'),s2=rowsOf_(sheets,'FoodStep2'),s3=rowsOf_(sheets,'FoodStep3'),sm=rowsOf_(sheets,'FoodSampleLog');
  sessions.forEach(m=>{
    const id=m.MealSessionID,t=m.Meal||id;
    if(!s1.some(x=>x.MealSessionID===id))miss.push(t+': chưa lưu Bước 1 (trước chế biến)');
    if(!s2.some(x=>x.MealSessionID===id))miss.push(t+': chưa lưu Bước 2 (trong chế biến)');
    const d3=s3.filter(x=>x.MealSessionID===id);
    if(!d3.length)miss.push(t+': chưa lưu Bước 3 (trước khi ăn)');
    const have=sm.filter(x=>x.MealSessionID===id).map(x=>String(x.SampleName).toLowerCase());
    const lack=d3.filter(x=>!have.includes(String(x.DishName).toLowerCase()));
    if(d3.length&&lack.length)miss.push(t+': thiếu mẫu lưu '+lack.length+' món');
  });
  const now=Date.now();
  const due=sm.filter(x=>{
    if(String(x.HoldDueToIncident||'').toUpperCase()==='YES'||!x.DestroyAt)return false;
    const done=String(x.DestroyStatus||'').toUpperCase()==='DESTROYED'||String(x.DestroyedBy||'').trim();
    return !done&&new Date(x.DestroyAt).getTime()<=now;
  });
  if(due.length)miss.push('Có '+due.length+' mẫu lưu đã đủ hạn, cần ghi nhận hủy mẫu');
  return miss;
}
function emails_(){return prop_('REMINDER_EMAILS').split(',').map(s=>s.trim()).filter(Boolean)}
function dailyAttpReminder(){
  const dow=Number(Utilities.formatDate(new Date(),TZ,'u'));if(dow>5)return;
  const today=Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd');
  const miss=attpMissing_(api_('/api/sync/export','get').sheets,today);if(!miss.length)return;
  const body='Kiểm thực ATTP ngày '+today+' chưa hoàn tất:\n\n- '+miss.join('\n- ')+'\n\nMở app: '+prop_('WORKER_URL');
  emails_().forEach(e=>{try{MailApp.sendEmail(e,'[App Y tế VK] Nhắc kiểm thực ATTP '+today,body)}catch(_){}});
}
function dailyHealthCheck(){
  let problems=[];
  try{
    const r=UrlFetchApp.fetch(prop_('WORKER_URL').replace(/\/+$/,'')+'/api/ping',{muteHttpExceptions:true});
    if(r.getResponseCode()!==200)problems.push('Máy chủ trả mã '+r.getResponseCode());
  }catch(e){problems.push('Không gọi được máy chủ: '+e.message)}
  if(problems.length)emails_().forEach(e=>{try{MailApp.sendEmail(e,'[App Y tế VK] CẢNH BÁO hệ thống','- '+problems.join('\n- '))}catch(_){}});
}
function setupTriggers(){
  ScriptApp.getProjectTriggers().forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyAttpReminder').timeBased().atHour(10).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('dailyAttpReminder').timeBased().atHour(15).nearMinute(0).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('dailyHealthCheck').timeBased().atHour(6).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('syncFromCloud').timeBased().atHour(2).nearMinute(0).everyDays(1).inTimezone(TZ).create();
  return 'Đã bật: nhắc ATTP 10:30 & 15:00, kiểm tra hệ thống 06:30, sao lưu sang Google Sheets 02:00 (giờ VN).';
}
