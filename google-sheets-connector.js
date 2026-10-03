// App Y tế VK — production Google connector
// Public-safe source: OAuth Client ID and project number are identifiers, not secrets.
// Never commit Client Secret, access token, refresh token, service-account key, or health data.

const DEFAULT_GOOGLE_CLIENT_ID = '1074784573482-dvc8m31rhmhv4uucas7hq6bdd30jcusm.apps.googleusercontent.com';
const GOOGLE_PROJECT_NUMBER = '1074784573482';
const PRODUCTION_MASTER_ID = '169Iu_tlE8LkbSLsNiEsnTdkjyLSsVzDM7_fQl_HTXUI';
const APP_FOLDER_ID = '1xfcLkDysWdNKjQ2USVHrh8MBnYF6M4wQ';
const DATA_FOLDER_ID = '1L7OQpPJzMq51LOHQCcvJ1E-KAyJfg157';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const IDENTITY_SCOPES = 'openid email profile';
const OAUTH_SCOPES = IDENTITY_SCOPES + ' ' + DRIVE_FILE_SCOPE;

const SHEETS_ENABLE_URL = 'https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=' + GOOGLE_PROJECT_NUMBER;
const DRIVE_ENABLE_URL = 'https://console.cloud.google.com/apis/library/drive.googleapis.com?project=' + GOOGLE_PROJECT_NUMBER;
const PICKER_ENABLE_URL = 'https://console.cloud.google.com/apis/library/picker.googleapis.com?project=' + GOOGLE_PROJECT_NUMBER;
const API_KEYS_URL = 'https://console.cloud.google.com/apis/credentials?project=' + GOOGLE_PROJECT_NUMBER;

const GoogleSheetsConnector = (() => {
  let tokenClient = null;
  let accessToken = null;
  let currentUser = null;
  let currentRole = null;

  function getConfig() {
    return {
      clientId: localStorage.getItem('sha_google_client_id') || DEFAULT_GOOGLE_CLIENT_ID,
      sheetId: localStorage.getItem('sha_sheet_id') || PRODUCTION_MASTER_ID,
      pickerApiKey: localStorage.getItem('sha_picker_api_key') || '',
      pickerGrantedId: localStorage.getItem('sha_picker_granted_id') || ''
    };
  }

  function saveConfig({clientId, sheetId, pickerApiKey}={}) {
    const current=getConfig();
    localStorage.setItem('sha_google_client_id', (clientId ?? current.clientId).trim() || DEFAULT_GOOGLE_CLIENT_ID);
    localStorage.setItem('sha_sheet_id', (sheetId ?? current.sheetId).trim() || PRODUCTION_MASTER_ID);
    if (pickerApiKey !== undefined) localStorage.setItem('sha_picker_api_key', pickerApiKey.trim());
  }

  function setSelectedSheet(sheetId) {
    if (!sheetId) throw new Error('Không nhận được Spreadsheet ID từ Google Picker.');
    localStorage.setItem('sha_sheet_id', sheetId);
    localStorage.setItem('sha_picker_granted_id', sheetId);
  }

  function hasPickerGrant() {
    const c=getConfig();
    return Boolean(c.sheetId && c.pickerGrantedId === c.sheetId);
  }

  function connect() {
    const c=getConfig();
    if (!c.clientId) throw new Error('Chưa cấu hình Google OAuth Client ID.');
    if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services chưa tải xong.');
    return new Promise((resolve,reject)=>{
      tokenClient=google.accounts.oauth2.initTokenClient({
        client_id:c.clientId,
        scope:OAUTH_SCOPES,
        callback:async(resp)=>{
          if(resp?.error) return reject(new Error(resp.error));
          accessToken=resp.access_token;
          try {
            currentUser=await getUserInfo();
            resolve({token:resp,user:currentUser});
          } catch(e){ reject(e); }
        }
      });
      tokenClient.requestAccessToken({prompt:''});
    });
  }

  async function getUserInfo(){
    if(!accessToken) throw new Error('Chưa đăng nhập Google.');
    const res=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{
      headers:{Authorization:'Bearer '+accessToken}
    });
    if(!res.ok) throw new Error('Không đọc được thông tin tài khoản Google.');
    return res.json();
  }

  function getSession(){ return {user:currentUser,role:currentRole,hasToken:Boolean(accessToken)}; }
  function getAccessToken(){ return accessToken; }

  function disconnect(){
    if(accessToken && window.google?.accounts?.oauth2){
      google.accounts.oauth2.revoke(accessToken,()=>{});
    }
    accessToken=null; currentUser=null; currentRole=null;
  }

  async function sheetsApi(path,options={}){
    if(!accessToken) await connect();
    const res=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+path,{
      ...options,
      headers:{...(options.headers||{}),Authorization:'Bearer '+accessToken,'Content-Type':'application/json'}
    });
    if(!res.ok){
      const body=await res.text();
      let parsed=null; try{parsed=JSON.parse(body)}catch(_){}
      const reason=parsed?.error?.details?.find?.(d=>d?.reason)?.reason || parsed?.error?.status || '';
      if(res.status===403 && (reason==='SERVICE_DISABLED'||body.includes('SERVICE_DISABLED'))){
        throw new Error('Google Sheets API chưa được bật cho project. '+SHEETS_ENABLE_URL);
      }
      if(res.status===403 && (body.includes('insufficientPermissions')||body.includes('PERMISSION_DENIED'))){
        throw new Error('Tài khoản hoặc ứng dụng chưa được cấp quyền với Master Sheet. Hãy chọn lại file bằng Google Picker.');
      }
      if(res.status===404) throw new Error('Không tìm thấy Master Sheet hoặc app chưa được cấp quyền drive.file cho file này.');
      throw new Error('Google Sheets API '+res.status+': '+(parsed?.error?.message||body));
    }
    return res.json();
  }

  async function readRange(range){
    const {sheetId}=getConfig();
    if(!sheetId) throw new Error('Chưa chọn Master Sheet.');
    if(!hasPickerGrant()) throw new Error('Chưa cấp quyền cho Master Sheet bằng Google Picker.');
    return sheetsApi(encodeURIComponent(sheetId)+'/values/'+encodeURIComponent(range));
  }

  async function appendRows(range,rows){
    const {sheetId}=getConfig();
    if(!sheetId) throw new Error('Chưa chọn Master Sheet.');
    if(!hasPickerGrant()) throw new Error('Chưa cấp quyền cho Master Sheet bằng Google Picker.');
    const path=encodeURIComponent(sheetId)+'/values/'+encodeURIComponent(range)+':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
    return sheetsApi(path,{method:'POST',body:JSON.stringify({values:rows})});
  }

  async function verifyUserAccess(){
    if(!currentUser) currentUser=await getUserInfo();
    const r=await readRange('Users!A1:G500');
    const values=r.values||[];
    const header=values[0]||[];
    const rows=values.slice(1);
    const iEmail=header.indexOf('Email'), iRole=header.indexOf('Role'), iStatus=header.indexOf('Status');
    const email=String(currentUser.email||'').toLowerCase();
    const row=rows.find(x=>String(x[iEmail]||'').toLowerCase()===email);
    if(!row) throw new Error('Tài khoản '+email+' chưa được cấp quyền trong Users.');
    if(String(row[iStatus]||'').toUpperCase()!=='ACTIVE') throw new Error('Tài khoản '+email+' đang bị khóa.');
    currentRole=String(row[iRole]||'VIEWER').toUpperCase();
    return {email,role:currentRole,name:currentUser.name||email,picture:currentUser.picture||''};
  }

  async function appendAudit(action,entityType,entityId,note=''){
    const u=currentUser||{};
    const role=currentRole||'UNKNOWN';
    return appendRows('AuditLog!A:K',[[
      'AUD-'+Date.now(),new Date().toISOString(),u.email||'UNKNOWN',role,
      action,entityType||'',entityId||'','','','GITHUB_PAGES',note
    ]]);
  }

  async function loadProductionData(){
    const ranges=[
      ['Students','Students!A1:N5000'],
      ['HealthScreenings','HealthScreenings!A1:O5000'],
      ['Immunizations','Immunizations!A1:J5000'],
      ['MedicationOrders','MedicationOrders!A1:N5000'],
      ['Incidents','Incidents!A1:M5000'],
      ['FoodB1','FoodB1!A1:R5000'],
      ['FoodB2','FoodB2!A1:O5000'],
      ['FoodB3','FoodB3!A1:O5000'],
      ['FoodSamples','FoodSamples!A1:Q5000'],
      ['Inventory','Inventory!A1:R5000'],
      ['Documents','Documents!A1:K5000'],
      ['Tasks','Tasks!A1:L5000']
    ];
    const out={};
    for(const [k,r] of ranges){
      try{ out[k]=(await readRange(r)).values||[]; }
      catch(e){ out[k]=[]; }
    }
    return out;
  }

  function openSpreadsheetPicker(onPicked){
    const c=getConfig();
    if(!accessToken) throw new Error('Hãy đăng nhập Google trước.');
    if(!c.pickerApiKey) throw new Error('Chưa cấu hình Google Picker API key.');
    if(!window.gapi||!window.google?.picker) throw new Error('Google Picker chưa tải xong.');
    const view=new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
      .setMode(google.picker.DocsViewMode.LIST);
    const picker=new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(c.pickerApiKey)
      .setAppId(GOOGLE_PROJECT_NUMBER)
      .setTitle('Chọn App Y tế VK - MASTER PRODUCTION')
      .setCallback((data)=>{
        if(data.action===google.picker.Action.PICKED){
          const doc=data.docs?.[0];
          if(doc?.id){
            setSelectedSheet(doc.id);
            if(typeof onPicked==='function') onPicked(doc);
          }
        }
      }).build();
    picker.setVisible(true);
  }

  return {
    getConfig,saveConfig,setSelectedSheet,hasPickerGrant,connect,disconnect,getUserInfo,getSession,getAccessToken,
    readRange,appendRows,verifyUserAccess,appendAudit,loadProductionData,openSpreadsheetPicker,
    DEFAULT_GOOGLE_CLIENT_ID,GOOGLE_PROJECT_NUMBER,PRODUCTION_MASTER_ID,APP_FOLDER_ID,DATA_FOLDER_ID,
    SHEETS_ENABLE_URL,DRIVE_ENABLE_URL,PICKER_ENABLE_URL,API_KEYS_URL
  };
})();
