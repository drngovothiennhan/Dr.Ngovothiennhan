import { createAuthClient } from 'https://esm.sh/@neondatabase/neon-js@0.7.0-beta/auth?bundle';

const API = window.location.origin;
const AUTH_URL = window.location.origin + '/auth';
const authClient = createAuthClient(AUTH_URL, { fetchOptions: { credentials: 'include' } });

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let state = { records: [], inventory: [], menus: [], ocr: null, user: null };
let signUpMode = false;
let selectedImageFile = null;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3500);
}
function fmt(value) {
  return value ? new Date(value).toLocaleString('vi-VN') : '—';
}
async function api(path, options = {}, authenticated = true) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(API + path, {
    ...options,
    headers,
    credentials: 'include'
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && authenticated) {
    await showLoggedOut();
    throw new Error('Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.');
  }
  if (!response.ok) throw new Error(data.message || data.error || ('HTTP ' + response.status));
  return data;
}

async function health() {
  try {
    const d = await api('/health', {}, false);
    const bits = [
      d.dbConfigured ? 'DB' : '',
      d.storageConfigured ? 'Storage' : '',
      d.authConfigured ? 'Auth' : '',
      d.aiOperational ? 'AI' : (d.localFallback ? 'OCR local' : '')
    ].filter(Boolean);
    $('#health').textContent = bits.length ? bits.join(' + ') + ' sẵn sàng' : 'API đang cấu hình';
  } catch {
    $('#health').textContent = 'Mất kết nối Neon';
  }
}

async function showLoggedIn(user) {
  state.user = user || null;
  $('#authGate').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  $('#signOutBtn').classList.remove('hidden');
  $('#signOutBtn').textContent = user?.email ? ('Đăng xuất · ' + user.email) : 'Đăng xuất';
  await load();
}
async function showLoggedOut() {
  state.user = null;
  $('#appShell').classList.add('hidden');
  $('#signOutBtn').classList.add('hidden');
  $('#authGate').classList.remove('hidden');
}
async function restoreSession() {
  try {
    const { data } = await authClient.getSession();
    if (data?.session && data?.user) return showLoggedIn(data.user);
  } catch {}
  return showLoggedOut();
}
function renderAuthMode() {
  signUpMode = false;
  $('#authTitle').textContent = 'Đăng nhập';
  $('#authSubmit').textContent = 'Đăng nhập';
  $('#authPassword').autocomplete = 'current-password';
  if ($('#authToggle')) $('#authToggle').classList.add('hidden');
}
$('#authForm').onsubmit = async event => {
  event.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  $('#authSubmit').disabled = true;
  $('#authMsg').textContent = 'Đang xử lý…';
  try {
    const result = await authClient.signIn.email({ email, password });
    if (result.error) throw result.error;
    const session = await authClient.getSession();
    if (!session.data?.user) throw new Error('Chưa tạo được phiên đăng nhập');
    $('#authMsg').textContent = '';
    await showLoggedIn(session.data.user);
  } catch (error) {
    $('#authMsg').textContent = error?.message || 'Không đăng nhập được';
  } finally {
    $('#authSubmit').disabled = false;
  }
};
$('#signOutBtn').onclick = async () => {
  await authClient.signOut();
  await showLoggedOut();
};

async function load() {
  try {
    const data = await api('/api/bootstrap');
    state = { ...state, ...data };
    render();
  } catch (error) {
    toast('Không tải được dữ liệu: ' + error.message);
  }
}
function render() {
  $('#recordsBody').innerHTML = state.records.map(r => {
    const fields = Object.entries(r.fields || {}).slice(0, 4)
      .map(([k, v]) => k + ': ' + (v?.value ?? v)).join('<br>');
    const badge = r.status === 'ĐÃ XÁC MINH' ? 'ok' : 'warn';
    return '<tr><td>' + r.id + '</td><td>' + r.kind + '</td><td><span class="badge ' + badge + '">' +
      r.status + '</span></td><td>' + fields + '</td><td>' + fmt(r.created_at) + '</td></tr>';
  }).join('') || '<tr><td colspan="5">Chưa có dữ liệu.</td></tr>';

  $('#inventoryBody').innerHTML = state.inventory.map(x => {
    const days = Math.ceil((new Date(x.expiry) - new Date()) / 86400000);
    const cls = days < 0 ? 'bad' : days <= 7 ? 'warn' : 'ok';
    const label = days < 0 ? 'QUÁ HẠN' : days <= 7 ? 'SẮP HẾT HẠN' : 'CÒN HẠN';
    return '<tr><td>' + x.name + '</td><td>' + x.in_qty + ' ' + (x.unit || '') +
      '</td><td>' + x.out_qty + '</td><td>' + x.balance + '</td><td>' +
      (x.expiry?.slice(0, 10) || '—') + '</td><td><span class="badge ' + cls + '">' +
      label + '</span></td></tr>';
  }).join('') || '<tr><td colspan="6">Chưa có dữ liệu kho.</td></tr>';
}

$$('#nav button').forEach(button => {
  button.onclick = () => {
    $$('#nav button').forEach(x => x.classList.toggle('active', x === button));
    $$('.tab').forEach(tab => tab.classList.toggle('active', tab.id === 'tab-' + button.dataset.tab));
  };
});
function setSelectedImage(file) {
  if (!file) return;
  if (!file.type?.startsWith('image/')) {
    toast('Vui lòng chọn file ảnh.');
    return;
  }
  selectedImageFile = file;
  $('#preview').src = URL.createObjectURL(file);
  $('#selectedFile').textContent = file.name || 'Ảnh vừa chụp';
  $('#ocrMsg').textContent = 'Ảnh đã sẵn sàng. Bấm Nhận diện OCR/AI.';
}
$('#takePhoto').onclick = () => $('#cameraInput').click();
$('#choosePhoto').onclick = () => $('#fileInput').click();
$('#cameraInput').onchange = event => setSelectedImage(event.target.files?.[0]);
$('#fileInput').onchange = event => setSelectedImage(event.target.files?.[0]);

async function fileB64(file, max = 1600) {
  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;
  const scale = Math.min(1, max / Math.max(width, height), Math.sqrt(2000000 / (width * height)));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { data, mimeType: 'image/jpeg' };
}

async function localOcrFallback(file, kind) {
  $('#ocrMsg').textContent = 'AI Gateway không khả dụng. Đang OCR local trên thiết bị…';
  const mod = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js');
  const worker = await mod.createWorker('vie+eng', 1);
  try {
    const result = await worker.recognize(file);
    const rawText = result?.data?.text || '';
    const lineItems = [];
    if (kind === '1a' || kind === '1b') {
      const unitRe = '(?:Kg|kg|KG|g|G|L|l|ml|ML|cái|Cái|gói|Gói|hộp|Hộp|thùng|Thùng)';
      const re = new RegExp('^\\s*(\\d{1,3})\\s+([A-Z0-9._/-]+)\\s+(.+?)\\s+(' + unitRe + ')\\s+([0-9.,]+)\\s+([0-9.,]+)\\s+([0-9.,]+)\\s*
  const file = selectedImageFile;
  if (!file) return toast('Hãy chụp ảnh hoặc tải ảnh từ máy trước');
  $('#runOcr').disabled = true;
  $('#ocrMsg').textContent = 'Đang đọc 2 lượt và kiểm tra cột…';
  try {
    const image = await fileB64(file);
    state.ocr = await api('/api/ocr', {
      method: 'POST',
      body: JSON.stringify({ kind: $('#kind').value, image })
    });
    renderOcr();
  } catch (error) {
    if (/AI_GATEWAY|AI_MODEL|AI_403|gateway/i.test(error.message || '')) {
      try {
        state.ocr = await localOcrFallback(file, $('#kind').value);
        renderOcr();
        $('#ocrMsg').textContent = 'Đang dùng OCR local dự phòng. Tất cả kết quả phải dò lại trước khi lưu.';
        toast('AI Gateway chưa hoạt động; đã chuyển sang OCR local.');
      } catch (fallbackError) {
        $('#ocrMsg').textContent = fallbackError.message;
        toast('OCR dự phòng cũng lỗi: ' + fallbackError.message);
      }
    } else {
      $('#ocrMsg').textContent = error.message;
      toast(error.message);
    }
  } finally {
    $('#runOcr').disabled = false;
  }
};

function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function renderOcr() {
  const o = state.ocr;
  if (!o) return;
  $('#ocrMsg').textContent = 'Đã đọc ' + (o.passes || 2) + ' lượt · model ' + (o.model || 'AI') + '. Dòng vàng cần dò lại.';
  const fields = (o.fields || []).map((x, i) =>
    '<div class="fieldrow"><b>' + esc(x.key) + '</b><input data-fi="' + i + '" value="' +
    esc(x.value) + '"><span class="badge ' + (x.confidence >= 95 ? 'ok' : 'warn') + '">' +
    Math.round(x.confidence) + '%</span></div>'
  ).join('');
  const lines = (o.lineItems || []).map((x, i) =>
    '<div class="ocr-line"><input data-ln="' + i + '" data-k="name" value="' + esc(x.name) +
    '"><input data-ln="' + i + '" data-k="quantity" value="' + esc(x.quantity) +
    '"><input data-ln="' + i + '" data-k="unit" value="' + esc(x.unit) +
    '"><select data-ln="' + i + '" data-k="kind"><option ' + (x.kindSuggestion === '1a' ? 'selected' : '') +
    '>1a</option><option ' + (x.kindSuggestion === '1b' ? 'selected' : '') +
    '>1b</option><option ' + (x.kindSuggestion === 'review' ? 'selected' : '') +
    '>review</option></select><span class="badge ' + (x.confidence >= 95 ? 'ok' : 'warn') + '">' +
    Math.round(x.confidence) + '% ' + (x.columnVerified ? '✓ cột' : 'dò lại') + '</span></div>'
  ).join('');
  $('#ocrResult').innerHTML = '<div class="card"><h3>Trường chung</h3>' + fields +
    '<h3>Dòng hàng</h3>' + (lines || '<p class="muted">Không có bảng hàng.</p>') +
    '<div class="actions"><button class="primary" id="saveOcr">Lưu bản ghi</button></div>' +
    '<details><summary>OCR thô</summary><pre>' + esc(o.rawText || '') + '</pre></details></div>';
  $('#saveOcr').onclick = saveOcr;
}

async function saveOcr() {
  const o = state.ocr;
  const kind = $('#kind').value;
  const fields = {};
  (o.fields || []).forEach((x, i) => {
    fields[x.key] = {
      value: document.querySelector('[data-fi="' + i + '"]').value,
      confidence: x.confidence,
      confirmed: !o.localFallback && x.confidence >= 95
    };
  });
  const lines = (o.lineItems || []).map((x, i) => {
    const get = key => document.querySelector('[data-ln="' + i + '"][data-k="' + key + '"]').value;
    return { ...x, name: get('name'), quantity: get('quantity'), unit: get('unit'), kind: get('kind'), confidence: o.localFallback ? Math.min(90, x.confidence || 0) : x.confidence };
  });
  try {
    if ((kind === '1a' || kind === '1b') && lines.length) {
      const usable = lines.filter(x => ['1a', '1b'].includes(x.kind));
      const d = await api('/api/invoice-records', {
        method: 'POST',
        body: JSON.stringify({ sharedFields: fields, lines: usable, rawText: o.rawText, imageKey: o.imageKey, ocrJobId: o.jobId })
      });
      toast('Đã lưu ' + d.saved + ' dòng; ' + d.review + ' dòng cần dò lại');
    } else {
      await api('/api/records', {
        method: 'POST',
        body: JSON.stringify({ kind, fields, rawText: o.rawText, imageKey: o.imageKey, ocrJobId: o.jobId })
      });
      toast('Đã lưu bản ghi');
    }
    await load();
  } catch (error) {
    toast('Không lưu được: ' + error.message);
  }
}

$('#inventoryForm').onsubmit = async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    await api('/api/inventory', { method: 'POST', body: JSON.stringify(payload) });
    toast('Đã nhập kho');
    event.target.reset();
    await load();
  } catch (error) {
    toast(error.message);
  }
};
$('#menuForm').onsubmit = async event => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  const items = form.lines.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
    const [dish = '', ingredients = '', servings = '0'] = line.split('|').map(s => s.trim());
    return { date: form.date, meal: form.meal, dish, ingredients, servings };
  });
  try {
    await api('/api/menu', { method: 'POST', body: JSON.stringify({ items }) });
    toast('Đã lưu thực đơn');
    event.target.reset();
    await load();
  } catch (error) {
    toast(error.message);
  }
};
$$('[data-period]').forEach(button => {
  button.onclick = async () => {
    try {
      const d = await api('/api/report?period=' + button.dataset.period);
      $('#reportBox').textContent =
        'Kỳ: ' + d.period + '\n' +
        'Bước 1: ' + d.step1 + '\n' +
        'Bước 2: ' + d.step2 + '\n' +
        'Bước 3: ' + d.step3 + '\n' +
        'Mẫu lưu: ' + d.samples + '\n' +
        'Cần dò OCR: ' + d.needs + '\n' +
        'Sắp hết hạn: ' + d.expiring + '\n' +
        'Quá hạn: ' + d.expired;
    } catch (error) {
      toast(error.message);
    }
  };
});

renderAuthMode();
health();
restoreSession();
setInterval(health, 60000);
);
      for (const line of rawText.split(/\\r?\\n/)) {
        const m = line.match(re);
        if (!m) continue;
        lineItems.push({
          code:m[2], name:m[3].trim(), unit:m[4], quantity:m[5], expiry:'',
          confidence:80, kindSuggestion:kind, reason:'OCR local dự phòng; bắt buộc dò lại',
          columnVerified:false, evidenceLine:line
        });
      }
    }
    const image = await fileB64(file);
    const persisted = await api('/api/ocr-local', {
      method:'POST',
      body:JSON.stringify({kind,image,rawText,lineItems})
    });
    return {
      jobId:persisted.jobId,
      fields:[],
      lineItems:persisted.lineItems || lineItems,
      rawText,
      imageKey:persisted.imageKey,
      imageSha256:persisted.imageSha256,
      passes:1,
      model:'Tesseract local fallback',
      localFallback:true
    };
  } finally {
    await worker.terminate();
  }
}

$('#runOcr').onclick = async () => {
  const file = selectedImageFile;
  if (!file) return toast('Hãy chụp ảnh hoặc tải ảnh từ máy trước');
  $('#runOcr').disabled = true;
  $('#ocrMsg').textContent = 'Đang đọc 2 lượt và kiểm tra cột…';
  try {
    const image = await fileB64(file);
    state.ocr = await api('/api/ocr', {
      method: 'POST',
      body: JSON.stringify({ kind: $('#kind').value, image })
    });
    renderOcr();
  } catch (error) {
    $('#ocrMsg').textContent = error.message;
    toast(error.message);
  } finally {
    $('#runOcr').disabled = false;
  }
};

function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function renderOcr() {
  const o = state.ocr;
  if (!o) return;
  $('#ocrMsg').textContent = 'Đã đọc ' + (o.passes || 2) + ' lượt · model ' + (o.model || 'AI') + '. Dòng vàng cần dò lại.';
  const fields = (o.fields || []).map((x, i) =>
    '<div class="fieldrow"><b>' + esc(x.key) + '</b><input data-fi="' + i + '" value="' +
    esc(x.value) + '"><span class="badge ' + (x.confidence >= 95 ? 'ok' : 'warn') + '">' +
    Math.round(x.confidence) + '%</span></div>'
  ).join('');
  const lines = (o.lineItems || []).map((x, i) =>
    '<div class="ocr-line"><input data-ln="' + i + '" data-k="name" value="' + esc(x.name) +
    '"><input data-ln="' + i + '" data-k="quantity" value="' + esc(x.quantity) +
    '"><input data-ln="' + i + '" data-k="unit" value="' + esc(x.unit) +
    '"><select data-ln="' + i + '" data-k="kind"><option ' + (x.kindSuggestion === '1a' ? 'selected' : '') +
    '>1a</option><option ' + (x.kindSuggestion === '1b' ? 'selected' : '') +
    '>1b</option><option ' + (x.kindSuggestion === 'review' ? 'selected' : '') +
    '>review</option></select><span class="badge ' + (x.confidence >= 95 ? 'ok' : 'warn') + '">' +
    Math.round(x.confidence) + '% ' + (x.columnVerified ? '✓ cột' : 'dò lại') + '</span></div>'
  ).join('');
  $('#ocrResult').innerHTML = '<div class="card"><h3>Trường chung</h3>' + fields +
    '<h3>Dòng hàng</h3>' + (lines || '<p class="muted">Không có bảng hàng.</p>') +
    '<div class="actions"><button class="primary" id="saveOcr">Lưu bản ghi</button></div>' +
    '<details><summary>OCR thô</summary><pre>' + esc(o.rawText || '') + '</pre></details></div>';
  $('#saveOcr').onclick = saveOcr;
}

async function saveOcr() {
  const o = state.ocr;
  const kind = $('#kind').value;
  const fields = {};
  (o.fields || []).forEach((x, i) => {
    fields[x.key] = {
      value: document.querySelector('[data-fi="' + i + '"]').value,
      confidence: x.confidence,
      confirmed: x.confidence >= 95
    };
  });
  const lines = (o.lineItems || []).map((x, i) => {
    const get = key => document.querySelector('[data-ln="' + i + '"][data-k="' + key + '"]').value;
    return { ...x, name: get('name'), quantity: get('quantity'), unit: get('unit'), kind: get('kind') };
  });
  try {
    if ((kind === '1a' || kind === '1b') && lines.length) {
      const usable = lines.filter(x => ['1a', '1b'].includes(x.kind));
      const d = await api('/api/invoice-records', {
        method: 'POST',
        body: JSON.stringify({ sharedFields: fields, lines: usable, rawText: o.rawText, imageKey: o.imageKey, ocrJobId: o.jobId })
      });
      toast('Đã lưu ' + d.saved + ' dòng; ' + d.review + ' dòng cần dò lại');
    } else {
      await api('/api/records', {
        method: 'POST',
        body: JSON.stringify({ kind, fields, rawText: o.rawText, imageKey: o.imageKey, ocrJobId: o.jobId })
      });
      toast('Đã lưu bản ghi');
    }
    await load();
  } catch (error) {
    toast('Không lưu được: ' + error.message);
  }
}

$('#inventoryForm').onsubmit = async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    await api('/api/inventory', { method: 'POST', body: JSON.stringify(payload) });
    toast('Đã nhập kho');
    event.target.reset();
    await load();
  } catch (error) {
    toast(error.message);
  }
};
$('#menuForm').onsubmit = async event => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  const items = form.lines.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
    const [dish = '', ingredients = '', servings = '0'] = line.split('|').map(s => s.trim());
    return { date: form.date, meal: form.meal, dish, ingredients, servings };
  });
  try {
    await api('/api/menu', { method: 'POST', body: JSON.stringify({ items }) });
    toast('Đã lưu thực đơn');
    event.target.reset();
    await load();
  } catch (error) {
    toast(error.message);
  }
};
$$('[data-period]').forEach(button => {
  button.onclick = async () => {
    try {
      const d = await api('/api/report?period=' + button.dataset.period);
      $('#reportBox').textContent =
        'Kỳ: ' + d.period + '\n' +
        'Bước 1: ' + d.step1 + '\n' +
        'Bước 2: ' + d.step2 + '\n' +
        'Bước 3: ' + d.step3 + '\n' +
        'Mẫu lưu: ' + d.samples + '\n' +
        'Cần dò OCR: ' + d.needs + '\n' +
        'Sắp hết hạn: ' + d.expiring + '\n' +
        'Quá hạn: ' + d.expired;
    } catch (error) {
      toast(error.message);
    }
  };
});

renderAuthMode();
health();
restoreSession();
setInterval(health, 60000);
