import crypto from 'node:crypto';

const BUCKET = process.env.ATTP_BUCKET || 'attp-documents';
const DB_URL = process.env.ATTP_DATABASE_URL || process.env.DATABASE_URL || '';
const CORS_ORIGIN = 'https://drngovothiennhan.github.io';
let jwksCache = null;
let jwksAt = 0;
let aiProbeCache = { at: 0, ok: false, model: null, reason: 'unprobed' };
const AUTHORIZED_EMAIL = 'admin@attp.local';
const AUTH_BASE = process.env.NEON_AUTH_BASE_URL || '';

function cors(extra={}) { return {'access-control-allow-origin':CORS_ORIGIN,'access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'GET,POST,OPTIONS','vary':'Origin',...extra}; }
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:cors({'content-type':'application/json; charset=utf-8'})});}
function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9.,|]+/g,' ').trim();}
function clamp(v){return Math.max(0,Math.min(100,Number(v)||0));}
function b64uToBuf(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Buffer.from(s,'base64');}

function extractSessionCookie(headers){
  const values=typeof headers.getSetCookie==='function'?headers.getSetCookie():[headers.get('set-cookie')||''];
  for(const value of values){
    if(!/session_token=/i.test(value)) continue;
    const pair=value.split(';')[0].trim();
    if(pair) return pair;
  }
  return '';
}
function validSessionCookie(value){
  return typeof value==='string' && value.length>10 && value.length<4096 && /session_token=/i.test(value) && !/[\r\n]/.test(value);
}
async function authFetch(path,init={}){
  if(!AUTH_BASE) throw new Error('AUTH_NOT_CONFIGURED');
  const headers=new Headers(init.headers||{});
  headers.set('origin',CORS_ORIGIN);
  headers.set('accept','application/json');
  return fetch(AUTH_BASE+path,{...init,headers,redirect:'manual'});
}
async function getJwtFromSessionCookie(sessionCookie){
  const tokenResp=await authFetch('/token',{method:'GET',headers:{cookie:sessionCookie}});
  const tokenBody=await tokenResp.json().catch(()=>({}));
  if(!tokenResp.ok||!tokenBody?.token) throw new Error('SESSION_REFRESH_FAILED');
  return tokenBody.token;
}
async function getAuthSession(sessionCookie){
  const r=await authFetch('/get-session',{method:'GET',headers:{cookie:sessionCookie}});
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body?.user||!body?.session) throw new Error('SESSION_INVALID');
  return body;
}
function adminUserOk(user){
  if(!user||String(user.email||'').toLowerCase()!==AUTHORIZED_EMAIL) return false;
  const role=user.role;
  return role==='admin'||(Array.isArray(role)&&role.includes('admin'))||(Array.isArray(user.roles)&&user.roles.includes('admin'));
}
async function handleAuthLogin(body){
  const email=String(body?.email||'').trim().toLowerCase();
  const password=String(body?.password||'');
  if(email!==AUTHORIZED_EMAIL||password.length<8) return json({error:'INVALID_CREDENTIALS'},401);
  const r=await authFetch('/sign-in/email',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({email,password,rememberMe:true})
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok) return json({error:'INVALID_CREDENTIALS'},401);
  if(!adminUserOk(data.user)) return json({error:'FORBIDDEN'},403);
  const sessionCookie=extractSessionCookie(r.headers);
  if(!validSessionCookie(sessionCookie)) return json({error:'SESSION_COOKIE_MISSING'},502);
  let token;
  try{token=await getJwtFromSessionCookie(sessionCookie);}catch(e){return json({error:'JWT_EXCHANGE_FAILED',message:String(e.message||e)},502);}
  return json({token,sessionCookie,user:{id:data.user.id,email:data.user.email,name:data.user.name,role:data.user.role}});
}
async function handleAuthRefresh(body){
  const sessionCookie=String(body?.sessionCookie||'');
  if(!validSessionCookie(sessionCookie)) return json({error:'SESSION_INVALID'},401);
  let session;
  try{session=await getAuthSession(sessionCookie);}catch{return json({error:'SESSION_EXPIRED'},401);}
  if(!adminUserOk(session.user)) return json({error:'FORBIDDEN'},403);
  let token;
  try{token=await getJwtFromSessionCookie(sessionCookie);}catch{return json({error:'SESSION_EXPIRED'},401);}
  return json({token,user:{id:session.user.id,email:session.user.email,name:session.user.name,role:session.user.role}});
}
async function handleAuthLogout(body){
  const sessionCookie=String(body?.sessionCookie||'');
  if(validSessionCookie(sessionCookie)){
    try{await authFetch('/sign-out',{method:'POST',headers:{cookie:sessionCookie,'content-type':'application/json'},body:'{}'});}catch{}
  }
  return json({ok:true});
}

async function verifyJwt(req){
  const h=req.headers.get('authorization')||'';
  if(!h.toLowerCase().startsWith('bearer ')) throw new Error('UNAUTHORIZED');
  const token=h.slice(7); const parts=token.split('.'); if(parts.length!==3) throw new Error('UNAUTHORIZED');
  const header=JSON.parse(b64uToBuf(parts[0]).toString('utf8')); const payload=JSON.parse(b64uToBuf(parts[1]).toString('utf8'));
  if(header.alg!=='EdDSA'||!header.kid) throw new Error('UNAUTHORIZED');
  const now=Math.floor(Date.now()/1000); if(payload.exp && payload.exp<now) throw new Error('TOKEN_EXPIRED');
  const issuer=new URL(process.env.NEON_AUTH_BASE_URL).origin;
  if(payload.iss!==issuer || (payload.aud && payload.aud!==issuer)) throw new Error('UNAUTHORIZED');
  if(!jwksCache || Date.now()-jwksAt>10*60*1000){const r=await fetch(process.env.NEON_AUTH_JWKS_URL);if(!r.ok) throw new Error('JWKS_UNAVAILABLE');jwksCache=await r.json();jwksAt=Date.now();}
  const jwk=(jwksCache.keys||[]).find(k=>k.kid===header.kid); if(!jwk) throw new Error('UNAUTHORIZED');
  const key=await crypto.webcrypto.subtle.importKey('jwk',jwk,{name:'Ed25519'},false,['verify']);
  const ok=await crypto.webcrypto.subtle.verify({name:'Ed25519'},key,b64uToBuf(parts[2]),Buffer.from(parts[0]+'.'+parts[1]));
  if(!ok) throw new Error('UNAUTHORIZED');
  return payload;
}

function sqlEndpoint(){const u=new URL(DB_URL);return `https://${u.hostname}/sql`;}
async function sql(query,params=[]){
  if(!DB_URL) throw new Error('DATABASE_NOT_CONFIGURED');
  const r=await fetch(sqlEndpoint(),{method:'POST',headers:{'content-type':'application/json','Neon-Connection-String':DB_URL,'Neon-Raw-Text-Output':'true','Neon-Array-Mode':'true'},body:JSON.stringify({query,params:params.map(v=>v===null?null:String(v))})});
  const body=await r.json().catch(()=>({})); if(!r.ok) throw new Error(body.message||`DB_HTTP_${r.status}`);
  const names=(body.fields||[]).map(f=>f.name); return (body.rows||[]).map(row=>Object.fromEntries(row.map((v,i)=>[names[i],v])));
}

function amzDate(d=new Date()){return d.toISOString().replace(/[:-]|\.\d{3}/g,'');}
function sha256Hex(data){return crypto.createHash('sha256').update(data).digest('hex');}
function hmac(key,data,enc){return crypto.createHmac('sha256',key).update(data).digest(enc);}
async function putObject(key, bytes, contentType){
  const endpoint=process.env.AWS_ENDPOINT_URL_S3, region=process.env.AWS_REGION, access=process.env.AWS_ACCESS_KEY_ID, secret=process.env.AWS_SECRET_ACCESS_KEY;
  if(!endpoint||!region||!access||!secret) throw new Error('STORAGE_NOT_CONFIGURED');
  const u=new URL(endpoint); const path='/' + BUCKET + '/' + key.split('/').map(encodeURIComponent).join('/'); const ts=amzDate(); const date=ts.slice(0,8); const payloadHash=sha256Hex(bytes);
  const headers={'host':u.host,'content-type':contentType,'x-amz-content-sha256':payloadHash,'x-amz-date':ts}; const signed='content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders=`content-type:${contentType}\nhost:${u.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${ts}\n`;
  const canonicalRequest=`PUT\n${path}\n\n${canonicalHeaders}\n${signed}\n${payloadHash}`; const scope=`${date}/${region}/s3/aws4_request`;
  const stringToSign=`AWS4-HMAC-SHA256\n${ts}\n${scope}\n${sha256Hex(canonicalRequest)}`;
  const kDate=hmac('AWS4'+secret,date); const kRegion=hmac(kDate,region); const kService=hmac(kRegion,'s3'); const kSigning=hmac(kService,'aws4_request'); const sig=hmac(kSigning,stringToSign,'hex');
  const auth=`AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signed}, Signature=${sig}`;
  const r=await fetch(u.origin+path,{method:'PUT',headers:{...headers,Authorization:auth},body:bytes}); if(!r.ok) throw new Error(`STORAGE_${r.status}:${(await r.text()).slice(0,180)}`); return key;
}

async function aiModels(){
  const base=process.env.NEON_AI_GATEWAY_BASE_URL, token=process.env.NEON_AI_GATEWAY_TOKEN; if(!base||!token) return [];
  const r=await fetch(base+'/v1/models',{headers:{authorization:`Bearer ${token}`}}); if(!r.ok) return []; const d=await r.json(); return (d.data||[]).map(x=>x.id);
}
async function aiChat(model,messages,maxTokens=7000){
  const base=process.env.NEON_AI_GATEWAY_BASE_URL, token=process.env.NEON_AI_GATEWAY_TOKEN; if(!base||!token) throw new Error('AI_GATEWAY_NOT_CONFIGURED');
  const r=await fetch(base+'/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({model,messages,temperature:0,max_tokens:maxTokens})});
  const txt=await r.text(); if(!r.ok) throw new Error(`AI_${r.status}:${txt.slice(0,300)}`); const d=JSON.parse(txt); return d.choices?.[0]?.message?.content||'';
}
async function probeAi(){
  if(Date.now()-aiProbeCache.at<5*60*1000) return aiProbeCache;
  const models=await aiModels();
  const model=models.find(x=>/gemini/i.test(x))||models.find(x=>/gpt-5-mini|claude-haiku/i.test(x))||null;
  if(!model){ aiProbeCache={at:Date.now(),ok:false,model:null,reason:'NO_MODEL'}; return aiProbeCache; }
  try{
    await aiChat(model,[{role:'user',content:'ping'}],1);
    aiProbeCache={at:Date.now(),ok:true,model,reason:null};
  }catch(e){
    aiProbeCache={at:Date.now(),ok:false,model,reason:String(e.message||e).slice(0,180)};
  }
  return aiProbeCache;
}
function extractJson(s){const t=String(s||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim(); const a=t.indexOf('{'),b=t.lastIndexOf('}'); if(a<0||b<a) throw new Error('AI_JSON_INVALID'); return JSON.parse(t.slice(a,b+1));}
function verifyLine(item,raw){const nn=norm(item.name).split(' ').filter(Boolean).slice(0,2).join(' '), nq=norm(item.quantity); if(!nn||!nq)return {ok:false,line:''}; const line=String(raw||'').split(/\r?\n/).find(x=>norm(x).includes(nn)&&norm(x).includes(nq))||''; if(!line)return {ok:false,line:''}; const c=line.split('|').map(x=>norm(x)); return {ok:c.length>=5&&c[4]===nq&&(!item.unit||c[3].includes(norm(item.unit))||norm(item.unit).includes(c[3])),line};}

async function handleOcr(body,user){
  const {kind,image}=body||{}; if(!image?.data||!image?.mimeType||!['1a','1b','2','3','sample'].includes(kind)) return json({error:'INVALID_INPUT'},400);
  const bytes=Buffer.from(image.data,'base64'); if(bytes.length>6*1024*1024) return json({error:'IMAGE_TOO_LARGE'},413);
  const imageSha256=sha256Hex(bytes);
  let imageKey;
  try{
    const ext=image.mimeType==='image/png'?'png':image.mimeType==='image/webp'?'webp':'jpg';
    imageKey=await putObject(`ocr/${new Date().toISOString().slice(0,10)}/${kind}/${imageSha256}.${ext}`,bytes,image.mimeType);
  }catch(e){
    return json({error:'STORAGE_UNAVAILABLE',message:String(e.message||e)},503);
  }
  const probe=await probeAi();
  if(!probe.ok) return json({error:'AI_GATEWAY_UNAVAILABLE',message:probe.reason||'AI Gateway unavailable',localFallback:true},503);
  const model=probe.model;
  const dataUrl=`data:${image.mimeType};base64,${image.data}`; const invoice=kind==='1a'||kind==='1b';
  const p1=invoice?'OCR chứng từ thực phẩm tiếng Việt. Chép đúng phần đầu và toàn bộ bảng. Mỗi dòng đúng dạng: STT | Mã | Tên hàng | ĐVT | Số lượng | Đơn giá | Thành tiền. Không suy đoán, không chuyển đơn giá/thành tiền thành số lượng.':'OCR chính xác toàn bộ biểu mẫu ATTP tiếng Việt. Giữ nguyên ngày giờ số liệu, dùng ? nếu không đọc được.';
  let raw;
  try{ raw=await aiChat(model,[{role:'user',content:[{type:'text',text:p1},{type:'image_url',image_url:{url:dataUrl}}]}]); }
  catch(e){ aiProbeCache={at:Date.now(),ok:false,model,reason:String(e.message||e).slice(0,180)}; return json({error:'AI_GATEWAY_UNAVAILABLE',message:String(e.message||e),localFallback:true},503); }
  const p2=`Đối chiếu ảnh với OCR thô. Trả JSON DUY NHẤT dạng {"fields":[{"key":"...","value":"...","confidence":0}],"lineItems":[{"code":"","name":"","unit":"","quantity":"","expiry":"","confidence":0,"kindSuggestion":"1a|1b|review","reason":""}]}. Với hóa đơn quantity chỉ lấy cột Số lượng/SL; không lấy Đơn giá/Thành tiền. Không tự điền HSD. OCR thô:\n${raw}`;
  let parsed;
  try{ parsed=extractJson(await aiChat(model,[{role:'user',content:[{type:'text',text:p2},{type:'image_url',image_url:{url:dataUrl}}]}])); }
  catch(e){ return json({error:'AI_GATEWAY_UNAVAILABLE',message:String(e.message||e),localFallback:true},503); }
  const fields=(parsed.fields||[]).filter(x=>x?.key&&String(x.value||'').trim()).map(x=>{const ev=norm(raw).includes(norm(x.value));return {key:String(x.key),value:String(x.value),confidence:ev?Math.min(96,Math.max(80,clamp(x.confidence))):Math.min(90,clamp(x.confidence))};});
  const lines=(parsed.lineItems||[]).filter(x=>String(x?.name||'').trim()).slice(0,100).map(x=>{const v=verifyLine(x,raw),m=clamp(x.confidence);return {...x,confidence:v.ok&&m>=95?Math.min(97,m):Math.min(90,m),columnVerified:v.ok,evidenceLine:v.line,kindSuggestion:['1a','1b'].includes(x.kindSuggestion)?x.kindSuggestion:'review'};});
  const status=(fields.some(x=>x.confidence<95)||lines.some(x=>x.confidence<95))?'review':'completed';
  const idem='ocr:'+kind+':'+imageSha256;
  const rows=await sql(`insert into ocr_jobs(idempotency_key,kind,status,image_key,image_sha256,provider,model,raw_text,passes,attempts,result,completed_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,2,2,$9::jsonb,now())
    on conflict(idempotency_key) do update set status=excluded.status,image_key=excluded.image_key,image_sha256=excluded.image_sha256,provider=excluded.provider,model=excluded.model,raw_text=excluded.raw_text,passes=excluded.passes,attempts=ocr_jobs.attempts+1,result=excluded.result,completed_at=now()
    returning id`,[idem,kind,status,imageKey,imageSha256,'neon-ai-gateway',model,raw,JSON.stringify({fields,lineItems:lines,userId:user.sub})]);
  const jobId=rows[0]?.id; for(let i=0;i<lines.length;i++){const x=lines[i];await sql(`insert into ocr_line_items(ocr_job_id,line_no,code,name,unit,quantity,expiry,confidence,kind_suggestion,column_verified,reason,evidence)
      values($1,$2,$3,$4,$5,$6,nullif($7,'')::date,$8,$9,$10,$11,$12::jsonb)
      on conflict(ocr_job_id,line_no) do update set code=excluded.code,name=excluded.name,unit=excluded.unit,quantity=excluded.quantity,expiry=excluded.expiry,confidence=excluded.confidence,kind_suggestion=excluded.kind_suggestion,column_verified=excluded.column_verified,reason=excluded.reason,evidence=excluded.evidence`,
      [jobId,i+1,x.code||'',x.name,x.unit||'',x.quantity||'',x.expiry||'',x.confidence,x.kindSuggestion,x.columnVerified?'true':'false',x.reason||'',JSON.stringify({line:x.evidenceLine||''})]);}
  return json({jobId,fields,lineItems:lines,rawText:raw,imageKey,imageSha256,passes:2,model});
}

async function handleLocalOcr(body,user){
  const {kind,image,rawText='',lineItems=[]}=body||{};
  if(!image?.data||!image?.mimeType||!['1a','1b','2','3','sample'].includes(kind)) return json({error:'INVALID_INPUT'},400);
  const bytes=Buffer.from(image.data,'base64'); if(bytes.length>6*1024*1024) return json({error:'IMAGE_TOO_LARGE'},413);
  const imageSha256=sha256Hex(bytes);
  const ext=image.mimeType==='image/png'?'png':image.mimeType==='image/webp'?'webp':'jpg';
  let imageKey;
  try{ imageKey=await putObject(`ocr/${new Date().toISOString().slice(0,10)}/${kind}/${imageSha256}.${ext}`,bytes,image.mimeType); }
  catch(e){ return json({error:'STORAGE_UNAVAILABLE',message:String(e.message||e)},503); }
  const safeLines=(Array.isArray(lineItems)?lineItems:[]).slice(0,100).map(x=>({...x,confidence:Math.min(90,clamp(x.confidence)),columnVerified:false,reason:'OCR local dự phòng; bắt buộc dò lại'}));
  const idem='ocr-local:'+kind+':'+imageSha256;
  const rows=await sql(`insert into ocr_jobs(idempotency_key,kind,status,image_key,image_sha256,provider,model,raw_text,passes,attempts,result,completed_at)
    values($1,$2,'review',$3,$4,'tesseract-local','tesseract.js',$5,1,1,$6::jsonb,now())
    on conflict(idempotency_key) do update set image_key=excluded.image_key,image_sha256=excluded.image_sha256,raw_text=excluded.raw_text,result=excluded.result,attempts=ocr_jobs.attempts+1,completed_at=now()
    returning id`,[idem,kind,imageKey,imageSha256,String(rawText),JSON.stringify({fields:[],lineItems:safeLines,userId:user.sub})]);
  const jobId=rows[0]?.id;
  for(let i=0;i<safeLines.length;i++){const x=safeLines[i];await sql(`insert into ocr_line_items(ocr_job_id,line_no,code,name,unit,quantity,expiry,confidence,kind_suggestion,column_verified,reason,evidence)
    values($1,$2,$3,$4,$5,$6,nullif($7,'')::date,$8,$9,false,$10,$11::jsonb)
    on conflict(ocr_job_id,line_no) do update set code=excluded.code,name=excluded.name,unit=excluded.unit,quantity=excluded.quantity,expiry=excluded.expiry,confidence=excluded.confidence,kind_suggestion=excluded.kind_suggestion,column_verified=false,reason=excluded.reason,evidence=excluded.evidence`,
    [jobId,i+1,x.code||'',x.name||'',x.unit||'',x.quantity||'',x.expiry||'',x.confidence,['1a','1b'].includes(x.kindSuggestion)?x.kindSuggestion:'review',x.reason||'',JSON.stringify({line:x.evidenceLine||''})]);}
  return json({jobId,imageKey,imageSha256,lineItems:safeLines,localFallback:true});
}

async function handler(req){
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors()});
  const u=new URL(req.url), path=u.pathname;
  if(path==='/'||path==='/health'){
    const models=await aiModels(); const probe=await probeAi(); return json({ok:true,service:'attpapi',dbConfigured:Boolean(DB_URL),storageConfigured:Boolean(process.env.AWS_ENDPOINT_URL_S3&&process.env.AWS_ACCESS_KEY_ID),authConfigured:Boolean(AUTH_BASE&&process.env.NEON_AUTH_JWKS_URL),aiConfigured:Boolean(process.env.NEON_AI_GATEWAY_BASE_URL&&process.env.NEON_AI_GATEWAY_TOKEN),aiOperational:probe.ok,aiReason:probe.reason,localFallback:true,aiModels:models.filter(x=>/gemini|gpt-5-mini|claude-haiku/i.test(x)).slice(0,8)});
  }
  if(path==='/api/auth/login'&&req.method==='POST') return handleAuthLogin(await req.json());
  if(path==='/api/auth/refresh'&&req.method==='POST') return handleAuthRefresh(await req.json());
  if(path==='/api/auth/logout'&&req.method==='POST') return handleAuthLogout(await req.json());
  let user; try{user=await verifyJwt(req);}catch(e){return json({error:e.message==='TOKEN_EXPIRED'?'TOKEN_EXPIRED':'UNAUTHORIZED'},401);}
  const roleOk=!user.role || user.role==='admin' || (Array.isArray(user.roles)&&user.roles.includes('admin'));
  if(user.email!==AUTHORIZED_EMAIL || !roleOk) return json({error:'FORBIDDEN'},403);
  if(path==='/api/bootstrap'&&req.method==='GET'){
    const [records,inventory,menus]=await Promise.all([sql(`select id,kind,status,source,item_code,fields,warnings,source_image_key,created_at from records order by id desc limit 250`),sql(`select id,name,group_name,received,expiry,lot,supplier,opening_qty,in_qty,out_qty,sample_qty,unit,location,storage,balance,created_at from inventory order by id desc limit 250`),sql(`select id,menu_date,meal,dish,servings,ingredients,created_at from menus order by id desc limit 250`)]); return json({records,inventory,menus,user:{sub:user.sub,email:user.email}});
  }
  if(path==='/api/ocr'&&req.method==='POST') return handleOcr(await req.json(),user);
  if(path==='/api/ocr-local'&&req.method==='POST') return handleLocalOcr(await req.json(),user);
  if(path==='/api/records'&&req.method==='POST'){
    const b=await req.json(); if(b.ocrJobId && !b.imageKey) return json({error:'SOURCE_IMAGE_REQUIRED'},409);
    const fields=b.fields||{}; const uncertain=Object.entries(fields).filter(([,v])=>v?.value&&Number(v?.confidence||0)<95&&!v?.confirmed).map(([k])=>k); const status=uncertain.length?'CẦN DÒ LẠI':'ĐÃ XÁC MINH';
    const legacyId=b.ocrJobId?`ocr-record:${b.ocrJobId}:${b.kind}`:null;
    const r=await sql(`insert into records(legacy_id,kind,status,source,fields,markers,raw_text,warnings,source_image_key,ocr_job_id)
      values($1,$2,$3,'neon-rebuild',$4::jsonb,$5::jsonb,$6,$7::jsonb,$8,$9)
      on conflict(legacy_id) do update set status=excluded.status,fields=excluded.fields,markers=excluded.markers,raw_text=excluded.raw_text,warnings=excluded.warnings,source_image_key=excluded.source_image_key,ocr_job_id=excluded.ocr_job_id
      returning id,status,created_at`,
      [legacyId,b.kind,status,JSON.stringify(fields),JSON.stringify(b.markers||[]),b.rawText||'',JSON.stringify(uncertain.map(k=>`OCR dưới 95%: ${k}`)),b.imageKey||null,b.ocrJobId||null]); return json(r[0],201);
  }
  if(path==='/api/invoice-records'&&req.method==='POST'){
    const b=await req.json(); if(!b.ocrJobId||!b.imageKey) return json({error:'SOURCE_IMAGE_REQUIRED'},409);
    const payload=[]; let review=0;
    for(const [i,line] of (b.lines||[]).slice(0,100).entries()){
      if(!line?.name||!['1a','1b'].includes(line.kind))continue;
      const c=clamp(line.confidence), fields={...(b.sharedFields||{}),name:{value:line.name,confidence:c,confirmed:c>=95},weight:{value:line.quantity||'',confidence:c,confirmed:c>=95},unit:{value:line.unit||'',confidence:c,confirmed:c>=95}};
      const uncertain=Object.values(fields).some(v=>v?.value&&Number(v.confidence||0)<95&&!v.confirmed); const status=uncertain?'CẦN DÒ LẠI':'ĐÃ XÁC MINH'; if(uncertain)review++;
      payload.push({legacy_id:`ocr-line:${b.ocrJobId}:${i+1}`,kind:line.kind,status,item_code:line.code||'',fields,warnings:uncertain?['Cần dò lại OCR']:[]});
    }
    if(!payload.length) return json({saved:0,review:0});
    const rows=await sql(`insert into records(legacy_id,kind,status,source,item_code,fields,raw_text,warnings,source_image_key,ocr_job_id)
      select x.legacy_id,x.kind,x.status,'multi-line-invoice',x.item_code,x.fields,x.raw_text,x.warnings,x.source_image_key,x.ocr_job_id
      from jsonb_to_recordset($1::jsonb) as x(legacy_id text,kind text,status text,item_code text,fields jsonb,raw_text text,warnings jsonb,source_image_key text,ocr_job_id bigint)
      on conflict(legacy_id) do update set status=excluded.status,item_code=excluded.item_code,fields=excluded.fields,raw_text=excluded.raw_text,warnings=excluded.warnings,source_image_key=excluded.source_image_key,ocr_job_id=excluded.ocr_job_id
      returning id,legacy_id,status`,
      [JSON.stringify(payload.map(x=>({...x,raw_text:b.rawText||'',source_image_key:b.imageKey,ocr_job_id:b.ocrJobId})))]);
    return json({saved:rows.length,review});
  }
  if(path==='/api/inventory'&&req.method==='POST'){
    const x=await req.json(); if(!x.name||!x.expiry||Number(x.inQty)<=0)return json({error:'INVALID_INVENTORY'},400); const r=await sql(`insert into inventory(name,group_name,received,expiry,lot,supplier,opening_qty,in_qty,out_qty,sample_qty,unit,location,storage,payload) values($1,$2,nullif($3,'')::date,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) returning *`,[x.name,x.group||'',x.received||'',x.expiry,x.lot||'',x.supplier||'',x.openingQty||0,x.inQty||0,x.outQty||0,x.sampleQty||0,x.unit||'',x.location||'',x.storage||'',JSON.stringify(x)]); return json(r[0],201);
  }
  if(path==='/api/menu'&&req.method==='POST'){
    const b=await req.json(),ids=[]; for(const x of (b.items||[]).filter(x=>x?.dish).slice(0,100)){const r=await sql(`insert into menus(menu_date,meal,dish,servings,ingredients,payload) values($1,$2,$3,$4,$5,$6::jsonb) returning id`,[x.date,x.meal,x.dish,x.servings||0,x.ingredients||'',JSON.stringify(x)]); ids.push(r[0]?.id);} return json({ids},201);
  }
  if(path==='/api/report'&&req.method==='GET'){
    const p=['today','week','month'].includes(u.searchParams.get('period'))?u.searchParams.get('period'):'today'; const interval=p==='month'?'1 month':p==='week'?'7 days':'1 day'; const a=await sql(`select count(*) filter(where kind in ('1a','1b'))::int step1,count(*) filter(where kind='2')::int step2,count(*) filter(where kind='3')::int step3,count(*) filter(where kind='sample')::int samples,count(*) filter(where status='CẦN DÒ LẠI')::int needs from records where created_at>=now()-$1::interval`,[interval]); const b=await sql(`select count(*) filter(where expiry<current_date)::int expired,count(*) filter(where expiry between current_date and current_date+7)::int expiring from inventory`); return json({period:p,...a[0],...b[0]});
  }
  return json({error:'NOT_FOUND'},404);
}

export default {fetch:handler};
