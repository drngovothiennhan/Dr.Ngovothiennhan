import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const app = express();
const port = Number(process.env.PORT || 10000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const bucket = process.env.ATTP_BUCKET || 'attp-documents';
const s3 = process.env.AWS_ENDPOINT_URL_S3 ? new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL_S3,
  forcePathStyle: true,
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
  requestChecksumCalculation: 'WHEN_REQUIRED',
}) : null;

const allowedOrigins = (process.env.CORS_ORIGINS || '*').split(',').map(x => x.trim()).filter(Boolean);
app.use(cors({ origin(origin, cb) {
  if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
  cb(new Error('Origin not allowed'));
}}));
app.use(express.json({ limit: '12mb' }));

function norm(v='') {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9.,|]+/g,' ').trim();
}
function clamp(v, max=100) { return Math.max(0, Math.min(max, Number(v) || 0)); }
function jsonText(resp) {
  return resp?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
}
function safeJson(text) {
  const s = String(text || '').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  return JSON.parse(s);
}
function fieldKeys(kind) {
  const map = {
    '1a':['name','receivedAt','weight','unit','supplier','supplierContact','deliverer','invoice','vetRegistration','quarantine','sensory','rapidTest','result','action'],
    '1b':['name','manufacturer','manufacturerAddress','receivedAt','weight','unit','supplier','supplierContact','deliverer','expiry','storage','invoice','sensory','action'],
    '2':['date','meal','dish','ingredients','servings','prepDone','cookDone','staffHygiene','equipment','area','sensory','action'],
    '3':['date','meal','dish','servings','splitDone','eatStart','utensils','sensory','action'],
    sample:['date','sampleName','meal','servings','amount','unit','container','temperature','takenAt','destroyAt','condition','keeper','destroyer','sealed'],
  };
  return map[kind] || [];
}
async function gemini(model, body) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_NOT_CONFIGURED');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`GEMINI_${r.status}:${text.slice(0,300)}`);
  return JSON.parse(text);
}
async function storeImage(data, mimeType, kind) {
  if (!s3) return null;
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const key = `ocr/${new Date().toISOString().slice(0,10)}/${kind}/${crypto.randomUUID()}.${ext}`;
  const body = Buffer.from(data, 'base64');
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key:key, Body:body, ContentType:mimeType, CacheControl:'private, max-age=0' }));
  return key;
}
function verifyLineAgainstTranscript(item, rawText) {
  const nName = norm(item.name).split(' ').filter(Boolean).slice(0,2).join(' ');
  const nQty = norm(item.quantity);
  if (!nName || !nQty) return { verified:false, line:'' };
  const lines = String(rawText || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const match = lines.find(line => norm(line).includes(nName) && norm(line).includes(nQty));
  if (!match) return { verified:false, line:'' };
  const cells = match.split('|').map(x => x.trim());
  const qtyCell = cells.length >= 5 ? norm(cells[4]) : '';
  const unitCell = cells.length >= 4 ? norm(cells[3]) : '';
  const verified = qtyCell === nQty && (!item.unit || unitCell.includes(norm(item.unit)) || norm(item.unit).includes(unitCell));
  return { verified, line:match };
}

app.get('/health', async (_req,res) => {
  const dbConfigured = Boolean(process.env.DATABASE_URL);
  const base = { ok:true, service:'so-attp-api', dbConfigured, ocrConfigured:Boolean(process.env.GEMINI_API_KEY), storageConfigured:Boolean(s3) };
  if (!dbConfigured) return res.json({ ...base, readiness:'configuration_required' });
  try {
    const { rows } = await pool.query('select current_database() as db, now() as now');
    res.json({ ...base, readiness:'ready', db:rows[0].db, now:rows[0].now });
  } catch (e) { res.json({ ...base, readiness:'database_unreachable', dbError:String(e.message || e).slice(0,160) }); }
});

app.get('/ready', async (_req,res) => {
  if (!process.env.DATABASE_URL) return res.status(503).json({ ok:false, error:'DATABASE_NOT_CONFIGURED' });
  try { await pool.query('select 1'); return res.json({ok:true}); } catch { return res.status(503).json({ok:false,error:'DATABASE_UNREACHABLE'}); }
});

app.get('/api/bootstrap', async (_req,res) => {
  if (!process.env.DATABASE_URL) return res.status(503).json({ error:'DATABASE_NOT_CONFIGURED', message:'Backend mới đã live; cần gắn DATABASE_URL của Neon trong Render Secrets.' });
  try {
    const [records, inventory, menus] = await Promise.all([
      pool.query('select id, kind, status, source, item_code, fields, warnings, source_image_key, created_at from records order by id desc limit 250'),
      pool.query('select id,name,group_name,received,expiry,lot,supplier,opening_qty,in_qty,out_qty,sample_qty,unit,location,storage,balance,created_at from inventory order by id desc limit 250'),
      pool.query('select id,menu_date,meal,dish,servings,ingredients,created_at from menus order by id desc limit 250'),
    ]);
    res.json({ records:records.rows, inventory:inventory.rows, menus:menus.rows });
  } catch (e) { res.status(500).json({ error:String(e.message || e) }); }
});

app.post('/api/ocr', async (req,res) => {
  const { kind, image } = req.body || {};
  const keys = fieldKeys(kind);
  if (!keys.length || !image?.data || !image?.mimeType) return res.status(400).json({ error:'Thiếu ảnh hoặc loại biểu mẫu' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error:'OCR_AI_NOT_CONFIGURED', message:'Backend mới đã hoạt động nhưng chưa có GEMINI_API_KEY.' });
  if (Buffer.byteLength(image.data, 'base64') > 6 * 1024 * 1024) return res.status(413).json({ error:'Ảnh quá lớn; hãy dùng ảnh dưới 6 MB.' });
  try {
    const isInvoice = kind === '1a' || kind === '1b';
    const imageKey = await storeImage(image.data, image.mimeType, kind);
    const firstPrompt = isInvoice
      ? 'OCR chính xác chứng từ thực phẩm tiếng Việt. Hãy chép phần nhà cung cấp, địa chỉ, ngày, số chứng từ và TOÀN BỘ bảng hàng. Mỗi dòng hàng BẮT BUỘC theo đúng thứ tự: STT | Mã | Tên hàng | ĐVT | Số lượng | Đơn giá | Thành tiền. Không suy đoán chữ/số bị che; dùng ? khi không đọc được.'
      : 'OCR chính xác toàn bộ biểu mẫu ATTP tiếng Việt. Giữ nguyên số, ngày, giờ và nội dung nhìn thấy. Không suy đoán phần thiếu.';
    const first = await gemini(process.env.GEMINI_OCR_MODEL || 'gemini-2.5-flash-lite', {
      contents:[{role:'user',parts:[{text:firstPrompt},{inlineData:{mimeType:image.mimeType,data:image.data}}]}],
      generationConfig:{temperature:0,maxOutputTokens:8192},
    });
    const rawText = jsonText(first).trim();
    const schema = {
      type:'object', additionalProperties:false,
      properties:{
        fields:{type:'array',items:{type:'object',additionalProperties:false,properties:{key:{type:'string'},value:{type:'string'},confidence:{type:'number',minimum:0,maximum:100},evidence:{type:'string'}},required:['key','value','confidence','evidence']}},
        lineItems:{type:'array',items:{type:'object',additionalProperties:false,properties:{code:{type:'string'},name:{type:'string'},unit:{type:'string'},quantity:{type:'string'},expiry:{type:'string'},confidence:{type:'number',minimum:0,maximum:100},kindSuggestion:{type:'string',enum:['1a','1b','review']},reason:{type:'string'}},required:['code','name','unit','quantity','expiry','confidence','kindSuggestion','reason']}}
      }, required:['fields','lineItems']
    };
    const secondPrompt = `Đối chiếu ảnh gốc với OCR THÔ dưới đây và trích dữ liệu. Chỉ trả dữ liệu có bằng chứng. Các key fields hợp lệ: ${keys.join(', ')}. Với hóa đơn, supplier là người bán/nhà cung cấp; quantity chỉ được lấy từ cột Số lượng/SL, tuyệt đối không lấy Đơn giá hoặc Thành tiền. Nếu không chắc nhóm hàng, kindSuggestion=review. Không tự điền HSD nếu chứng từ không có. OCR THÔ:\n${rawText}`;
    const second = await gemini(process.env.GEMINI_VERIFY_MODEL || 'gemini-2.5-flash', {
      contents:[{role:'user',parts:[{text:secondPrompt},{inlineData:{mimeType:image.mimeType,data:image.data}}]}],
      generationConfig:{temperature:0,maxOutputTokens:8192,responseMimeType:'application/json',responseSchema:schema},
    });
    const parsed = safeJson(jsonText(second));
    const rawNorm = norm(rawText);
    const fields = (parsed.fields || []).filter(x => keys.includes(x.key) && String(x.value||'').trim()).map(x => {
      const value = String(x.value || '').trim();
      const evidenced = value.length >= 3 && rawNorm.includes(norm(value));
      return { key:x.key, value, confidence:evidenced ? Math.min(96, Math.max(80, clamp(x.confidence))) : Math.min(90, clamp(x.confidence)), evidence:String(x.evidence||'') };
    });
    const lineItems = (parsed.lineItems || []).filter(x => String(x.name||'').trim()).slice(0,100).map(x => {
      const check = verifyLineAgainstTranscript(x, rawText);
      const model = clamp(x.confidence);
      return {
        code:String(x.code||''), name:String(x.name||''), unit:String(x.unit||''), quantity:String(x.quantity||''), expiry:String(x.expiry||''),
        confidence:check.verified && model >= 95 ? Math.min(97, model) : Math.min(90, model),
        kindSuggestion:['1a','1b'].includes(x.kindSuggestion) ? x.kindSuggestion : 'review',
        columnVerified:check.verified,
        reason:`${String(x.reason||'')}${check.verified ? ' · cột Số lượng đã đối chiếu bằng code' : ' · cần dò lại cột Số lượng'}`,
        evidenceLine:check.line,
      };
    });
    const job = await pool.query('insert into ocr_jobs(kind,status,image_key,provider,model,raw_text,passes,attempts,result,completed_at) values($1,$2,$3,$4,$5,$6,2,2,$7,now()) returning id', [kind, lineItems.some(x=>x.confidence<95)||fields.some(x=>x.confidence<95)?'review':'completed', imageKey, 'google-gemini', `${process.env.GEMINI_OCR_MODEL||'gemini-2.5-flash-lite'}→${process.env.GEMINI_VERIFY_MODEL||'gemini-2.5-flash'}`, rawText, JSON.stringify({fields,lineItems})]);
    const jobId = job.rows[0].id;
    for (let i=0;i<lineItems.length;i++) {
      const x=lineItems[i];
      await pool.query('insert into ocr_line_items(ocr_job_id,line_no,code,name,unit,quantity,expiry,confidence,kind_suggestion,column_verified,reason,evidence) values($1,$2,$3,$4,$5,$6,nullif($7,\'\')::date,$8,$9,$10,$11,$12)', [jobId,i+1,x.code,x.name,x.unit,x.quantity,x.expiry,x.confidence,x.kindSuggestion,x.columnVerified,x.reason,JSON.stringify({line:x.evidenceLine})]);
    }
    res.json({ jobId, fields, lineItems, rawText, imageKey, passes:2 });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error:'OCR_FAILED', message:String(e.message || e).slice(0,500) });
  }
});

app.post('/api/records', async (req,res) => {
  const {kind,fields={},markers=[],rawText='',imageKey=null,ocrJobId=null} = req.body || {};
  if (!fieldKeys(kind).length) return res.status(400).json({error:'Loại biểu mẫu không hợp lệ'});
  const uncertain = Object.entries(fields).filter(([,v]) => v?.value && Number(v?.confidence||0) < 95 && !v?.confirmed).map(([k])=>k);
  const status = uncertain.length ? 'CẦN DÒ LẠI' : 'ĐÃ XÁC MINH';
  const q = await pool.query('insert into records(kind,status,source,fields,markers,raw_text,warnings,source_image_key,ocr_job_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,status,created_at', [kind,status,'neon-rebuild',JSON.stringify(fields),JSON.stringify(markers),rawText,JSON.stringify(uncertain.map(k=>`OCR dưới 95%: ${k}`)),imageKey,ocrJobId]);
  res.json(q.rows[0]);
});

app.post('/api/invoice-records', async (req,res) => {
  const {sharedFields={},lines=[],rawText='',imageKey=null,ocrJobId=null} = req.body || {};
  let saved=0, review=0;
  const client=await pool.connect();
  try {
    await client.query('begin');
    for (const line of lines.slice(0,100)) {
      if (!line?.name || !['1a','1b'].includes(line.kind)) continue;
      const c=clamp(line.confidence);
      const fields={...sharedFields,name:{value:line.name,confidence:c,confirmed:c>=95},weight:{value:line.quantity||'',confidence:c,confirmed:c>=95},unit:{value:line.unit||'',confidence:c,confirmed:c>=95}};
      if (line.kind==='1b' && line.expiry) fields.expiry={value:line.expiry,confidence:c,confirmed:c>=95};
      const uncertain=Object.entries(fields).some(([,v])=>v?.value && Number(v?.confidence||0)<95 && !v?.confirmed);
      const status=uncertain?'CẦN DÒ LẠI':'ĐÃ XÁC MINH';
      if (status==='CẦN DÒ LẠI') review++;
      await client.query('insert into records(kind,status,source,item_code,fields,raw_text,warnings,source_image_key,ocr_job_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[line.kind,status,'multi-line-invoice',line.code||'',JSON.stringify(fields),rawText,JSON.stringify(uncertain?['Cần dò lại OCR']:[]),imageKey,ocrJobId]);
      saved++;
    }
    await client.query('commit');
    res.json({saved,review});
  } catch(e){ await client.query('rollback'); res.status(500).json({error:String(e.message||e)}); }
  finally{ client.release(); }
});

app.post('/api/inventory', async (req,res) => {
  const x=req.body||{};
  if (!x.name || !x.expiry || Number(x.inQty)<=0) return res.status(400).json({error:'Thiếu tên, HSD hoặc số lượng nhập'});
  const q=await pool.query(`insert into inventory(name,group_name,received,expiry,lot,supplier,opening_qty,in_qty,out_qty,sample_qty,unit,location,storage,payload)
    values($1,$2,nullif($3,'')::date,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,[x.name,x.group||'',x.received||'',x.expiry,x.lot||'',x.supplier||'',Number(x.openingQty||0),Number(x.inQty||0),Number(x.outQty||0),Number(x.sampleQty||0),x.unit||'',x.location||'',x.storage||'',JSON.stringify(x)]);
  res.json(q.rows[0]);
});

app.post('/api/menu', async (req,res) => {
  const items=(req.body?.items||[]).filter(x=>x?.dish).slice(0,100);
  if (!items.length) return res.status(400).json({error:'Không có món'});
  const client=await pool.connect(); const ids=[];
  try { await client.query('begin'); for(const x of items){ const q=await client.query('insert into menus(menu_date,meal,dish,servings,ingredients,payload) values($1,$2,$3,$4,$5,$6) returning id',[x.date,x.meal,x.dish,Number(x.servings||0),x.ingredients||'',JSON.stringify(x)]); ids.push(q.rows[0].id); } await client.query('commit'); res.json({ids}); }
  catch(e){ await client.query('rollback'); res.status(500).json({error:String(e.message||e)}); } finally{ client.release(); }
});

app.get('/api/report', async (req,res) => {
  const period=['today','week','month'].includes(req.query.period)?req.query.period:'today';
  const interval=period==='month'?'1 month':period==='week'?'7 days':'1 day';
  const q=await pool.query(`select count(*) filter (where kind in ('1a','1b'))::int step1, count(*) filter(where kind='2')::int step2, count(*) filter(where kind='3')::int step3, count(*) filter(where kind='sample')::int samples, count(*) filter(where status='CẦN DÒ LẠI')::int needs from records where created_at >= now() - $1::interval`,[interval]);
  const inv=await pool.query(`select count(*) filter(where expiry < current_date)::int expired, count(*) filter(where expiry between current_date and current_date+7)::int expiring from inventory`);
  res.json({period,...q.rows[0],...inv.rows[0]});
});

app.use((err,_req,res,_next)=>res.status(500).json({error:String(err.message||err)}));
app.listen(port,()=>console.log(`ATTP API listening on ${port}`));
