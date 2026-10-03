/**
 * App Y tế VK V2.3 — Google Apps Script Bridge
 * - OAuth user requests: Google access token + role.
 * - Vành Khuyên server-to-server: Script Property PORTAL_INTEGRATION_KEY.
 * Never commit secrets.
 */
const MASTER_ID='169Iu_tlE8LkbSLsNiEsnTdkjyLSsVzDM7_fQl_HTXUI';
const CLIENT_ID='1074784573482-dvc8m31rhmhv4uucas7hq6bdd30jcusm.apps.googleusercontent.com';
const TZ='Asia/Ho_Chi_Minh';
const DOCS_FOLDER_ID='13mkICOI56J8fm7_6IUFl27K5SRtRqkhz';
// Admin mặc định (có thể ghi đè bằng Script Property ADMIN_EMAILS, phân tách bằng dấu phẩy).
const ADMIN_FALLBACK=['dr.ngovothiennhan@gmail.com','nguyenhao1707@gmail.com'];
function adminEmails_(){
  const p=PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS');
  const l=(p?p.split(','):ADMIN_FALLBACK).map(x=>x.trim().toLowerCase()).filter(Boolean);
  return l.length?l:ADMIN_FALLBACK;
}

const ROLE_READ={
  ADMIN:['*'],
  USER:['Students','SchoolYears','Classes','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','Documents','Tasks','Communication','SourceRegistry','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','OCRInbox','PortalProjection','IntegrationQueue'],
  NVYT:['Students','SchoolYears','Classes','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','Documents','Tasks','Communication','SourceRegistry','PortalProjection','IntegrationQueue','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','OCRInbox','MenuPlan','StockIssuePlan','WarehouseCatalog','WarehouseLedger'],
  ATTP:['Students','Enrollments','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','OCRInbox','Documents','Tasks','Communication'],
  VIEWER:['Students','SchoolYears','Classes','Enrollments','HealthScreenings','Immunizations','Incidents','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','Documents','Tasks','Communication']
};
const ROLE_WRITE={
  ADMIN:['*'],
  USER:['Students','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','Documents','Tasks','Communication','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','OCRInbox','IntegrationQueue'],
  NVYT:['Students','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','Documents','Tasks','Communication','IntegrationQueue','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','OCRInbox'],
  ATTP:['FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','OCRInbox','Documents','Tasks','Communication'],
  VIEWER:[]
};

function doGet(){return json({ok:true,service:'App Y tế VK V2 Bridge',version:'2.4.0'});}

function doPost(e){
  try{
    const body=JSON.parse(e.postData && e.postData.contents || '{}');
    const action=String(body.action||'');

    if(action==='portalSnapshot'){
      verifyPortalKey_(body.integration_key);
      return handlePortalSnapshot_();
    }
    if(action==='portalAttendancePush'){
      verifyPortalKey_(body.integration_key);
      return handlePortalAttendance_(body.payload||{});
    }

    const user=verifyAccessToken_(body.access_token);
    const account=getAccount_(user.email);
    const payload=body.payload||{};
    if(action==='whoami')return json({ok:true,email:user.email,name:account.name,role:account.role});
    if(account.role==='NONE')throw new Error('Tài khoản '+user.email+' chưa được cấp quyền. Liên hệ Admin để thêm vào bảng Users.');
    if(action==='health')return handleHealth_(account);
    if(action==='uploadFile')return handleUpload_(account,payload,user.email);
    if(action==='readRanges')return handleRead_(account,payload);
    if(action==='appendRows')return handleAppend_(account,payload,user.email);
    if(action==='updateRange')return handleUpdate_(account,payload,user.email);
    throw new Error('Action không được hỗ trợ.');
  }catch(err){return json({ok:false,error:String(err && err.message || err)});}
}

function verifyAccessToken_(token){
  if(!token)throw new Error('Thiếu access token.');
  const r=UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token='+encodeURIComponent(token),{muteHttpExceptions:true});
  if(r.getResponseCode()!==200)throw new Error('Phiên Google không hợp lệ hoặc đã hết hạn.');
  const d=JSON.parse(r.getContentText());
  if(!d.email || d.email_verified==='false')throw new Error('Không xác thực được email Google.');
  // tokeninfo trả về aud/azp (không phải 'audience'): bắt buộc khớp OAuth client của app.
  if(d.aud!==CLIENT_ID && d.azp!==CLIENT_ID)throw new Error('OAuth client không hợp lệ.');
  return{email:String(d.email).toLowerCase()};
}

function verifyPortalKey_(provided){
  const expected=PropertiesService.getScriptProperties().getProperty('PORTAL_INTEGRATION_KEY');
  if(!expected)throw new Error('PORTAL_INTEGRATION_KEY chưa được cấu hình.');
  if(!provided || String(provided)!==String(expected))throw new Error('Integration key không hợp lệ.');
}

function getAccount_(email){
  if(adminEmails_().includes(email))return{email,role:'ADMIN',status:'ACTIVE',name:email};
  const sh=SpreadsheetApp.openById(MASTER_ID).getSheetByName('Users');
  const v=sh.getDataRange().getDisplayValues();
  if(v.length>=2){
    const h=v[0],ie=h.indexOf('Email'),ir=h.indexOf('Role'),is=h.indexOf('Status'),inm=h.indexOf('DisplayName');
    const row=v.slice(1).find(r=>String(r[ie]||'').toLowerCase()===email);
    if(row && String(row[is]||'').toUpperCase()==='ACTIVE'){
      return{email,role:String(row[ir]||'VIEWER').toUpperCase(),status:'ACTIVE',name:row[inm]||email};
    }
  }
  return{email,role:'NONE',status:'NOT_ALLOWED',name:email};
}

function sheetFromRange_(range){return String(range||'').split('!')[0].replace(/^'|'$/g,'');}
function allowed_(role,sheet,write){
  const m=write?ROLE_WRITE:ROLE_READ,a=m[role]||[];
  return a.includes('*')||a.includes(sheet);
}

function handleRead_(account,payload){
  const ranges=Array.isArray(payload.ranges)?payload.ranges:[];
  if(!ranges.length)throw new Error('Không có ranges.');
  const ss=SpreadsheetApp.openById(MASTER_ID);
  const values=ranges.map(range=>{
    const sheet=sheetFromRange_(range);
    if(!allowed_(account.role,sheet,false))throw new Error('Không có quyền đọc '+sheet);
    return ss.getRange(range).getDisplayValues();
  });
  return json({ok:true,values});
}

function handleAppend_(account,payload,email){
  const range=String(payload.range||''),rows=Array.isArray(payload.rows)?payload.rows:[];
  const sheetName=sheetFromRange_(range);
  if(!allowed_(account.role,sheetName,true))throw new Error('Không có quyền ghi '+sheetName);
  if(!rows.length)throw new Error('Không có dòng dữ liệu.');
  if(rows.length>500)throw new Error('Tối đa 500 dòng mỗi lần ghi.');
  const ss=SpreadsheetApp.openById(MASTER_ID),sh=ss.getSheetByName(sheetName);
  if(!sh)throw new Error('Không tìm thấy sheet '+sheetName);
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const width=Math.max(...rows.map(r=>r.length));
    const safe=rows.map(r=>Array.from({length:width},(_,i)=>r[i]??''));
    validateRows_(sh,sheetName,safe);
    const start=sh.getLastRow()+1;
    sh.getRange(start,1,safe.length,width).setValues(safe);
    if(sheetName!=='AuditLog')appendAudit_(ss,email,account.role,'BRIDGE_APPEND',sheetName,safe[0]&&safe[0][0]||'','rows='+safe.length);
    return json({ok:true,updatedRows:safe.length});
  }finally{lock.releaseLock();}
}

function handleUpdate_(account,payload,email){
  const range=String(payload.range||''),rows=Array.isArray(payload.rows)?payload.rows:[];
  const sheetName=sheetFromRange_(range);
  if(!allowed_(account.role,sheetName,true))throw new Error('Không có quyền cập nhật '+sheetName);
  if(!rows.length)throw new Error('Không có dữ liệu cập nhật.');
  const ss=SpreadsheetApp.openById(MASTER_ID);
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    ss.getRange(range).setValues(rows);
    if(sheetName!=='AuditLog')appendAudit_(ss,email,account.role,'BRIDGE_UPDATE',sheetName,range,'rows='+rows.length);
    return json({ok:true,updatedRows:rows.length});
  }finally{lock.releaseLock();}
}

function handlePortalSnapshot_(){
  const ss=SpreadsheetApp.openById(MASTER_ID);
  const sh=ss.getSheetByName('PortalProjection');
  const values=sh.getDataRange().getDisplayValues();
  if(values.length<2)return json({ok:true,schema:'portal-projection-v2',students:[]});
  const h=values[0],idx=n=>h.indexOf(n);
  const safe=values.slice(1).filter(r=>r[idx('StudentID')]).map(r=>({
    projectionId:r[idx('ProjectionID')],
    studentId:r[idx('StudentID')],
    enrollmentId:r[idx('EnrollmentID')],
    schoolYearId:r[idx('SchoolYearID')],
    classId:r[idx('ClassID')],
    className:r[idx('ClassName')],
    fullName:r[idx('FullName')],
    dob:r[idx('DOB')],
    gender:r[idx('Gender')],
    lastScreeningDate:r[idx('LastScreeningDate')],
    lastHeightCm:r[idx('LastHeightCm')],
    lastWeightKg:r[idx('LastWeightKg')],
    bmi:r[idx('BMI')],
    attendanceStatus:r[idx('AttendanceStatus')],
    updatedAt:r[idx('UpdatedAt')]
  }));
  return json({ok:true,schema:'portal-projection-v2',generatedAt:new Date().toISOString(),students:safe});
}

function handlePortalAttendance_(payload){
  const studentId=String(payload.studentId||''),date=String(payload.date||''),status=String(payload.status||'');
  if(!studentId||!date||!status)throw new Error('Thiếu studentId/date/status.');
  const ss=SpreadsheetApp.openById(MASTER_ID);
  const students=ss.getSheetByName('Students').getRange('A2:A').getDisplayValues().flat();
  if(!students.includes(studentId))throw new Error('StudentID không tồn tại.');
  const enSh=ss.getSheetByName('Enrollments'),en=enSh.getDataRange().getDisplayValues(),eh=en[0];
  const ie=eh.indexOf('EnrollmentID'),isid=eh.indexOf('StudentID'),istat=eh.indexOf('Status');
  const er=en.slice(1).find(r=>r[isid]===studentId&&String(r[istat]||'').toUpperCase()==='ACTIVE');
  const enrollmentId=er?er[ie]:'';
  const sh=ss.getSheetByName('Attendance');
  const id='ATT-'+Date.now();
  sh.appendRow([id,enrollmentId,studentId,date,status,String(payload.reason||''),String(payload.symptomTags||''),String(payload.reportedBy||'VANH_KHUYEN_PORTAL'),'VANH_KHUYEN_V2',new Date().toISOString()]);
  appendAudit_(ss,'VANH_KHUYEN_SERVER','INTEGRATION','PORTAL_ATTENDANCE_PUSH','Attendance',id,studentId+' '+status);
  return json({ok:true,attendanceId:id});
}

function appendAudit_(ss,email,role,action,entityType,entityId,note){
  const sh=ss.getSheetByName('AuditLog');if(!sh)return;
  sh.appendRow(['AUD-'+Date.now(),new Date().toISOString(),email,role,action,entityType,entityId,'','','APPS_SCRIPT_BRIDGE',note]);
}
function json(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}


/* ===== V2.4: kiểm tra dữ liệu ATTP phía máy chủ ===== */
const REQUIRED_={
  FoodStep1:['MealSessionID','FoodName'],
  FoodStep2:['MealSessionID','DishName'],
  FoodStep3:['MealSessionID','DishName'],
  FoodSampleLog:['MealSessionID','SampleName','CollectedAt'],
  MealSessions:['Date','Meal']
};
function validateRows_(sh,sheetName,rows){
  const req=REQUIRED_[sheetName];if(!req)return;
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  rows.forEach((r,n)=>req.forEach(k=>{
    const i=h.indexOf(k);
    if(i>=0&&!String(r[i]??'').trim())throw new Error('Dòng '+(n+1)+': thiếu trường bắt buộc '+k+' ('+sheetName+').');
  }));
}

/* ===== V2.4: tải ảnh/chứng từ lên Drive bằng quyền chủ sở hữu ===== */
function handleUpload_(account,payload,email){
  if(!allowed_(account.role,'Documents',true))throw new Error('Không có quyền tải chứng từ.');
  const name=String(payload.name||'chung-tu').replace(/[\\/:*?"<>|]/g,'_').slice(0,120);
  const mime=String(payload.mimeType||'application/octet-stream');
  if(!/^(image\/(jpeg|png|webp)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel|text\/csv)$/.test(mime))throw new Error('Định dạng file không được hỗ trợ.');
  const b64=String(payload.base64||'');
  if(!b64||b64.length>14000000)throw new Error('File rỗng hoặc quá lớn (tối đa ~10 MB).');
  const day=Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd');
  const file=DriveApp.getFolderById(DOCS_FOLDER_ID).createFile(Utilities.newBlob(Utilities.base64Decode(b64),mime,day+'_'+name));
  return json({ok:true,id:file.getId(),name:file.getName(),url:file.getUrl()});
}

/* ===== V2.4: kiểm tra vận hành ===== */
function healthReport_(){
  const out=[];const add=(k,ok,msg)=>out.push({check:k,ok:!!ok,msg:msg||''});
  let ss=null;
  try{ss=SpreadsheetApp.openById(MASTER_ID);add('Master Sheet',true,ss.getName());}catch(e){add('Master Sheet',false,String(e.message||e));}
  if(ss){
    ['Users','AuditLog','MealSessions','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','OCRInbox','Documents'].forEach(n=>{
      const sh=ss.getSheetByName(n);
      if(!sh)return add('Tab '+n,false,'thiếu tab');
      add('Tab '+n,sh.getLastColumn()>0,'');
    });
    const used=ss.getSheets().reduce((a,s)=>a+s.getMaxRows()*s.getMaxColumns(),0);
    add('Dung lượng ô',used<8000000,Math.round(used/10000)/100+' triệu / 10 triệu ô');
  }
  try{DriveApp.getFolderById(DOCS_FOLDER_ID).getName();add('Thư mục chứng từ',true,'');}catch(e){add('Thư mục chứng từ',false,String(e.message||e));}
  add('Email nhắc việc',MailApp.getRemainingDailyQuota()>5,'còn '+MailApp.getRemainingDailyQuota()+' email hôm nay');
  return out;
}
function handleHealth_(account){
  if(account.role==='VIEWER')throw new Error('Không có quyền.');
  const r=healthReport_();
  return json({ok:true,allOk:r.every(x=>x.ok),checks:r,checkedAt:new Date().toISOString()});
}

/* ===== V2.4: nhắc việc hằng ngày (miễn phí, chạy bằng Time-driven trigger) ===== */
function recipients_(){
  const set={};adminEmails_().forEach(e=>set[e]=1);
  try{
    const v=SpreadsheetApp.openById(MASTER_ID).getSheetByName('Users').getDataRange().getDisplayValues();
    const h=v[0],ie=h.indexOf('Email'),ir=h.indexOf('Role'),is=h.indexOf('Status');
    v.slice(1).forEach(r=>{
      const role=String(r[ir]||'').toUpperCase();
      if(String(r[is]||'').toUpperCase()==='ACTIVE'&&['ADMIN','NVYT','ATTP','USER'].includes(role)&&r[ie])set[String(r[ie]).toLowerCase()]=1;
    });
  }catch(e){}
  return Object.keys(set);
}
function rowsOf_(ss,name){
  const sh=ss.getSheetByName(name);if(!sh||sh.getLastRow()<2)return[];
  const v=sh.getDataRange().getDisplayValues(),h=v[0];
  return v.slice(1).filter(r=>r.some(x=>String(x).trim())).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));
}
function dailyAttpStatus_(dateStr){
  const ss=SpreadsheetApp.openById(MASTER_ID);
  const sessions=rowsOf_(ss,'MealSessions').filter(x=>String(x.Date).slice(0,10)===dateStr);
  const miss=[];
  if(!sessions.length)miss.push('Chưa tạo bữa ăn nào cho ngày '+dateStr);
  const s1=rowsOf_(ss,'FoodStep1'),s2=rowsOf_(ss,'FoodStep2'),s3=rowsOf_(ss,'FoodStep3'),sm=rowsOf_(ss,'FoodSampleLog');
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
function dailyAttpReminder(){
  const today=Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd');
  const dow=Number(Utilities.formatDate(new Date(),TZ,'u')); // 1=Thứ hai … 7=CN
  if(dow>5)return; // chỉ nhắc ngày đi học
  const miss=dailyAttpStatus_(today);
  if(!miss.length)return;
  const body='Kiểm thực ATTP ngày '+today+' chưa hoàn tất:\n\n- '+miss.join('\n- ')+'\n\nMở app: https://drngovothiennhan.github.io/Dr.Ngovothiennhan/';
  recipients_().forEach(e=>{try{MailApp.sendEmail(e,'[App Y tế VK] Nhắc kiểm thực ATTP '+today,body)}catch(_){}});
}
function dailyHealthCheck(){
  const bad=healthReport_().filter(x=>!x.ok);
  if(!bad.length)return;
  const body='Hệ thống App Y tế VK có mục chưa ổn:\n\n'+bad.map(x=>'- '+x.check+': '+x.msg).join('\n');
  adminEmails_().forEach(e=>{try{MailApp.sendEmail(e,'[App Y tế VK] CẢNH BÁO hệ thống',body)}catch(_){}});
}
/** Chạy MỘT LẦN trong trình soạn Apps Script để bật nhắc việc tự động. */
function setupTriggers(){
  ScriptApp.getProjectTriggers().forEach(t=>{if(['dailyAttpReminder','dailyHealthCheck'].includes(t.getHandlerFunction()))ScriptApp.deleteTrigger(t)});
  ScriptApp.newTrigger('dailyAttpReminder').timeBased().atHour(10).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('dailyAttpReminder').timeBased().atHour(15).nearMinute(0).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('dailyHealthCheck').timeBased().atHour(6).nearMinute(30).everyDays(1).inTimezone(TZ).create();
  return 'Đã bật: nhắc ATTP 10:30 và 15:00, kiểm tra hệ thống 06:30 (giờ Việt Nam).';
}
