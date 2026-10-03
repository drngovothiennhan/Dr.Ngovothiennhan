/* App Y tế VK V3 — Cloudflare Worker: API + đăng nhập + lưu file + sao lưu.
   Dữ liệu: D1 (bảng sheet_rows giữ nguyên hình dạng "tab/dòng/cột" của Google Sheets).
   File chứng từ: R2. Chạy trong gói miễn phí của Cloudflare. */

const ATTP=['FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','MealSessions','Inventory','OCRInbox'];
const KITCHEN_EXTRA=['MenuPlan','StockIssuePlan','WarehouseCatalog','WarehouseLedger'];
const HEALTH=['Students','Enrollments','Attendance','HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance'];
const COMMON=['SchoolYears','Classes','Documents','Tasks','Communication','SourceRegistry','IdentityReview','AuditLog','Config'];
const ROLE_READ={
  ADMIN:['*'],
  NVYT:[...HEALTH,...ATTP,...KITCHEN_EXTRA,...COMMON],
  ATTP:['Students','Enrollments','Classes','SchoolYears',...ATTP,...KITCHEN_EXTRA,'Documents','Tasks','Communication'],
  VIEWER:[...HEALTH.filter(x=>!x.startsWith('Medication')),...ATTP,...KITCHEN_EXTRA,'SchoolYears','Classes','Documents','Tasks','Communication']
};
const ROLE_WRITE={
  ADMIN:['*'],
  NVYT:[...HEALTH,...ATTP,'Documents','Tasks','Communication','AuditLog'],
  ATTP:[...ATTP,'Documents','Tasks','Communication','AuditLog'],
  VIEWER:[]
};
const ROLES=['ADMIN','NVYT','ATTP','VIEWER'];
const REQUIRED={
  FoodStep1:['MealSessionID','FoodName'],FoodStep2:['MealSessionID','DishName'],FoodStep3:['MealSessionID','DishName'],
  FoodSampleLog:['MealSessionID','SampleName','CollectedAt'],MealSessions:['Date','Meal']
};
const USER_HEADER=['Email','Role','Status','DisplayName','AddedAt','AddedBy','Note'];
const FILE_TYPES=/^(image\/(jpeg|png|webp)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel|text\/csv)$/;
const MAX_FILE=10*1024*1024;
const SESSION_MS=30*86400e3;
const PBKDF2_ITER=100000;

const enc=new TextEncoder();
const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(msg,status=400)=>json({ok:false,error:msg},status);
const b64=u8=>{let s='';u8.forEach(c=>s+=String.fromCharCode(c));return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hex=u8=>[...u8].map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha256hex(s){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))))}
async function pbkdf2(pw,salt){
  const k=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:PBKDF2_ITER},k,256));
}
async function hashPw(pw){const salt=crypto.getRandomValues(new Uint8Array(16));return'pbkdf2$'+PBKDF2_ITER+'$'+b64(salt)+'$'+b64(await pbkdf2(pw,salt))}
async function checkPw(pw,stored){
  const p=String(stored||'').split('$');if(p.length!==4||p[0]!=='pbkdf2'||+p[1]!==PBKDF2_ITER)return false;
  const got=await pbkdf2(pw,unb64(p[2])),want=unb64(p[3]);
  if(got.length!==want.length)return false;let d=0;for(let i=0;i<got.length;i++)d|=got[i]^want[i];return d===0;
}
function tempPassword(){
  const a='abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=crypto.getRandomValues(new Uint8Array(10));
  return[...r].map(x=>a[x%a.length]).join('');
}
const allowed=(role,sheet,write)=>{const a=(write?ROLE_WRITE:ROLE_READ)[role]||[];return a.includes('*')||a.includes(sheet)};
const cellStr=v=>v==null?'':String(v);
const colNum=s=>{let n=0;for(const c of s.toUpperCase())n=n*26+c.charCodeAt(0)-64;return n};

/** 'Sheet!A1:N500' | 'Sheet!A:Z' | 'Sheet!T12:W12' | 'Sheet' */
function parseRange(range){
  const m=String(range||'').match(/^'?([^'!]+)'?(?:!(?:([A-Za-z]+)(\d*)(?::([A-Za-z]+)(\d*))?)?)?$/);
  if(!m)throw new Error('Phạm vi không hợp lệ: '+range);
  const c1=m[2]?colNum(m[2]):1,r1=m[3]?+m[3]:1;
  const c2=m[4]?colNum(m[4]):(m[2]&&!m[4]?c1:1e6),r2=m[5]?+m[5]:(m[4]||!m[2]?1e6:(m[3]?r1:1e6));
  return{sheet:m[1],c1,c2,r1,r2};
}

/* ---------- đăng nhập ---------- */
async function login(env,req){
  const {username,password}=await req.json().catch(()=>({}));
  const u=String(username||'').trim().toLowerCase();
  if(!u||!password)return fail('Nhập tên đăng nhập và mật khẩu.');
  const now=Date.now();
  const row=await env.DB.prepare('SELECT * FROM users WHERE username=?1').bind(u).first();
  if(row&&row.locked_until>now)return fail('Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau '+Math.ceil((row.locked_until-now)/60000)+' phút.',429);
  const ok=row&&row.status==='ACTIVE'&&await checkPw(String(password),row.pw);
  if(!ok){
    if(row){const f=row.fails+1;await env.DB.prepare('UPDATE users SET fails=?2, locked_until=?3 WHERE username=?1').bind(u,f>=5?0:f,f>=5?now+10*60e3:0).run()}
    else await hashPw('x'); // làm đều thời gian phản hồi
    return fail('Sai tên đăng nhập hoặc mật khẩu.',401);
  }
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET fails=0, locked_until=0 WHERE username=?1').bind(u),
    env.DB.prepare('INSERT INTO sessions(token_hash,username,expires) VALUES(?1,?2,?3)').bind(await sha256hex(token),u,now+SESSION_MS)
  ]);
  return json({ok:true,token,user:{username:u,name:row.name||u,role:row.role,mustChange:!!row.must_change}});
}
async function auth(env,req){
  const h=req.headers.get('authorization')||'';
  const t=h.startsWith('Bearer ')?h.slice(7):'';
  if(!t)return null;
  const th=await sha256hex(t);
  const r=await env.DB.prepare('SELECT s.expires, u.username,u.name,u.role,u.status,u.must_change FROM sessions s JOIN users u ON u.username=s.username WHERE s.token_hash=?1').bind(th).first();
  if(!r||r.expires<Date.now()||r.status!=='ACTIVE')return null;
  if(r.expires-Date.now()<SESSION_MS/2)await env.DB.prepare('UPDATE sessions SET expires=?2 WHERE token_hash=?1').bind(th,Date.now()+SESSION_MS).run();
  return{username:r.username,name:r.name||r.username,role:r.role,mustChange:!!r.must_change,th};
}

/* ---------- đọc / ghi bảng ---------- */
async function readRanges(env,me,ranges){
  if(!Array.isArray(ranges)||!ranges.length)throw new Error('Không có ranges.');
  if(ranges.length>40)throw new Error('Quá nhiều ranges.');
  const parsed=ranges.map(parseRange),stmts=[],plan=[];
  for(const p of parsed){
    if(p.sheet==='Users'){
      if(me.role!=='ADMIN')throw new Error('Không có quyền đọc Users');
      plan.push({users:true});continue;
    }
    if(!allowed(me.role,p.sheet,false))throw new Error('Không có quyền đọc '+p.sheet);
    plan.push({i:stmts.length,p});
    stmts.push(env.DB.prepare('SELECT n,data FROM sheet_rows WHERE sheet=?1 AND n BETWEEN ?2 AND ?3 ORDER BY n').bind(p.sheet,p.r1,Math.min(p.r2,1e6)));
  }
  const res=stmts.length?await env.DB.batch(stmts):[];
  const out=[];
  for(const x of plan){
    if(x.users){
      const u=await env.DB.prepare('SELECT username,role,status,name,created_at FROM users ORDER BY created_at').all();
      out.push([USER_HEADER,...u.results.map(r=>[r.username,r.role,r.status,r.name||'',r.created_at||'','',''])]);continue;
    }
    const {p}=x;
    out.push(res[x.i].results.map(r=>{
      let a=JSON.parse(r.data);
      if(p.c1>1||p.c2<1e6)a=a.slice(p.c1-1,p.c2);
      while(a.length&&a[a.length-1]==='')a.pop();
      return a;
    }));
  }
  return out;
}
async function appendRows(env,me,range,rows){
  const {sheet}=parseRange(range);
  if(!allowed(me.role,sheet,true))throw new Error('Không có quyền ghi '+sheet);
  if(!Array.isArray(rows)||!rows.length)throw new Error('Không có dòng dữ liệu.');
  if(rows.length>500)throw new Error('Tối đa 500 dòng mỗi lần ghi.');
  const head=await env.DB.prepare('SELECT data FROM sheet_rows WHERE sheet=?1 AND n=1').bind(sheet).first();
  if(!head)throw new Error('Chưa có tab "'+sheet+'" trong hệ thống. Admin hãy chạy đồng bộ từ Google Sheet.');
  const header=JSON.parse(head.data),width=Math.max(...rows.map(r=>r.length),header.length);
  const safe=rows.map(r=>Array.from({length:width},(_,i)=>cellStr(r[i])));
  const req=REQUIRED[sheet];
  if(req)safe.forEach((r,n)=>req.forEach(k=>{const i=header.indexOf(k);if(i>=0&&!r[i].trim())throw new Error('Dòng '+(n+1)+': thiếu trường bắt buộc '+k+' ('+sheet+').')}));
  const payload=JSON.stringify(safe);
  await env.DB.prepare('INSERT INTO sheet_rows(sheet,n,data) SELECT ?1, (SELECT COALESCE(MAX(n),0) FROM sheet_rows WHERE sheet=?1)+1+key, value FROM json_each(?2)').bind(sheet,payload).run();
  return safe.length;
}
async function updateRange(env,me,range,rows){
  const p=parseRange(range);
  if(!allowed(me.role,p.sheet,true))throw new Error('Không có quyền cập nhật '+p.sheet);
  if(!Array.isArray(rows)||!rows.length)throw new Error('Không có dữ liệu cập nhật.');
  if(rows.length>200)throw new Error('Tối đa 200 dòng mỗi lần cập nhật.');
  if(p.r1<2)throw new Error('Không được sửa dòng tiêu đề.');
  const stmts=[];
  for(let i=0;i<rows.length;i++){
    const n=p.r1+i,cur=await env.DB.prepare('SELECT data FROM sheet_rows WHERE sheet=?1 AND n=?2').bind(p.sheet,n).first();
    if(!cur)throw new Error('Không có dòng '+n+' trong '+p.sheet);
    const a=JSON.parse(cur.data);
    rows[i].forEach((v,j)=>{const c=p.c1-1+j;while(a.length<=c)a.push('');a[c]=cellStr(v)});
    stmts.push(env.DB.prepare('UPDATE sheet_rows SET data=?3 WHERE sheet=?1 AND n=?2').bind(p.sheet,n,JSON.stringify(a)));
  }
  await env.DB.batch(stmts);
  return rows.length;
}

/* ---------- quản lý người dùng (ADMIN) ---------- */
const validUser=u=>/^[a-z0-9._-]{3,32}$/.test(u);
async function adminCount(env){return(await env.DB.prepare("SELECT COUNT(*) c FROM users WHERE role='ADMIN' AND status='ACTIVE'").first()).c}
async function adminAction(env,me,action,p){
  if(me.role!=='ADMIN')throw new Error('Chỉ Admin được quản lý người dùng.');
  const u=String(p.username||'').trim().toLowerCase();
  if(action==='createUser'){
    if(!validUser(u))throw new Error('Tên đăng nhập 3–32 ký tự: chữ thường, số, dấu chấm, gạch.');
    if(!ROLES.includes(p.role))throw new Error('Vai trò không hợp lệ.');
    if(await env.DB.prepare('SELECT 1 x FROM users WHERE username=?1').bind(u).first())throw new Error('Tên đăng nhập đã tồn tại.');
    const tmp=tempPassword();
    await env.DB.prepare('INSERT INTO users(username,name,role,status,pw,must_change,created_at) VALUES(?1,?2,?3,?4,?5,1,?6)').bind(u,String(p.name||'').slice(0,80),p.role,'ACTIVE',await hashPw(tmp),new Date().toISOString()).run();
    return{ok:true,username:u,tempPassword:tmp};
  }
  const row=await env.DB.prepare('SELECT * FROM users WHERE username=?1').bind(u).first();
  if(!row)throw new Error('Không tìm thấy người dùng.');
  if(action==='resetPassword'){
    const tmp=tempPassword();
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pw=?2, must_change=1, fails=0, locked_until=0 WHERE username=?1').bind(u,await hashPw(tmp)),
      env.DB.prepare('DELETE FROM sessions WHERE username=?1').bind(u)
    ]);
    return{ok:true,username:u,tempPassword:tmp};
  }
  if(action==='setUser'){
    const role=p.role||row.role,status=p.status||row.status;
    if(!ROLES.includes(role)||!['ACTIVE','DISABLED'].includes(status))throw new Error('Giá trị không hợp lệ.');
    if(row.role==='ADMIN'&&row.status==='ACTIVE'&&(role!=='ADMIN'||status!=='ACTIVE')&&await adminCount(env)<=1)throw new Error('Phải còn ít nhất một Admin hoạt động.');
    await env.DB.prepare('UPDATE users SET role=?2,status=?3 WHERE username=?1').bind(u,role,status).run();
    if(status!=='ACTIVE')await env.DB.prepare('DELETE FROM sessions WHERE username=?1').bind(u).run();
    return{ok:true};
  }
  throw new Error('Action không được hỗ trợ.');
}
async function changePassword(env,me,p){
  const row=await env.DB.prepare('SELECT pw FROM users WHERE username=?1').bind(me.username).first();
  if(!await checkPw(String(p.oldPassword||''),row.pw))throw new Error('Mật khẩu hiện tại không đúng.');
  const np=String(p.newPassword||'');
  if(np.length<8||!/[A-Za-z]/.test(np)||!/\d/.test(np))throw new Error('Mật khẩu mới tối thiểu 8 ký tự, gồm cả chữ và số.');
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pw=?2, must_change=0 WHERE username=?1').bind(me.username,await hashPw(np)),
    env.DB.prepare('DELETE FROM sessions WHERE username=?1 AND token_hash<>?2').bind(me.username,me.th)
  ]);
}

/* ---------- sức khỏe hệ thống ---------- */
async function health(env){
  const checks=[],add=(check,ok,msg='')=>checks.push({check,ok:!!ok,msg});
  try{await env.DB.prepare('SELECT 1').first();add('Cơ sở dữ liệu D1',true)}catch(e){add('Cơ sở dữ liệu D1',false,String(e.message||e))}
  try{await env.FILES.list({limit:1});add('Kho file R2',true)}catch(e){add('Kho file R2',false,String(e.message||e))}
  try{
    const have=new Set((await env.DB.prepare('SELECT DISTINCT sheet FROM sheet_rows').all()).results.map(r=>r.sheet));
    ['Students','Enrollments','MealSessions','FoodStep1','FoodStep2','FoodStep3','FoodSampleLog','Inventory','AuditLog'].forEach(s=>add('Tab '+s,have.has(s),have.has(s)?'':'chưa đồng bộ từ Google Sheet'));
    const lb=await env.DB.prepare("SELECT v FROM settings WHERE k='last_backup'").first();
    const age=lb?(Date.now()-Date.parse(lb.v))/3600e3:null;
    add('Sao lưu tự động',age!=null&&age<36,lb?'lần cuối '+lb.v:'chưa có bản sao lưu');
    const ls=await env.DB.prepare("SELECT v FROM settings WHERE k='last_sheet_sync'").first();
    add('Chép sang Google Sheets',ls&&(Date.now()-Date.parse(ls.v))/3600e3<36,ls?'lần cuối '+ls.v:'chưa chép lần nào (chạy Apps Script)');
  }catch(e){add('Dữ liệu',false,String(e.message||e))}
  return{ok:true,allOk:checks.every(c=>c.ok),checks,checkedAt:new Date().toISOString()};
}

/* ---------- đồng bộ với Google Sheets (Apps Script gọi bằng khóa riêng) ---------- */
async function syncAuth(env,req){
  const k=req.headers.get('x-sync-key')||'';
  const row=await env.DB.prepare("SELECT v FROM settings WHERE k='sync_key'").first();
  if(!row||!k||k.length!==row.v.length)return false;
  let d=0;for(let i=0;i<k.length;i++)d|=k.charCodeAt(i)^row.v.charCodeAt(i);return d===0;
}
async function dumpAll(env){
  const r=await env.DB.prepare('SELECT sheet,n,data FROM sheet_rows ORDER BY sheet,n').all();
  const out={};r.results.forEach(x=>{(out[x.sheet]=out[x.sheet]||[]).push(JSON.parse(x.data))});
  return out;
}
async function syncImport(env,b){
  const sheet=String(b.sheet||'');
  if(!/^[A-Za-z0-9_]{2,40}$/.test(sheet)||sheet==='Users')throw new Error('Tên tab không hợp lệ.');
  const rows=b.rows;if(!Array.isArray(rows)||!rows.length)throw new Error('Không có dòng.');
  const clean=rows.map(r=>r.map(cellStr));
  const stmts=[];
  if(b.reset)stmts.push(env.DB.prepare('DELETE FROM sheet_rows WHERE sheet=?1').bind(sheet));
  stmts.push(env.DB.prepare('INSERT INTO sheet_rows(sheet,n,data) SELECT ?1, (SELECT COALESCE(MAX(n),0) FROM sheet_rows WHERE sheet=?1)+1+key, value FROM json_each(?2)').bind(sheet,JSON.stringify(clean)));
  await env.DB.batch(stmts);
  return clean.length;
}

/* ---------- sao lưu nightly vào R2 ---------- */
async function backup(env){
  const day=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);
  await env.FILES.put('backup/'+day+'.json',JSON.stringify({createdAt:new Date().toISOString(),sheets:await dumpAll(env)}),{httpMetadata:{contentType:'application/json'}});
  const l=await env.FILES.list({prefix:'backup/'}),old=l.objects.map(o=>o.key).sort().slice(0,-30);
  for(const k of old)await env.FILES.delete(k);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings(k,v) VALUES('last_backup',?1) ON CONFLICT(k) DO UPDATE SET v=?1").bind(new Date().toISOString()),
    env.DB.prepare('DELETE FROM sessions WHERE expires<?1').bind(Date.now())
  ]);
}

/* ---------- định tuyến ---------- */
async function handle(req,env){
  const url=new URL(req.url),path=url.pathname;
  try{
    if(path==='/api/ping')return json({ok:true,service:'yte-vk',version:'3.0.0'});
    if(path==='/api/login'&&req.method==='POST')return await login(env,req);

    if(path==='/api/sync/export'&&req.method==='GET'){
      if(!await syncAuth(env,req))return fail('Khóa đồng bộ không đúng.',401);
      return json({ok:true,sheets:await dumpAll(env)});
    }
    if(path==='/api/sync/import'&&req.method==='POST'){
      if(!await syncAuth(env,req))return fail('Khóa đồng bộ không đúng.',401);
      return json({ok:true,rows:await syncImport(env,await req.json())});
    }
    if(path==='/api/sync/done'&&req.method==='POST'){
      if(!await syncAuth(env,req))return fail('Khóa đồng bộ không đúng.',401);
      await env.DB.prepare("INSERT INTO settings(k,v) VALUES('last_sheet_sync',?1) ON CONFLICT(k) DO UPDATE SET v=?1").bind(new Date().toISOString()).run();
      return json({ok:true});
    }

    if(!path.startsWith('/api/'))return new Response('Not found',{status:404});
    const me=await auth(env,req);
    if(!me)return fail('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',401);

    if(path==='/api/logout'&&req.method==='POST'){await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?1').bind(me.th).run();return json({ok:true})}
    if(path==='/api/file'&&req.method==='GET'){
      if(!allowed(me.role,'Documents',false))return fail('Không có quyền xem chứng từ.',403);
      const key=url.searchParams.get('id')||'';
      if(!key.startsWith('files/'))return fail('File không hợp lệ.',400);
      const o=await env.FILES.get(key);if(!o)return fail('Không tìm thấy file.',404);
      return new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType||'application/octet-stream','cache-control':'private, max-age=3600','x-content-type-options':'nosniff','content-disposition':'inline'}});
    }
    if(path==='/api/upload'&&req.method==='POST'){
      if(!allowed(me.role,'Documents',true))return fail('Không có quyền tải chứng từ.',403);
      const f=(await req.formData()).get('file');
      if(!f||typeof f==='string')return fail('Chưa chọn file.');
      if(f.size>MAX_FILE)return fail('File quá lớn (tối đa 10 MB).');
      if(!FILE_TYPES.test(f.type||''))return fail('Định dạng file không được hỗ trợ (nhận ảnh, PDF, Excel, CSV).');
      const day=new Date(Date.now()+7*3600e3).toISOString().slice(0,10),safe=String(f.name||'file').replace(/[^\w.\-]+/g,'_').slice(-80);
      const key='files/'+day+'/'+hex(crypto.getRandomValues(new Uint8Array(6)))+'-'+safe;
      await env.FILES.put(key,f.stream(),{httpMetadata:{contentType:f.type}});
      return json({ok:true,id:key,name:f.name,url:'/api/file?id='+encodeURIComponent(key)});
    }
    if(path==='/api/call'&&req.method==='POST'){
      const {action,payload={}}=await req.json();
      if(me.mustChange&&!['whoami','changePassword'].includes(action))return fail('Hãy đổi mật khẩu trước khi sử dụng.',403);
      switch(action){
        case'whoami':return json({ok:true,username:me.username,email:me.username,name:me.name,role:me.role,mustChange:me.mustChange});
        case'readRanges':return json({ok:true,values:await readRanges(env,me,payload.ranges)});
        case'appendRows':return json({ok:true,updatedRows:await appendRows(env,me,payload.range,payload.rows)});
        case'updateRange':return json({ok:true,updatedRows:await updateRange(env,me,payload.range,payload.rows)});
        case'changePassword':await changePassword(env,me,payload);return json({ok:true});
        case'health':if(me.role==='VIEWER')return fail('Không có quyền.',403);return json(await health(env));
        case'createUser':case'resetPassword':case'setUser':return json(await adminAction(env,me,action,payload));
        default:return fail('Action không được hỗ trợ.');
      }
    }
    return fail('Không tìm thấy.',404);
  }catch(e){return fail(String(e&&e.message||e),400)}
}
export default{
  fetch:handle,
  async scheduled(_ev,env,ctx){ctx.waitUntil(backup(env))}
};
export{handle,backup,parseRange};
