// App Y tế VK V2 — Google data connector
// Public repository: never put Client Secret, access tokens, refresh tokens or health records here.

const DEFAULT_GOOGLE_CLIENT_ID='1074784573482-dvc8m31rhmhv4uucas7hq6bdd30jcusm.apps.googleusercontent.com';
const GOOGLE_PROJECT_NUMBER='1074784573482';
const PRODUCTION_MASTER_ID='169Iu_tlE8LkbSLsNiEsnTdkjyLSsVzDM7_fQl_HTXUI';
const APP_FOLDER_ID='1xfcLkDysWdNKjQ2USVHrh8MBnYF6M4wQ';
const DATA_FOLDER_ID='1L7OQpPJzMq51LOHQCcvJ1E-KAyJfg157';
const DOCUMENTS_FOLDER_ID='13mkICOI56J8fm7_6IUFl27K5SRtRqkhz';
const IMPORT_FOLDER_ID='1tSAAZWbldASeY5zJaJKiEdvxpSxsqQim';

const DRIVE_FILE_SCOPE='https://www.googleapis.com/auth/drive.file';
const OAUTH_SCOPES='openid email profile '+DRIVE_FILE_SCOPE;
const AUTO_ADMIN_EMAILS=['dr.ngovothiennhan@gmail.com','nguyenhao1707@gmail.com'];

const SHEET_RANGES={
  Students:'Students!A1:N5000',
  SchoolYears:'SchoolYears!A1:F100',
  Classes:'Classes!A1:F500',
  Enrollments:'Enrollments!A1:J5000',
  Attendance:'Attendance!A1:J10000',
  HealthScreenings:'HealthScreenings!A1:O10000',
  Immunizations:'Immunizations!A1:J10000',
  MedicationOrders:'MedicationOrders!A1:N10000',
  MedicationAdministrations:'MedicationAdministrations!A1:J10000',
  Incidents:'Incidents!A1:M10000',
  DiseaseSurveillance:'DiseaseSurveillance!A1:M10000',
  FoodB1:'FoodB1!A1:S10000',
  FoodB2:'FoodB2!A1:P10000',
  FoodB3:'FoodB3!A1:P10000',
  FoodSamples:'FoodSamples!A1:R10000',
  MealSessions:'MealSessions!A1:J5000',
  Inventory:'Inventory!A1:R10000',
  Documents:'Documents!A1:K10000',
  Tasks:'Tasks!A1:L10000',
  Communication:'Communication!A1:I5000',
  SourceRegistry:'SourceRegistry!A1:I1000',
  IdentityReview:'IdentityReview!A1:J5000',
  Users:'Users!A1:G1000',
  AuditLog:'AuditLog!A1:K3000',
  Config:'Config!A1:D1000'
};

const GoogleSheetsConnector=(()=>{
  let tokenClient=null,accessToken=null,currentUser=null,currentRole=null;

  function getConfig(){
    return {
      clientId:localStorage.getItem('sha_google_client_id')||DEFAULT_GOOGLE_CLIENT_ID,
      sheetId:localStorage.getItem('sha_sheet_id')||PRODUCTION_MASTER_ID,
      pickerApiKey:localStorage.getItem('sha_picker_api_key')||'',
      pickerGrantedId:localStorage.getItem('sha_picker_granted_id')||'',
      bridgeUrl:localStorage.getItem('sha_bridge_url')||''
    };
  }
  function saveConfig(next={}){
    const c=getConfig();
    localStorage.setItem('sha_google_client_id',String(next.clientId??c.clientId).trim()||DEFAULT_GOOGLE_CLIENT_ID);
    localStorage.setItem('sha_sheet_id',String(next.sheetId??c.sheetId).trim()||PRODUCTION_MASTER_ID);
    if(next.pickerApiKey!==undefined)localStorage.setItem('sha_picker_api_key',String(next.pickerApiKey||'').trim());
    if(next.bridgeUrl!==undefined)localStorage.setItem('sha_bridge_url',String(next.bridgeUrl||'').trim());
  }
  function setSelectedSheet(id){
    if(!id)throw new Error('Không nhận được Spreadsheet ID.');
    localStorage.setItem('sha_sheet_id',id);
    localStorage.setItem('sha_picker_granted_id',id);
  }
  function hasPickerGrant(){const c=getConfig();return Boolean(c.sheetId&&c.pickerGrantedId===c.sheetId)}

  function connect(){
    const c=getConfig();
    if(!window.google?.accounts?.oauth2)throw new Error('Google Identity Services chưa tải xong.');
    return new Promise((resolve,reject)=>{
      tokenClient=google.accounts.oauth2.initTokenClient({
        client_id:c.clientId,scope:OAUTH_SCOPES,
        callback:async resp=>{
          if(resp?.error)return reject(new Error(resp.error));
          accessToken=resp.access_token;
          try{currentUser=await getUserInfo();resolve({user:currentUser})}catch(e){reject(e)}
        }
      });
      tokenClient.requestAccessToken({prompt:''});
    });
  }
  async function getUserInfo(){
    if(!accessToken)throw new Error('Chưa đăng nhập Google.');
    const r=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+accessToken},cache:'no-store'});
    if(!r.ok)throw new Error('Không đọc được tài khoản Google.');
    return r.json();
  }
  function getSession(){return{user:currentUser,role:currentRole,hasToken:Boolean(accessToken)}}
  function getAccessToken(){return accessToken}
  function disconnect(){
    if(accessToken&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(accessToken,()=>{});
    tokenClient=null;accessToken=null;currentUser=null;currentRole=null;
  }

  async function sheetsApi(path,options={}){
    if(!accessToken)await connect();
    const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+path,{
      ...options,cache:'no-store',
      headers:{...(options.headers||{}),Authorization:'Bearer '+accessToken,'Content-Type':'application/json'}
    });
    if(!r.ok){
      const body=await r.text();let p={};try{p=JSON.parse(body)}catch(_){}
      if(r.status===403)throw new Error('Tài khoản chưa có quyền với Master Sheet hoặc quyền Google đã hết hạn.');
      if(r.status===404)throw new Error('Không tìm thấy Master Sheet.');
      throw new Error('Google Sheets API '+r.status+': '+(p?.error?.message||body));
    }
    return r.json();
  }
  async function bridgePost(action,payload={}){
    const {bridgeUrl}=getConfig();
    if(!bridgeUrl)throw new Error('Bridge API chưa được cấu hình.');
    if(!accessToken)await connect();
    const r=await fetch(bridgeUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,payload,access_token:accessToken})});
    const text=await r.text();let data={};try{data=JSON.parse(text)}catch(_){throw new Error('Bridge trả dữ liệu không hợp lệ.')}
    if(!r.ok||data.ok===false)throw new Error(data.error||'Bridge API lỗi.');
    return data;
  }
  function useBridge(){return Boolean(getConfig().bridgeUrl)}

  async function readRange(range){
    if(useBridge()){const d=await bridgePost('readRanges',{ranges:[range]});return{values:d.values?.[0]||[]}}
    const {sheetId}=getConfig();
    if(!hasPickerGrant())throw new Error('Chưa cấp quyền cho Master Sheet bằng Google Picker.');
    return sheetsApi(encodeURIComponent(sheetId)+'/values/'+encodeURIComponent(range));
  }
  async function batchReadEntries(entries){
    if(!entries.length)return{};
    if(useBridge()){
      const d=await bridgePost('readRanges',{ranges:entries.map(x=>x[1])});
      const out={};entries.forEach(([k],i)=>out[k]=d.values?.[i]||[]);return out;
    }
    const {sheetId}=getConfig();
    if(!hasPickerGrant())throw new Error('Chưa cấp quyền cho Master Sheet bằng Google Picker.');
    const q=new URLSearchParams();entries.forEach(([,r])=>q.append('ranges',r));q.set('majorDimension','ROWS');
    const d=await sheetsApi(encodeURIComponent(sheetId)+'/values:batchGet?'+q.toString());
    const out={};entries.forEach(([k],i)=>out[k]=d.valueRanges?.[i]?.values||[]);return out;
  }
  async function loadKeys(keys){
    const entries=[...new Set(keys)].filter(k=>SHEET_RANGES[k]).map(k=>[k,SHEET_RANGES[k]]);
    return batchReadEntries(entries);
  }
  async function appendRows(range,rows){
    if(useBridge())return bridgePost('appendRows',{range,rows});
    const {sheetId}=getConfig();
    if(!hasPickerGrant())throw new Error('Chưa cấp quyền Master Sheet.');
    const path=encodeURIComponent(sheetId)+'/values/'+encodeURIComponent(range)+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
    return sheetsApi(path,{method:'POST',body:JSON.stringify({values:rows})});
  }

  async function verifyUserAccess(){
    if(!currentUser)currentUser=await getUserInfo();
    const email=String(currentUser.email||'').toLowerCase();
    // V2.2: không còn bước duyệt/xác nhận nội bộ sau Google Login.
    // Email quản trị được nhận diện tự động; mọi tài khoản Google khác vào thẳng vai trò USER.
    currentRole=AUTO_ADMIN_EMAILS.includes(email)?'ADMIN':'USER';
    return{
      email,
      role:currentRole,
      name:currentUser.name||email,
      picture:currentUser.picture||''
    };
  }
  async function appendAudit(action,entityType,entityId,note=''){
    const u=currentUser||{};return appendRows('AuditLog!A:K',[[
      'AUD-'+Date.now(),new Date().toISOString(),u.email||'UNKNOWN',currentRole||'UNKNOWN',
      action,entityType||'',entityId||'','','','APP_V2',note
    ]]);
  }
  async function uploadDriveFile(file,folderId=DOCUMENTS_FOLDER_ID){
    if(!file)throw new Error('Chưa chọn file.');
    if(!accessToken)await connect();
    const meta={name:file.name,mimeType:file.type||'application/octet-stream',parents:[folderId]};
    const init=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,webViewLink',{
      method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':file.type||'application/octet-stream','X-Upload-Content-Length':String(file.size||0)},body:JSON.stringify(meta)
    });
    if(!init.ok)throw new Error('Không khởi tạo được tải file lên Drive.');
    const loc=init.headers.get('Location');if(!loc)throw new Error('Google Drive không tạo phiên tải.');
    const done=await fetch(loc,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
    if(!done.ok)throw new Error('Tải file lên Drive thất bại.');
    return done.json();
  }
  async function grantMasterAccess(email,role='writer'){
    if(!accessToken)await connect();
    const r=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(PRODUCTION_MASTER_ID)+'/permissions?sendNotificationEmail=false&fields=id',{
      method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({type:'user',role:role==='reader'?'reader':'writer',emailAddress:String(email||'').trim().toLowerCase()})
    });
    if(!r.ok)throw new Error('Không cấp được quyền Master Sheet.');
    return r.json();
  }

  function openSpreadsheetPicker(onPicked){
    const c=getConfig();
    if(!accessToken)throw new Error('Hãy đăng nhập Google trước.');
    if(!c.pickerApiKey)throw new Error('Chưa cấu hình Google Picker API key.');
    if(!window.gapi||!window.google?.picker)throw new Error('Google Picker chưa tải xong.');
    const view=new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setMode(google.picker.DocsViewMode.LIST).setFileIds(PRODUCTION_MASTER_ID);
    new google.picker.PickerBuilder().addView(view).setOAuthToken(accessToken).setDeveloperKey(c.pickerApiKey).setAppId(GOOGLE_PROJECT_NUMBER)
      .setTitle('Chọn App Y tế VK - MASTER PRODUCTION').setCallback(data=>{
        if(data.action===google.picker.Action.PICKED&&data.docs?.[0]?.id){setSelectedSheet(data.docs[0].id);onPicked?.(data.docs[0])}
      }).build().setVisible(true);
  }

  return{getConfig,saveConfig,setSelectedSheet,hasPickerGrant,connect,disconnect,getSession,getAccessToken,getUserInfo,verifyUserAccess,readRange,loadKeys,appendRows,appendAudit,uploadDriveFile,grantMasterAccess,openSpreadsheetPicker,useBridge,
    DEFAULT_GOOGLE_CLIENT_ID,GOOGLE_PROJECT_NUMBER,PRODUCTION_MASTER_ID,APP_FOLDER_ID,DATA_FOLDER_ID,DOCUMENTS_FOLDER_ID,IMPORT_FOLDER_ID,SHEET_RANGES};
})();