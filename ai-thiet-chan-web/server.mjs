import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
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
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.2, ...generationConfig } })
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

app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'A.I Thiệt Chẩn', architecture: 'independent-web', providerConfigured: Boolean(process.env.GEMINI_API_KEY), model: MODEL, time: new Date().toISOString() });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const key = apiKey(req);
    if (!key) return res.status(428).json({ error: 'AI_PROVIDER_NOT_CONFIGURED' });
    const { image, mimeType = 'image/jpeg', qc = {} } = req.body || {};
    if (typeof image !== 'string' || image.length < 100) return res.status(400).json({ error: 'IMAGE_REQUIRED' });
    const base64 = image.includes(',') ? image.split(',').pop() : image;
    if (base64.length > 14_000_000) return res.status(413).json({ error: 'IMAGE_TOO_LARGE' });
    const prompt = `Bạn là trợ lý phân tích hình ảnh lưỡi phục vụ học tập Y học cổ truyền. Chỉ mô tả đặc điểm nhìn thấy trong ảnh, không chẩn đoán bệnh, không khẳng định tạng phủ hay kê đơn. Nếu ảnh không đủ chất lượng phải nói rõ. QC đầu vào: ${JSON.stringify(qc)}. Trả về DUY NHẤT JSON hợp lệ theo schema: {"quality":"good|fair|poor","tongueColor":"...","shape":"...","coatingColor":"...","coatingThickness":"...","moisture":"...","fissures":"...","toothmarks":"...","otherVisibleFeatures":["..."],"confidence":0.0,"summary":"...","limitations":["..."]}. confidence từ 0 đến 1.`;
    const text = await geminiGenerate(key, [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }], { responseMimeType: 'application/json' });
    const analysis = parseJsonText(text);
    return res.json({ ok: true, analysis, model: MODEL });
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
    const prompt = `Bạn là chatbot tư vấn nhanh của A.I Thiệt Chẩn. Bối cảnh phân tích hình ảnh: ${context}. Câu hỏi người dùng: ${message}. Trả lời ngắn gọn bằng tiếng Việt, giải thích theo hướng học tập/tham khảo. Không chẩn đoán xác định, không kê đơn. Nếu có dấu hiệu cấp cứu hoặc triệu chứng nặng được người dùng mô tả, khuyên đi khám trực tiếp.`;
    const reply = await geminiGenerate(key, [{ role: 'user', parts: [{ text: prompt }] }]);
    return res.json({ ok: true, reply, model: MODEL });
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
    const prompt = `Tạo báo cáo tổng kết ca ngắn gọn bằng tiếng Việt từ dữ liệu sau. Đây là báo cáo mô tả hình ảnh phục vụ tham khảo/học tập, không phải chẩn đoán y khoa. QC: ${JSON.stringify(qc || {})}. Phân tích: ${JSON.stringify(analysis)}. Bố cục 4 đoạn: Chất lượng ảnh; Đặc điểm lưỡi quan sát được; Tóm tắt; Giới hạn và khuyến nghị theo dõi. Không thêm dữ liệu không có trong đầu vào.`;
    const report = await geminiGenerate(key, [{ role: 'user', parts: [{ text: prompt }] }], { temperature: 0.1 });
    return res.json({ ok: true, report, model: MODEL });
  } catch (err) {
    console.error('report_error', err?.message || err);
    return res.status(502).json({ error: 'REPORT_FAILED', message: err?.message || 'Unknown error' });
  }
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m', etag: true }));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`A.I Thiệt Chẩn web listening on ${PORT}`));
