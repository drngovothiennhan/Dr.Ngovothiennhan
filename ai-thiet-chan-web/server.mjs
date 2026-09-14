import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWLEDGE_VERSION, KNOWLEDGE_SOURCES, TONGUE_KNOWLEDGE } from './knowledge.mjs';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const VERSION = '2.2.0';
const BUILD = process.env.RENDER_GIT_COMMIT || 'local';

app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

function apiKey(req) {
  const headerKey = req.get('x-gemini-key');
  return process.env.GEMINI_API_KEY || (headerKey && headerKey.trim()) || '';
}

function textFromGemini(data) {
  return (data?.candidates?.[0]?.content?.parts || []).map(p => p?.text || '').join('').trim();
}

async function geminiGenerate(key, contents, generationConfig = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.15, ...generationConfig } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Gemini HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return textFromGemini(data);
}

function parseJsonText(text) {
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(clean); } catch {}
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(clean.slice(first, last + 1));
  throw new Error('AI response is not valid JSON');
}

function clampConfidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function normalizeAnalysis(analysis, qc) {
  const out = analysis && typeof analysis === 'object' ? analysis : {};
  out.confidence = clampConfidence(out.confidence);
  out.knowledgeVersion = KNOWLEDGE_VERSION;
  out.knowledgeSources = KNOWLEDGE_SOURCES;
  if (!out.theoryAssessment || typeof out.theoryAssessment !== 'object') {
    out.theoryAssessment = { generalSignals: [], stomachPatternSignals: [], cannotConclude: [] };
  }
  for (const key of ['generalSignals', 'stomachPatternSignals', 'cannotConclude']) {
    if (!Array.isArray(out.theoryAssessment[key])) out.theoryAssessment[key] = [];
  }
  if (qc?.grade === 'poor') {
    out.theoryAssessment.stomachPatternSignals = [];
    out.confidence = Math.min(out.confidence, 0.35);
    const note = 'Ảnh QC kém: không xếp thể Vị quản từ ảnh này.';
    if (!out.theoryAssessment.cannotConclude.includes(note)) out.theoryAssessment.cannotConclude.push(note);
  } else if (qc?.grade === 'fair') {
    out.confidence = Math.min(out.confidence, 0.7);
  }
  return out;
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'A.I Thiệt Chẩn',
    architecture: 'independent-web',
    legacyPlatform: false,
    version: VERSION,
    build: BUILD.slice(0, 12),
    providerConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: MODEL,
    knowledgeVersion: KNOWLEDGE_VERSION,
    knowledgeSources: KNOWLEDGE_SOURCES.length,
    time: new Date().toISOString()
  });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const key = apiKey(req);
    if (!key) return res.status(428).json({ error: 'AI_PROVIDER_NOT_CONFIGURED' });
    const { image, mimeType = 'image/jpeg', qc = {} } = req.body || {};
    if (typeof image !== 'string' || image.length < 100) return res.status(400).json({ error: 'IMAGE_REQUIRED' });
    const base64 = image.includes(',') ? image.split(',').pop() : image;
    if (base64.length > 14_000_000) return res.status(413).json({ error: 'IMAGE_TOO_LARGE' });

    const prompt = `Bạn là bộ phân tích thiệt tượng YHCT của A.I Thiệt Chẩn. Hãy tách rõ (A) mô tả thị giác thực sự nhìn thấy và (B) đối chiếu lý thuyết. Chỉ dùng hệ tri thức bên dưới; tuyệt đối không tự bịa triệu chứng, mạch, bệnh danh, nguyên nhân hay điều trị. Đây là công cụ học tập/tham khảo, không phải chẩn đoán xác định.

QC ẢNH: ${JSON.stringify(qc)}
HỆ TRI THỨC ${KNOWLEDGE_VERSION}:
${TONGUE_KNOWLEDGE}

YÊU CẦU NHẬN DIỆN:
- Quan sát màu chất lưỡi, hình thể, màu rêu, dày/mỏng, nhuận/khô, nhầy/vữa/tróc, nứt, hằn răng, điểm/gai, ban/điểm ứ nếu thấy.
- Chỉ đánh giá tĩnh mạch dưới lưỡi khi ảnh thật sự cho thấy mặt dưới lưỡi; nếu không, ghi "không thấy/không đánh giá".
- Không suy trạng thái vận động của lưỡi từ ảnh tĩnh.
- Nếu ảnh không đủ chất lượng hoặc màu bị sai lệch, giảm confidence và nêu rõ giới hạn.
- stomachPatternSignals chỉ là "tín hiệu phù hợp thiệt tượng", không phải chẩn đoán thể bệnh. Mỗi tín hiệu phải có bằng chứng nhìn thấy và phần dữ kiện còn thiếu để kết luận.

Trả về DUY NHẤT JSON hợp lệ theo schema:
{
  "quality":"good|fair|poor",
  "tongueColor":"...",
  "shape":"...",
  "coatingColor":"...",
  "coatingThickness":"...",
  "coatingTexture":"...",
  "moisture":"...",
  "fissures":"...",
  "toothmarks":"...",
  "pricklesSpots":"...",
  "stasisMarks":"...",
  "sublingualVeins":{"visible":false,"description":"..."},
  "otherVisibleFeatures":["..."],
  "theoryAssessment":{
    "generalSignals":[{"label":"...","evidence":"...","rule":"...","confidence":0.0}],
    "stomachPatternSignals":[{"label":"Hàn tà khách Vị|Ẩm thực thương Vị|Can khí phạm Vị|Ứ huyết đình trệ|Thấp nhiệt trung trở|Vị âm khuy hư|Tỳ Vị hư hàn","evidence":"...","missingForConclusion":"...","confidence":0.0}],
    "cannotConclude":["..."]
  },
  "confidence":0.0,
  "summary":"...",
  "limitations":["..."]
}
confidence từ 0 đến 1.`;

    const text = await geminiGenerate(
      key,
      [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
      { responseMimeType: 'application/json', temperature: 0.05 }
    );
    const analysis = normalizeAnalysis(parseJsonText(text), qc);
    return res.json({ ok: true, analysis, model: MODEL, knowledgeVersion: KNOWLEDGE_VERSION });
  } catch (err) {
    console.error('analyze_error', err?.message || err);
    return res.status(err?.status === 429 ? 429 : 502).json({ error: 'ANALYZE_FAILED', message: err?.message || 'Unknown error' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const key = apiKey(req);
    if (!key) return res.status(428).json({ error: 'AI_PROVIDER_NOT_CONFIGURED' });
    const { analysis, message } = req.body || {};
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'MESSAGE_REQUIRED' });
    const context = analysis ? JSON.stringify(analysis) : 'Chưa có kết quả phân tích hình lưỡi.';
    const prompt = `Bạn là chatbot tư vấn nhanh của A.I Thiệt Chẩn. Chỉ dùng kết quả quan sát hiện tại và hệ tri thức được cung cấp. Không tự thêm triệu chứng, mạch, chẩn đoán bệnh hay kê đơn. Nếu người dùng hỏi về một thể YHCT, hãy phân biệt rõ dấu nào nhìn thấy trên ảnh và dấu nào còn thiếu trong tứ chẩn.

HỆ TRI THỨC ${KNOWLEDGE_VERSION}:
${TONGUE_KNOWLEDGE}

Bối cảnh phân tích hình ảnh: ${context}
Câu hỏi người dùng: ${message}
Trả lời ngắn gọn bằng tiếng Việt theo hướng học tập/tham khảo. Nếu có triệu chứng cấp cứu/nặng do người dùng mô tả, khuyên khám trực tiếp.`;
    const reply = await geminiGenerate(key, [{ role: 'user', parts: [{ text: prompt }] }], { temperature: 0.15 });
    return res.json({ ok: true, reply, model: MODEL, knowledgeVersion: KNOWLEDGE_VERSION });
  } catch (err) {
    console.error('chat_error', err?.message || err);
    return res.status(err?.status === 429 ? 429 : 502).json({ error: 'CHAT_FAILED', message: err?.message || 'Unknown error' });
  }
});

app.post('/api/report', async (req, res) => {
  try {
    const key = apiKey(req);
    if (!key) return res.status(428).json({ error: 'AI_PROVIDER_NOT_CONFIGURED' });
    const { analysis, qc } = req.body || {};
    if (!analysis) return res.status(400).json({ error: 'ANALYSIS_REQUIRED' });
    const prompt = `Tạo báo cáo tổng kết ca ngắn gọn bằng tiếng Việt từ dữ liệu dưới đây. Báo cáo phải tách rõ: (1) chất lượng ảnh; (2) đặc điểm nhìn thấy; (3) đối chiếu lý thuyết thiệt chẩn; (4) tín hiệu Vị quản nếu có và dữ kiện còn thiếu; (5) giới hạn. Không thêm bệnh danh, triệu chứng, mạch, điều trị hay phương thuốc không có trong đầu vào. Không biến tín hiệu thiệt tượng thành chẩn đoán xác định.
QC: ${JSON.stringify(qc || {})}
Phân tích: ${JSON.stringify(analysis)}
Knowledge: ${KNOWLEDGE_VERSION}`;
    const report = await geminiGenerate(key, [{ role: 'user', parts: [{ text: prompt }] }], { temperature: 0.05 });
    return res.json({ ok: true, report, model: MODEL, knowledgeVersion: KNOWLEDGE_VERSION });
  } catch (err) {
    console.error('report_error', err?.message || err);
    return res.status(err?.status === 429 ? 429 : 502).json({ error: 'REPORT_FAILED', message: err?.message || 'Unknown error' });
  }
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: true,
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css|webmanifest|svg)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  }
}));
app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`A.I Thiệt Chẩn web v${VERSION} listening on ${PORT}`));
