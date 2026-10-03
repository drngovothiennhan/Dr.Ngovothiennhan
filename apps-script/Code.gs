/**
 * App Y tế VK V2.3 — Google Apps Script Bridge
 * - OAuth user requests: Google access token + role.
 * - Vành Khuyên server-to-server: Script Property PORTAL_INTEGRATION_KEY.
 * Never commit secrets.
 */
const MASTER_ID='169Iu_tlE8LkbSLsNiEsnTdkjyLSsVzDM7_fQl_HTXUI';
const CLIENT_ID='1074784573482-dvc8m31rhmhv4uucas7hq6bdd30jcusm.apps.googleusercontent.com';
const AUTO_ADMINS=['dr.ngovothiennhan@gmail.com','nguyenhao1707@gmail.com'];

const ROLE_READ={
  ADMIN:['*'],
  USER:['Students','SchoolYears','Classes','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','Documents','Tasks','Communication','SourceRegistry','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','OCRInbox','PortalProjection','IntegrationQueue'],
  NVYT:['Students','SchoolYears','Classes','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','Documents','Tasks','Communication','SourceRegistry','PortalProjection','IntegrationQueue'],
  ATTP:['Students','Enrollments','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','OCRInbox','Documents','Tasks','Communication'],
  VIEWER:['Students','SchoolYears','Classes','Enrollments','HealthScreenings','Immunizations','Incidents','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','Documents','Tasks','Communication']
};
const ROLE_WRITE={
  ADMIN:['*'],
  USER:['Students','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','Documents','Tasks','Communication','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','OCRInbox','IntegrationQueue'],
  NVYT:['Students','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','Documents','Tasks','Communication','IntegrationQueue'],
  ATTP:['FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','OCRInbox','Documents','Tasks','Communication'],
  VIEWER:[]
};

function doGet(){return json({ok:true,service:'App Y tế VK V2 Bridge',version:'2.3.0'});}

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
  if(d.audience && d.audience!==CLIENT_ID)throw new Error('OAuth client không hợp lệ.');
  return{email:String(d.email).toLowerCase()};
}

function verifyPortalKey_(provided){
  const expected=PropertiesService.getScriptProperties().getProperty('PORTAL_INTEGRATION_KEY');
  if(!expected)throw new Error('PORTAL_INTEGRATION_KEY chưa được cấu hình.');
  if(!provided || String(provided)!==String(expected))throw new Error('Integration key không hợp lệ.');
}

function getAccount_(email){
  if(AUTO_ADMINS.includes(email))return{email,role:'ADMIN',status:'ACTIVE',name:email};
  const sh=SpreadsheetApp.openById(MASTER_ID).getSheetByName('Users');
  const v=sh.getDataRange().getDisplayValues();
  if(v.length>=2){
    const h=v[0],ie=h.indexOf('Email'),ir=h.indexOf('Role'),is=h.indexOf('Status'),inm=h.indexOf('DisplayName');
    const row=v.slice(1).find(r=>String(r[ie]||'').toLowerCase()===email);
    if(row && String(row[is]||'').toUpperCase()==='ACTIVE'){
      return{email,role:String(row[ir]||'USER').toUpperCase(),status:'ACTIVE',name:row[inm]||email};
    }
  }
  return{email,role:'USER',status:'ACTIVE',name:email};
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
  const ss=SpreadsheetApp.openById(MASTER_ID),sh=ss.getSheetByName(sheetName);
  if(!sh)throw new Error('Không tìm thấy sheet '+sheetName);
  const start=sh.getLastRow()+1,width=Math.max(...rows.map(r=>r.length));
  const safe=rows.map(r=>Array.from({length:width},(_,i)=>r[i]??''));
  sh.getRange(start,1,safe.length,width).setValues(safe);
  if(sheetName!=='AuditLog')appendAudit_(ss,email,account.role,'BRIDGE_APPEND',sheetName,safe[0]&&safe[0][0]||'','rows='+safe.length);
  return json({ok:true,updatedRows:safe.length});
}

function handleUpdate_(account,payload,email){
  const range=String(payload.range||''),rows=Array.isArray(payload.rows)?payload.rows:[];
  const sheetName=sheetFromRange_(range);
  if(!allowed_(account.role,sheetName,true))throw new Error('Không có quyền cập nhật '+sheetName);
  if(!rows.length)throw new Error('Không có dữ liệu cập nhật.');
  const ss=SpreadsheetApp.openById(MASTER_ID);
  const target=ss.getRange(range);
  target.setValues(rows);
  if(sheetName!=='AuditLog')appendAudit_(ss,email,account.role,'BRIDGE_UPDATE',sheetName,range,'rows='+rows.length);
  return json({ok:true,updatedRows:rows.length});
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
