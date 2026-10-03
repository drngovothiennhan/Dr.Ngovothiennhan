/**
 * App Y tế VK V2 — Google Apps Script Bridge
 * Deploy as Web App, execute as owner, access: anyone with Google account / appropriate setting.
 * Each request is authenticated again with a short-lived Google OAuth access token.
 * Do not put secrets in this file.
 */
const MASTER_ID='169Iu_tlE8LkbSLsNiEsnTdkjyLSsVzDM7_fQl_HTXUI';
const CLIENT_ID='1074784573482-dvc8m31rhmhv4uucas7hq6bdd30jcusm.apps.googleusercontent.com';

const ROLE_READ={
  ADMIN:['*'],
  NVYT:['Students','SchoolYears','Classes','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','Documents','Tasks','Communication','SourceRegistry'],
  ATTP:['Students','Enrollments','FoodB1','FoodB2','FoodB3','FoodSamples','MealSessions','Inventory','Documents','Tasks','Communication'],
  VIEWER:['Students','SchoolYears','Classes','Enrollments','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','FoodB1','FoodB2','FoodB3','FoodSamples','MealSessions','Inventory','Documents','Tasks','Communication']
};
const ROLE_WRITE={
  ADMIN:['*'],
  NVYT:['Students','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','Documents','Tasks','Communication'],
  ATTP:['FoodB1','FoodB2','FoodB3','FoodSamples','MealSessions','Inventory','Documents','Tasks','Communication'],
  VIEWER:[]
};

function doGet(){return json({ok:true,service:'App Y tế VK V2 Bridge',version:'2.0.0'});}
function doPost(e){
  try{
    const body=JSON.parse(e.postData && e.postData.contents || '{}');
    const user=verifyAccessToken_(body.access_token);
    const account=getAccount_(user.email);
    if(!account || account.status!=='ACTIVE')throw new Error('Tài khoản chưa được cấp quyền hoặc đang bị khóa.');
    const action=String(body.action||'');
    const payload=body.payload||{};
    if(action==='whoami')return json({ok:true,email:user.email,name:account.name,role:account.role});
    if(action==='readRanges')return handleRead_(account,payload);
    if(action==='appendRows')return handleAppend_(account,payload,user.email);
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
function getAccount_(email){
  const sh=SpreadsheetApp.openById(MASTER_ID).getSheetByName('Users');
  const v=sh.getDataRange().getDisplayValues();if(v.length<2)return null;
  const h=v[0],ie=h.indexOf('Email'),ir=h.indexOf('Role'),is=h.indexOf('Status'),inm=h.indexOf('DisplayName');
  const row=v.slice(1).find(r=>String(r[ie]||'').toLowerCase()===email);
  return row?{email,role:String(row[ir]||'VIEWER').toUpperCase(),status:String(row[is]||'').toUpperCase(),name:row[inm]||email}:null;
}
function sheetFromRange_(range){return String(range||'').split('!')[0].replace(/^'|'$/g,'');}
function allowed_(role,sheet,write){
  const m=write?ROLE_WRITE:ROLE_READ,a=m[role]||[];return a.includes('*')||a.includes(sheet);
}
function handleRead_(account,payload){
  const ranges=Array.isArray(payload.ranges)?payload.ranges:[];if(!ranges.length)throw new Error('Không có ranges.');
  const ss=SpreadsheetApp.openById(MASTER_ID);
  const values=ranges.map(range=>{
    const sheet=sheetFromRange_(range);if(!allowed_(account.role,sheet,false))throw new Error('Không có quyền đọc '+sheet);
    return ss.getRange(range).getDisplayValues();
  });
  return json({ok:true,values});
}
function handleAppend_(account,payload,email){
  const range=String(payload.range||''),rows=Array.isArray(payload.rows)?payload.rows:[];
  const sheetName=sheetFromRange_(range);if(!allowed_(account.role,sheetName,true))throw new Error('Không có quyền ghi '+sheetName);
  if(!rows.length)throw new Error('Không có dòng dữ liệu.');
  const ss=SpreadsheetApp.openById(MASTER_ID),sh=ss.getSheetByName(sheetName);if(!sh)throw new Error('Không tìm thấy sheet '+sheetName);
  const start=sh.getLastRow()+1,width=Math.max(...rows.map(r=>r.length));const safe=rows.map(r=>Array.from({length:width},(_,i)=>r[i]??''));
  sh.getRange(start,1,safe.length,width).setValues(safe);
  if(sheetName!=='AuditLog')appendAudit_(ss,email,account.role,'BRIDGE_APPEND',sheetName,safe[0]?.[0]||'','rows='+safe.length);
  return json({ok:true,updatedRows:safe.length});
}
function appendAudit_(ss,email,role,action,entityType,entityId,note){
  const sh=ss.getSheetByName('AuditLog');if(!sh)return;
  sh.appendRow(['AUD-'+Date.now(),new Date().toISOString(),email,role,action,entityType,entityId,'','','APPS_SCRIPT_BRIDGE',note]);
}
function json(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
