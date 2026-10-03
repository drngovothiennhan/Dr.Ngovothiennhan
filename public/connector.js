// App Y tế VK V3 — kết nối tới Cloudflare Worker cùng tên miền (/api/*).
// Không có khóa bí mật nào trong mã nguồn. Phiên đăng nhập là mã ngẫu nhiên lưu trên máy.
const SHEET_RANGES={
  Students:'Students!A1:N5000',SchoolYears:'SchoolYears!A1:F100',Classes:'Classes!A1:F500',
  Enrollments:'Enrollments!A1:J5000',Attendance:'Attendance!A1:J10000',
  HealthScreenings:'HealthScreenings!A1:O10000',Immunizations:'Immunizations!A1:J10000',
  MedicationOrders:'MedicationOrders!A1:N10000',MedicationAdministrations:'MedicationAdministrations!A1:J10000',
  Incidents:'Incidents!A1:M10000',DiseaseSurveillance:'DiseaseSurveillance!A1:M10000',
  FoodStep1:'FoodStep1!A1:Z10000',FoodStep2:'FoodStep2!A1:P10000',FoodStep3:'FoodStep3!A1:N10000',
  FoodSampleLog:'FoodSampleLog!A1:W10000',OCRInbox:'OCRInbox!A1:O5000',
  MenuPlan:'MenuPlan!A1:O5000',StockIssuePlan:'StockIssuePlan!A1:N10000',
  WarehouseCatalog:'WarehouseCatalog!A1:M1000',WarehouseLedger:'WarehouseLedger!A1:Q20000',
  MealSessions:'MealSessions!A1:N5000',Inventory:'Inventory!A1:R10000',
  Documents:'Documents!A1:K10000',Tasks:'Tasks!A1:L10000',
  Users:'Users!A1:G1000',AuditLog:'AuditLog!A1:K3000',Config:'Config!A1:D1000'
};
const GoogleSheetsConnector=(()=>{
  const TK='yte_token',UK='yte_user';
  let token=null,user=null;
  try{token=localStorage.getItem(TK);user=JSON.parse(localStorage.getItem(UK)||'null')}catch(_){}
  const save=()=>{try{token?localStorage.setItem(TK,token):localStorage.removeItem(TK);user?localStorage.setItem(UK,JSON.stringify(user)):localStorage.removeItem(UK)}catch(_){}};
  class AuthError extends Error{}
  async function req(path,opt={}){
    const h={...(opt.headers||{})};if(token)h.Authorization='Bearer '+token;
    let r;try{r=await fetch(path,{...opt,headers:h,cache:'no-store'})}catch(_){throw new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')}
    let d={};try{d=await r.json()}catch(_){}
    if(r.status===401&&path!=='/api/login'){token=null;save();const e=new AuthError(d.error||'Phiên đăng nhập đã hết hạn.');window.dispatchEvent(new CustomEvent('yte-auth-expired'));throw e}
    if(!r.ok||d.ok===false)throw new Error(d.error||('Lỗi máy chủ '+r.status));
    return d;
  }
  const call=(action,payload={})=>req('/api/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});
  async function login(username,password){
    const d=await req('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    token=d.token;user=d.user;save();return d.user;
  }
  async function resume(){if(!token)return null;const d=await call('whoami');user={username:d.username,name:d.name,role:d.role,mustChange:d.mustChange};save();return user}
  async function logout(){try{if(token)await req('/api/logout',{method:'POST'})}catch(_){}token=null;user=null;save()}
  const hasToken=()=>Boolean(token);
  const getUser=()=>user;
  async function changePassword(oldPassword,newPassword){await call('changePassword',{oldPassword,newPassword});if(user){user.mustChange=false;save()}}
  async function readRange(range){const d=await call('readRanges',{ranges:[range]});return{values:d.values?.[0]||[]}}
  async function loadKeys(keys){
    const ks=[...new Set(keys)].filter(k=>SHEET_RANGES[k]);if(!ks.length)return{};
    const d=await call('readRanges',{ranges:ks.map(k=>SHEET_RANGES[k])});
    const out={};ks.forEach((k,i)=>out[k]=d.values?.[i]||[]);return out;
  }
  const appendRows=(range,rows)=>call('appendRows',{range,rows});
  const updateRange=(range,rows)=>call('updateRange',{range,rows});
  async function appendAudit(action,entityType,entityId,note=''){
    const u=user||{};return appendRows('AuditLog!A:K',[['AUD-'+Date.now(),new Date().toISOString(),u.username||'UNKNOWN',u.role||'UNKNOWN',action,entityType||'',entityId||'','','','APP_V3',note]]);
  }
  async function compressImage(file,maxSide=1800,q=0.82){
    if(!/^image\/(jpeg|png|webp)$/.test(file.type))return file;
    try{
      const bmp=await createImageBitmap(file),k=Math.min(1,maxSide/Math.max(bmp.width,bmp.height));
      const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
      c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
      const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',q));
      return blob&&blob.size<file.size?new File([blob],file.name.replace(/\.\w+$/,'')+'.jpg',{type:'image/jpeg'}):file;
    }catch(_){return file}
  }
  async function uploadDriveFile(file){
    if(!file)throw new Error('Chưa chọn file.');
    const f=await compressImage(file),fd=new FormData();fd.append('file',f,f.name);
    const d=await req('/api/upload',{method:'POST',body:fd});
    return{id:d.id,name:d.name,webViewLink:d.url};
  }
  const healthCheck=()=>call('health');
  const admin=(action,payload)=>call(action,payload);
  // tương thích mã cũ
  const useBridge=()=>true,getConfig=()=>({}),saveConfig=()=>{};
  return{login,resume,logout,hasToken,getUser,changePassword,readRange,loadKeys,appendRows,updateRange,appendAudit,uploadDriveFile,healthCheck,admin,useBridge,getConfig,saveConfig,SHEET_RANGES,
    getSession:()=>({user,role:user?.role,hasToken:Boolean(token)}),disconnect:()=>{token=null;user=null;save()}};
})();
