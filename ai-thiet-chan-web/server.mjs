import express from 'express';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { KNOWLEDGE_VERSION, KNOWLEDGE_SOURCES, TONGUE_KNOWLEDGE } from './knowledge.mjs';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const VERSION = '2.4.0';
const BUILD = process.env.RENDER_GIT_COMMIT || 'local';
const AI_RATE_LIMIT_WINDOW_MS = Math.max(60_000, Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 600_000));
const AI_RATE_LIMIT_MAX = Math.max(1, Number(process.env.AI_RATE_LIMIT_MAX || 30));
const CASE_STORE_URL = process.env.SUPABASE_URL || 'https://gzmpnsrwqjpsbklyflqr.supabase.co';
const CASE_STORE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Y4hMhXROZ-aVgWoaQ5fFKQ_ZAcXuIzG';
let caseStoreReady = false;

const OPEN_SOURCE_REFERENCES = [
  { name:'TongueDiagnosis.AI', repo:'https://github.com/TonguePicture-SKaRD/TongueDiagnosis', license:'AGPL-3.0', use:'architecture-reference-only', note:'Tham chiếu pipeline định vị lưỡi → phân đoạn → phân loại đặc trưng → LLM; không sao chép mã nguồn hoặc trọng số AGPL.' },
  { name:'OpenCV', repo:'https://github.com/opencv/opencv', license:'Apache-2.0', use:'image-quality-reference', note:'Tham chiếu kỹ thuật QC ảnh: độ nét, phơi sáng, tương phản và tiền xử lý.' },
  { name:'Segment Anything', repo:'https://github.com/facebookresearch/segment-anything', license:'Apache-2.0', use:'segmentation-reference', note:'Tham chiếu kiến trúc tạo mask để chuẩn bị bước tách vùng lưỡi trước phân loại.' },
  { name:'ONNX Runtime', repo:'https://github.com/microsoft/onnxruntime', license:'MIT', use:'inference-runtime-reference', note:'Tham chiếu runtime suy luận đa nền tảng cho mô hình ONNX.' },
  { name:'TensorFlow.js', repo:'https://github.com/tensorflow/tfjs', license:'Apache-2.0', use:'browser-ml-reference', note:'Tham chiếu huấn luyện/chuyển đổi/chạy mô hình trong trình duyệt và định dạng mẫu ML.' }
];

app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  if(req.path.startsWith('/api/')) res.setHeader('Cache-Control','no-store');
  next();
});

const rateBuckets = new Map();
function requestIdentity(req){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  return (forwarded||req.socket?.remoteAddress||'unknown').slice(0,96);
}
function aiRateLimit(req,res,next){
  const now=Date.now(); const key=requestIdentity(req); let bucket=rateBuckets.get(key);
  if(!bucket||now-bucket.startedAt>=AI_RATE_LIMIT_WINDOW_MS){bucket={startedAt:now,count:0};rateBuckets.set(key,bucket);}
  bucket.count+=1;
  if(bucket.count>AI_RATE_LIMIT_MAX){
    const retryAfter=Math.max(1,Math.ceil((bucket.startedAt+AI_RATE_LIMIT_WINDOW_MS-now)/1000));
    res.setHeader('Retry-After',String(retryAfter));
    return res.status(429).json({error:'AI_RATE_LIMITED',retryAfter});
  }
  next();
}
const cleanupTimer=setInterval(()=>{
  const cutoff=Date.now()-AI_RATE_LIMIT_WINDOW_MS*2;
  for(const [key,bucket] of rateBuckets) if(bucket.startedAt<cutoff) rateBuckets.delete(key);
},AI_RATE_LIMIT_WINDOW_MS);
cleanupTimer.unref?.();

function apiKey(){ return String(process.env.GEMINI_API_KEY||'').trim(); }
function textFromGemini(data){ return (data?.candidates?.[0]?.content?.parts||[]).map(p=>p?.text||'').join('').trim(); }
async function geminiGenerate(key,contents,generationConfig={}){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents,generationConfig:{temperature:0.15,...generationConfig}})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const err=new Error(data?.error?.message||`Gemini HTTP ${response.status}`);err.status=response.status;throw err;}
  return textFromGemini(data);
}
function parseJsonText(text){
  const clean=text.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```$/i,'').trim();
  try{return JSON.parse(clean);}catch{}
  const first=clean.indexOf('{'),last=clean.lastIndexOf('}');
  if(first>=0&&last>first) return JSON.parse(clean.slice(first,last+1));
  throw new Error('AI response is not valid JSON');
}
function clampConfidence(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;}
function mlFeatureVector(out,qc){
  return {
    schemaVersion:'tongue-feature-vector-v1',knowledgeVersion:KNOWLEDGE_VERSION,
    visual:{tongueColor:out.tongueColor||'',shape:out.shape||'',coatingColor:out.coatingColor||'',coatingThickness:out.coatingThickness||'',coatingTexture:out.coatingTexture||'',moisture:out.moisture||'',fissures:out.fissures||'',toothmarks:out.toothmarks||'',pricklesSpots:out.pricklesSpots||'',stasisMarks:out.stasisMarks||''},
    validity:out.visualValidity||{},qc:qc||{},confidence:out.confidence
  };
}
function normalizeAnalysis(analysis,qc){
  const out=analysis&&typeof analysis==='object'?analysis:{};
  out.confidence=clampConfidence(out.confidence);
  out.knowledgeVersion=KNOWLEDGE_VERSION;
  out.knowledgeSources=KNOWLEDGE_SOURCES;
  if(!out.visualValidity||typeof out.visualValidity!=='object') out.visualValidity={tongueVisible:null,framing:'unknown',occlusion:'unknown',colorReliability:'unknown'};
  if(!out.theoryAssessment||typeof out.theoryAssessment!=='object') out.theoryAssessment={generalSignals:[],stomachPatternSignals:[],cannotConclude:[]};
  for(const key of ['generalSignals','stomachPatternSignals','cannotConclude']) if(!Array.isArray(out.theoryAssessment[key])) out.theoryAssessment[key]=[];
  const qcFactor=qc?.grade==='good'?1:qc?.grade==='fair'?0.72:0.35;
  out.confidence=Number((out.confidence*qcFactor).toFixed(3));
  if(out.visualValidity.tongueVisible===false){
    out.theoryAssessment.stomachPatternSignals=[]; out.theoryAssessment.generalSignals=[]; out.confidence=Math.min(out.confidence,0.2);
    const note='Không xác nhận được vùng lưỡi rõ ràng trong ảnh.'; if(!out.theoryAssessment.cannotConclude.includes(note)) out.theoryAssessment.cannotConclude.push(note);
  }
  if(qc?.grade==='poor'){
    out.theoryAssessment.stomachPatternSignals=[]; out.confidence=Math.min(out.confidence,0.25);
    const note='Ảnh QC kém: không xếp thể Vị quản từ ảnh này.'; if(!out.theoryAssessment.cannotConclude.includes(note)) out.theoryAssessment.cannotConclude.push(note);
  }else if(qc?.grade==='fair') out.confidence=Math.min(out.confidence,0.62);
  out.ml={pipeline:['capture-qc','visual-validity','tongue-feature-extraction','knowledge-mapping'],featureVector:mlFeatureVector(out,qc),storage:'automatic-server-training-store'};
  return out;
}

async function supabaseRpc(name,payload){
  const response=await fetch(`${CASE_STORE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{'content-type':'application/json','apikey':CASE_STORE_KEY,'authorization':`Bearer ${CASE_STORE_KEY}`},
    body:JSON.stringify(payload)
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(data?.message||data?.hint||`Case store HTTP ${response.status}`);
  return data;
}
async function ensureCaseStoreSecret(){
  const token=apiKey();
  if(!token){caseStoreReady=false;return false;}
  try{
    const ok=await supabaseRpc('ai_thiet_chan_register_secret',{p_token:token});
    caseStoreReady=Boolean(ok);
  }catch(err){caseStoreReady=false;console.error('case_store_register_error',err?.message||err);}
  return caseStoreReady;
}
function imageHash(image){
  const base64=String(image||'').includes(',')?String(image).split(',').pop():String(image||'');
  return createHash('sha256').update(base64).digest('hex');
}
async function storeTrainingCase({image,mimeType,qc,analysis}){
  if(!caseStoreReady) await ensureCaseStoreSecret();
  if(!caseStoreReady) throw new Error('CASE_STORE_NOT_READY');
  const payload={
    p_token:apiKey(),p_image_hash:imageHash(image),p_image_data_url:image,p_mime_type:mimeType||'image/jpeg',
    p_qc:qc||{},p_analysis:analysis||{},p_feature_vector:analysis?.ml?.featureVector||{},p_model:MODEL,p_knowledge_version:KNOWLEDGE_VERSION
  };
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{return await supabaseRpc('ai_thiet_chan_store_case',payload);}catch(err){lastError=err;if(attempt<2) await new Promise(r=>setTimeout(r,500*(attempt+1)));}
  }
  throw lastError;
}
async function listTrainingCases(limit=30){
  if(!caseStoreReady) await ensureCaseStoreSecret();
  if(!caseStoreReady) throw new Error('CASE_STORE_NOT_READY');
  return supabaseRpc('ai_thiet_chan_list_cases',{p_token:apiKey(),p_limit:Math.min(100,Math.max(1,Number(limit)||30))});
}

app.get('/api/health',(req,res)=>res.json({
  ok:true,app:'A.I Thiệt Chẩn',architecture:'independent-web',legacyPlatform:false,version:VERSION,build:BUILD.slice(0,12),
  providerConfigured:Boolean(apiKey()),sharedProvider:true,clientSuppliedKeyAccepted:false,model:MODEL,knowledgeVersion:KNOWLEDGE_VERSION,
  knowledgeSources:KNOWLEDGE_SOURCES.length,openSourceReferences:OPEN_SOURCE_REFERENCES.length,
  caseCollection:{mode:'automatic',history:true,deduplicate:'sha256',storeReady:caseStoreReady},
  aiRateLimit:{windowMs:AI_RATE_LIMIT_WINDOW_MS,max:AI_RATE_LIMIT_MAX},time:new Date().toISOString()
}));
app.get('/api/sources',(req,res)=>res.json({ok:true,version:VERSION,references:OPEN_SOURCE_REFERENCES}));
app.get('/api/cases',async(req,res)=>{
  try{
    if(!apiKey()) return res.status(428).json({error:'AI_PROVIDER_NOT_CONFIGURED'});
    const cases=await listTrainingCases(req.query.limit||30);
    return res.json({ok:true,cases:Array.isArray(cases)?cases:[],collectionMode:'automatic'});
  }catch(err){console.error('case_history_error',err?.message||err);return res.status(503).json({error:'CASE_HISTORY_UNAVAILABLE'});}
});

app.post('/api/analyze',aiRateLimit,async(req,res)=>{
  try{
    const key=apiKey(); if(!key) return res.status(428).json({error:'AI_PROVIDER_NOT_CONFIGURED'});
    const {image,mimeType='image/jpeg',qc={}}=req.body||{};
    if(typeof image!=='string'||image.length<100) return res.status(400).json({error:'IMAGE_REQUIRED'});
    const base64=image.includes(',')?image.split(',').pop():image;
    if(base64.length>14_000_000) return res.status(413).json({error:'IMAGE_TOO_LARGE'});
    const prompt=`Bạn là bộ phân tích thiệt tượng YHCT của A.I Thiệt Chẩn. Hãy làm theo pipeline nhiều tầng: (1) xác nhận ảnh có vùng lưỡi dùng được; (2) mô tả đặc điểm thị giác; (3) đối chiếu hệ tri thức. Chỉ dùng hệ tri thức bên dưới; tuyệt đối không tự bịa triệu chứng, mạch, bệnh danh, nguyên nhân hay điều trị. Đây là công cụ học tập/tham khảo, không phải chẩn đoán xác định.\n\nQC ẢNH: ${JSON.stringify(qc)}\nHỆ TRI THỨC ${KNOWLEDGE_VERSION}:\n${TONGUE_KNOWLEDGE}\n\nYÊU CẦU NHẬN DIỆN:\n- Trước tiên đánh giá visualValidity: có thực sự thấy lưỡi hay không, mức che khuất, bố cục và độ tin cậy màu.\n- Quan sát màu chất lưỡi, hình thể, màu rêu, dày/mỏng, nhuận/khô, nhầy/vữa/tróc, nứt, hằn răng, điểm/gai, ban/điểm ứ nếu thấy.\n- Chỉ đánh giá tĩnh mạch dưới lưỡi khi ảnh thật sự cho thấy mặt dưới lưỡi; nếu không, ghi \"không thấy/không đánh giá\".\n- Không suy trạng thái vận động của lưỡi từ ảnh tĩnh.\n- Nếu ảnh không đủ chất lượng hoặc màu bị sai lệch, giảm confidence và nêu rõ giới hạn.\n- stomachPatternSignals chỉ là \"tín hiệu phù hợp thiệt tượng\", không phải chẩn đoán thể bệnh. Mỗi tín hiệu phải có bằng chứng nhìn thấy và phần dữ kiện còn thiếu để kết luận.\n\nTrả về DUY NHẤT JSON hợp lệ theo schema:\n{\n  \"quality\":\"good|fair|poor\",\n  \"visualValidity\":{\"tongueVisible\":true,\"framing\":\"good|fair|poor\",\"occlusion\":\"none|partial|major\",\"colorReliability\":\"good|fair|poor\"},\n  \"tongueColor\":\"...\",\"shape\":\"...\",\"coatingColor\":\"...\",\"coatingThickness\":\"...\",\"coatingTexture\":\"...\",\"moisture\":\"...\",\"fissures\":\"...\",\"toothmarks\":\"...\",\"pricklesSpots\":\"...\",\"stasisMarks\":\"...\",\n  \"sublingualVeins\":{\"visible\":false,\"description\":\"...\"},\"otherVisibleFeatures\":[\"...\"],\n  \"theoryAssessment\":{\"generalSignals\":[{\"label\":\"...\",\"evidence\":\"...\",\"rule\":\"...\",\"confidence\":0.0}],\"stomachPatternSignals\":[{\"label\":\"Hàn tà khách Vị|Ẩm thực thương Vị|Can khí phạm Vị|Ứ huyết đình trệ|Thấp nhiệt trung trở|Vị âm khuy hư|Tỳ Vị hư hàn\",\"evidence\":\"...\",\"missingForConclusion\":\"...\",\"confidence\":0.0}],\"cannotConclude\":[\"...\"]},\n  \"confidence\":0.0,\"summary\":\"...\",\"limitations\":[\"...\"]\n}\nconfidence từ 0 đến 1.`;
    const text=await geminiGenerate(key,[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:mimeType,data:base64}}]}],{responseMimeType:'application/json',temperature:0.05});
    const analysis=normalizeAnalysis(parseJsonText(text),qc);
    let collection={ok:false,stored:false,duplicate:false};
    try{const saved=await storeTrainingCase({image,mimeType,qc,analysis});collection={ok:true,stored:Boolean(saved?.stored),duplicate:Boolean(saved?.duplicate),caseId:saved?.id||null};}
    catch(err){console.error('case_store_error',err?.message||err);collection={ok:false,error:'CASE_STORE_FAILED'};}
    return res.json({ok:true,analysis,model:MODEL,knowledgeVersion:KNOWLEDGE_VERSION,collection});
  }catch(err){console.error('analyze_error',err?.message||err);return res.status(err?.status===429?429:502).json({error:'ANALYZE_FAILED',message:err?.message||'Unknown error'});}
});

app.post('/api/chat',aiRateLimit,async(req,res)=>{
  try{
    const key=apiKey(); if(!key) return res.status(428).json({error:'AI_PROVIDER_NOT_CONFIGURED'});
    const {analysis,message}=req.body||{}; if(!message||typeof message!=='string') return res.status(400).json({error:'MESSAGE_REQUIRED'});
    const context=analysis?JSON.stringify(analysis):'Chưa có kết quả phân tích hình lưỡi.';
    const prompt=`Bạn là chatbot tư vấn nhanh của A.I Thiệt Chẩn. Chỉ dùng kết quả quan sát hiện tại và hệ tri thức được cung cấp. Không tự thêm triệu chứng, mạch, chẩn đoán bệnh hay kê đơn. Nếu người dùng hỏi về một thể YHCT, hãy phân biệt rõ dấu nào nhìn thấy trên ảnh và dấu nào còn thiếu trong tứ chẩn.\n\nHỆ TRI THỨC ${KNOWLEDGE_VERSION}:\n${TONGUE_KNOWLEDGE}\n\nBối cảnh phân tích hình ảnh: ${context}\nCâu hỏi người dùng: ${message}\nTrả lời ngắn gọn bằng tiếng Việt theo hướng học tập/tham khảo. Nếu có triệu chứng cấp cứu/nặng do người dùng mô tả, khuyên khám trực tiếp.`;
    const reply=await geminiGenerate(key,[{role:'user',parts:[{text:prompt}]}],{temperature:0.15});
    return res.json({ok:true,reply,model:MODEL,knowledgeVersion:KNOWLEDGE_VERSION});
  }catch(err){console.error('chat_error',err?.message||err);return res.status(err?.status===429?429:502).json({error:'CHAT_FAILED',message:err?.message||'Unknown error'});}
});

app.post('/api/report',aiRateLimit,async(req,res)=>{
  try{
    const key=apiKey(); if(!key) return res.status(428).json({error:'AI_PROVIDER_NOT_CONFIGURED'});
    const {analysis,qc}=req.body||{}; if(!analysis) return res.status(400).json({error:'ANALYSIS_REQUIRED'});
    const prompt=`Tạo báo cáo tổng kết ca ngắn gọn bằng tiếng Việt từ dữ liệu dưới đây. Báo cáo phải tách rõ: (1) chất lượng ảnh; (2) đặc điểm nhìn thấy; (3) đối chiếu lý thuyết thiệt chẩn; (4) tín hiệu Vị quản nếu có và dữ kiện còn thiếu; (5) giới hạn. Không thêm bệnh danh, triệu chứng, mạch, điều trị hay phương thuốc không có trong đầu vào. Không biến tín hiệu thiệt tượng thành chẩn đoán xác định.\nQC: ${JSON.stringify(qc||{})}\nPhân tích: ${JSON.stringify(analysis)}\nKnowledge: ${KNOWLEDGE_VERSION}`;
    const report=await geminiGenerate(key,[{role:'user',parts:[{text:prompt}]}],{temperature:0.05});
    return res.json({ok:true,report,model:MODEL,knowledgeVersion:KNOWLEDGE_VERSION});
  }catch(err){console.error('report_error',err?.message||err);return res.status(err?.status===429?429:502).json({error:'REPORT_FAILED',message:err?.message||'Unknown error'});}
});

app.use(express.static(path.join(__dirname,'public'),{maxAge:0,etag:true,setHeaders:(res,filePath)=>{if(/\.(html|js|css|webmanifest|svg)$/i.test(filePath)) res.setHeader('Cache-Control','no-cache');}}));
app.use((req,res)=>{res.setHeader('Cache-Control','no-cache');res.sendFile(path.join(__dirname,'public','index.html'));});

await ensureCaseStoreSecret();
app.listen(PORT,'0.0.0.0',()=>console.log(`A.I Thiệt Chẩn web v${VERSION} listening on ${PORT} · sharedGemini=${Boolean(apiKey())} · autoTrainingStore=${caseStoreReady}`));
