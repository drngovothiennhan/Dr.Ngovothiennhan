const APP = {
  SHEET_ID: '1BcRDGO9oTiPeGFxHe7oYspvYaQKR0dxnjBPZlqZzgAI',
  MODEL: 'gemini-3.8-flash',
  TZ: 'Asia/Ho_Chi_Minh',
  OCR_REVIEW_THRESHOLD: 95,
  SHEETS: {
    STEP1: 'B1_Nhap_thuc_pham',
    STEP2: 'B2_Che_bien',
    STEP3: 'B3_Truoc_khi_an',
    SAMPLE: 'Luu_mau',
    MENU: 'Thuc_don',
    STOCK: 'Kho',
    ALERT: 'Canh_bao',
    REPORT: 'Bao_cao',
    CONFIG: 'Cau_hinh'
  }
};

function doGet() {
  ensureSetup_();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Sổ ATTP trường học')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getBootstrap() {
  ensureSetup_();
  return {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + APP.SHEET_ID + '/edit',
    dashboard: getDashboard_(),
    menus: readObjects_(APP.SHEETS.MENU, 300),
    stock: readObjects_(APP.SHEETS.STOCK, 500),
    config: getPublicConfig_(),
    model: getModel_()
  };
}

function saveConfig(input) {
  ensureSetup_();
  const p = PropertiesService.getScriptProperties();
  if (input.reportHour !== undefined) p.setProperty('REPORT_HOUR', String(input.reportHour || ''));
  if (input.zaloRecipients !== undefined) p.setProperty('ZALO_RECIPIENTS', String(input.zaloRecipients || ''));
  if (input.zaloEndpoint !== undefined) p.setProperty('ZALO_SEND_ENDPOINT', String(input.zaloEndpoint || ''));
  return getPublicConfig_();
}

function hasGeminiKey() {
  return Boolean(PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'));
}

function saveSingleRecord(kind, fields, clientConfidence) {
  ensureSetup_();
  kind = normalizeKind_(kind);
  fields = fields || {};
  const warnings = validateRecord_(kind, fields, Number(clientConfidence || 100));
  const status = warnings.length ? 'CẦN DÒ LẠI' : 'ĐÃ XÁC MINH';
  const id = newId_();
  appendByHeader_(sheetForKind_(kind), recordRow_(id, kind, fields, status, Number(clientConfidence || 100), warnings));
  return { ok: true, id, status, warnings };
}

function saveInvoiceBatch(payload) {
  ensureSetup_();
  payload = payload || {};
  const shared = payload.shared || {};
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (!lines.length) throw new Error('Không có dòng hóa đơn được chọn.');

  const out = [];
  lines.slice(0, 100).forEach(function(line) {
    const kind = normalizeKind_(line.kind || '1a');
    const fields = Object.assign({}, shared, {
      name: String(line.name || '').trim(),
      weight: String(line.quantity || line.qty || '').trim(),
      unit: String(line.unit || '').trim()
    });
    if (line.expiry) fields.expiry = String(line.expiry).trim();

    const confidence = Number(line.confidence || 0);
    const warnings = validateRecord_(kind, fields, confidence);
    const status = warnings.length ? 'CẦN DÒ LẠI' : 'ĐÃ XÁC MINH';
    const id = newId_();
    appendByHeader_(APP.SHEETS.STEP1, recordRow_(id, kind, fields, status, confidence, warnings, String(line.code || '')));
    out.push({ id, status, warnings });
  });

  return {
    ok: true,
    saved: out.length,
    review: out.filter(function(x) { return x.status === 'CẦN DÒ LẠI'; }).length,
    rows: out
  };
}

function ocrImage(payload) {
  payload = payload || {};
  const kind = normalizeKind_(payload.kind || '1a');
  const image = payload.image || {};
  if (!image.base64 || !image.mimeType) throw new Error('Thiếu ảnh.');

  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, code: 'NO_GEMINI_KEY', message: 'Chưa cấu hình GEMINI_API_KEY.' };

  const model = getModel_();
  const prompt = buildOcrPrompt_(kind);
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent';

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: image.mimeType, data: image.base64 } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens: 16384
    }
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) {
    return {
      ok: false,
      code: 'GEMINI_HTTP_' + code,
      message: 'Gemini OCR trả HTTP ' + code,
      detail: text.substring(0, 700)
    };
  }

  const parsed = JSON.parse(text);
  const candidate = parsed &&
    parsed.candidates &&
    parsed.candidates[0] &&
    parsed.candidates[0].content &&
    parsed.candidates[0].content.parts &&
    parsed.candidates[0].content.parts[0] &&
    parsed.candidates[0].content.parts[0].text;

  if (!candidate) return { ok: false, code: 'EMPTY', message: 'Gemini không trả dữ liệu.' };

  let data;
  try {
    data = JSON.parse(candidate);
  } catch (e) {
    return { ok: false, code: 'INVALID_JSON', message: 'Không đọc được JSON từ Gemini.' };
  }

  data = sanitizeOcr_(data, kind);
  return { ok: true, model, data };
}

function saveMenu(items) {
  ensureSetup_();
  (items || []).slice(0, 100).forEach(function(item) {
    appendByHeader_(APP.SHEETS.MENU, {
      'Ngày': item.date || '',
      'Ca/Bữa': item.meal || '',
      'Tên món ăn': item.dish || '',
      'Số suất dự kiến': Number(item.servings || 0),
      'Nguyên liệu chính dự kiến': item.ingredients || '',
      'Ghi chú': item.note || ''
    });
  });
  return { ok: true, count: (items || []).length };
}

function saveStock(item) {
  ensureSetup_();
  item = item || {};
  if (!item.name || !item.expiry) throw new Error('Kho cần tên thực phẩm và HSD.');

  const opening = Number(item.openingQty || 0);
  const incoming = Number(item.inQty || 0);
  const outgoing = Number(item.outQty || 0);
  const sample = Number(item.sampleQty || 0);
  const id = newId_();

  appendByHeader_(APP.SHEETS.STOCK, {
    'ID lô': id,
    'Tên thực phẩm': item.name || '',
    'Nhóm': item.group || '',
    'Ngày nhập': item.received || today_(),
    'HSD': item.expiry || '',
    'Số lô': item.lot || '',
    'Nhà cung cấp': item.supplier || '',
    'Tồn đầu': opening,
    'SL nhập': incoming,
    'SL xuất': outgoing,
    'Lưu mẫu': sample,
    'Đơn vị': item.unit || '',
    'Tồn hiện tại': opening + incoming - outgoing - sample,
    'Vị trí bảo quản': item.location || '',
    'Điều kiện bảo quản': item.storage || '',
    'Trạng thái HSD': expiryStatus_(item.expiry),
    'Số ngày còn lại': daysLeft_(item.expiry),
    'Ghi chú': item.note || ''
  });

  return { ok: true, id };
}

function getReport(period) {
  ensureSetup_();
  const bounds = reportBounds_(period || 'day');
  const step1 = readObjects_(APP.SHEETS.STEP1, 2000);
  const step2 = readObjects_(APP.SHEETS.STEP2, 2000);
  const step3 = readObjects_(APP.SHEETS.STEP3, 2000);
  const samples = readObjects_(APP.SHEETS.SAMPLE, 2000);
  const stock = readObjects_(APP.SHEETS.STOCK, 2000);

  function inRange(v) {
    const d = normalizeDate_(v);
    return d && d >= bounds.start && d <= bounds.end;
  }

  const r1 = step1.filter(function(r) { return inRange(r['Thời gian nhập']); });
  const r2 = step2.filter(function(r) { return inRange(r['Ngày']); });
  const r3 = step3.filter(function(r) { return inRange(r['Ngày']); });
  const rs = samples.filter(function(r) { return inRange(r['Thời gian lấy mẫu'] || r['Ngày']); });
  const stk = stock.filter(function(r) { return inRange(r['Ngày nhập']); });

  const needReview = r1.concat(r2, r3, rs).filter(function(r) {
    return String(r['Trạng thái xác minh'] || '').indexOf('CẦN') >= 0;
  }).length;

  const expiring = stock.filter(function(r) {
    return daysLeft_(r['HSD']) <= 7;
  }).length;

  const stockIn = stk.reduce(function(sum, r) { return sum + Number(r['SL nhập'] || 0); }, 0);
  const stockOut = stk.reduce(function(sum, r) { return sum + Number(r['SL xuất'] || 0); }, 0);
  const stockSample = stk.reduce(function(sum, r) { return sum + Number(r['Lưu mẫu'] || 0); }, 0);

  const text = [
    'BÁO CÁO ATTP TRƯỜNG HỌC - ' + bounds.label.toUpperCase(),
    'Kỳ: ' + bounds.start + ' → ' + bounds.end,
    '• Bước 1: ' + r1.length + ' dòng',
    '• Bước 2: ' + r2.length + ' dòng',
    '• Bước 3: ' + r3.length + ' dòng',
    '• Mẫu lưu: ' + rs.length,
    '• Kho - Nhập: ' + stockIn + ' | Xuất: ' + stockOut + ' | Lưu mẫu: ' + stockSample,
    '• HSD ≤7 ngày/quá hạn: ' + expiring,
    '• Cần dò lại: ' + needReview
  ].join('\n');

  appendByHeader_(APP.SHEETS.REPORT, {
    'Kỳ báo cáo': bounds.label,
    'Từ ngày': bounds.start,
    'Đến ngày': bounds.end,
    'Số lượt nhập': r1.length,
    'Số món chế biến': r2.length,
    'Số mẫu lưu': rs.length,
    'Số cảnh báo HSD': expiring,
    'Số bản ghi cần xác minh': needReview,
    'Ghi chú': 'Kho nhập=' + stockIn + '; xuất=' + stockOut + '; lưu mẫu=' + stockSample
  });

  return {
    ok: true,
    period: period,
    start: bounds.start,
    end: bounds.end,
    text: text
  };
}

function installDailyReportTrigger() {
  const hour = Number(PropertiesService.getScriptProperties().getProperty('REPORT_HOUR') || '');
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('Hãy cấu hình REPORT_HOUR từ 0 đến 23 trước.');
  }

  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'dailyReportJob') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('dailyReportJob')
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .inTimezone(APP.TZ)
    .create();

  return { ok: true, hour: hour };
}

function dailyReportJob() {
  const report = getReport('day');
  sendZaloReport_(report.text);
}

function testZalo() {
  return sendZaloReport_('Kiểm tra kết nối Zalo - Sổ ATTP trường học - ' + Utilities.formatDate(new Date(), APP.TZ, 'dd/MM/yyyy HH:mm'));
}

function getDashboard_() {
  const today = today_();
  const step1 = readObjects_(APP.SHEETS.STEP1, 500);
  const step2 = readObjects_(APP.SHEETS.STEP2, 500);
  const step3 = readObjects_(APP.SHEETS.STEP3, 500);
  const samples = readObjects_(APP.SHEETS.SAMPLE, 500);
  const stock = readObjects_(APP.SHEETS.STOCK, 500);

  const todayRecords = step1.filter(function(r) { return normalizeDate_(r['Thời gian nhập']) === today; }).length +
    step2.filter(function(r) { return normalizeDate_(r['Ngày']) === today; }).length +
    step3.filter(function(r) { return normalizeDate_(r['Ngày']) === today; }).length +
    samples.filter(function(r) { return normalizeDate_(r['Thời gian lấy mẫu'] || r['Ngày']) === today; }).length;

  const review = step1.concat(step2, step3, samples).filter(function(r) {
    return String(r['Trạng thái xác minh'] || '').indexOf('CẦN') >= 0;
  }).length;

  const expiring = stock.filter(function(r) { return daysLeft_(r['HSD']) <= 7; }).length;

  return {
    todayRecords: todayRecords,
    review: review,
    expiring: expiring,
    stockCount: stock.length
  };
}

function sendZaloReport_(text) {
  const p = PropertiesService.getScriptProperties();
  const token = p.getProperty('ZALO_ACCESS_TOKEN');
  const endpoint = p.getProperty('ZALO_SEND_ENDPOINT');
  const recipients = String(p.getProperty('ZALO_RECIPIENTS') || '')
    .split(',')
    .map(function(x) { return x.trim(); })
    .filter(Boolean);

  if (!token || !endpoint || !recipients.length) {
    return {
      ok: false,
      message: 'Chưa đủ ZALO_ACCESS_TOKEN / ZALO_SEND_ENDPOINT / ZALO_RECIPIENTS.'
    };
  }

  const results = recipients.map(function(uid) {
    const res = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: { access_token: token },
      payload: JSON.stringify({
        recipient: { user_id: uid },
        message: { text: text }
      }),
      muteHttpExceptions: true
    });
    return {
      uid: uid,
      status: res.getResponseCode(),
      body: res.getContentText().substring(0, 500)
    };
  });

  return {
    ok: results.every(function(x) { return x.status >= 200 && x.status < 300; }),
    results: results
  };
}

function getPublicConfig_() {
  const p = PropertiesService.getScriptProperties();
  return {
    hasGeminiKey: Boolean(p.getProperty('GEMINI_API_KEY')),
    reportHour: p.getProperty('REPORT_HOUR') || '',
    zaloRecipients: p.getProperty('ZALO_RECIPIENTS') || '',
    zaloEndpoint: p.getProperty('ZALO_SEND_ENDPOINT') || '',
    hasZaloToken: Boolean(p.getProperty('ZALO_ACCESS_TOKEN'))
  };
}

function getModel_() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || APP.MODEL;
}

function buildOcrPrompt_(kind) {
  const common = [
    'Bạn là hệ thống OCR chứng từ an toàn thực phẩm trường học tại Việt Nam.',
    'Chỉ đọc dữ liệu thực sự nhìn thấy trong ảnh. Không suy đoán.',
    'Không tự tạo HSD, giờ nhập, số lô, kiểm dịch, cảm quan, người giao hàng hoặc địa chỉ nếu ảnh không có.',
    'Phân biệt NGƯỜI BÁN/NHÀ CUNG CẤP với KHÁCH HÀNG/TRƯỜNG HỌC.',
    'Với bảng hàng: đọc TẤT CẢ dòng nhìn thấy, không bỏ dòng.',
    'Không nhầm Số lượng với Đơn giá hoặc Thành tiền.',
    'Ngày chuẩn YYYY-MM-DD. Chỉ thêm THH:mm khi ảnh có giờ thật.',
    'Mỗi giá trị có confidence 0-100. Nếu không chắc, giữ value rỗng hoặc confidence thấp.',
    'Trả JSON duy nhất, không markdown.'
  ];

  if (kind === '1a' || kind === '1b') {
    common.push(
      'Schema: {"fields":{"supplier":{"value":"","confidence":0},"supplierContact":{"value":"","confidence":0},"receivedAt":{"value":"","confidence":0},"invoice":{"value":"","confidence":0},"deliverer":{"value":"","confidence":0}},"lineItems":[{"code":"","name":"","unit":"","quantity":"","expiry":"","kind":"1a|1b|review","confidence":0}]}',
      'kind=1a khi thực phẩm rõ là tươi sống/đông lạnh; kind=1b khi rõ là khô/bao gói/phụ gia; không chắc dùng review.'
    );
  } else {
    common.push(
      'Schema: {"fields":{"date":{"value":"","confidence":0},"meal":{"value":"","confidence":0},"dish":{"value":"","confidence":0},"ingredients":{"value":"","confidence":0},"servings":{"value":"","confidence":0},"prepDone":{"value":"","confidence":0},"cookDone":{"value":"","confidence":0},"splitDone":{"value":"","confidence":0},"eatStart":{"value":"","confidence":0},"sampleName":{"value":"","confidence":0},"amount":{"value":"","confidence":0},"unit":{"value":"","confidence":0},"temperature":{"value":"","confidence":0},"takenAt":{"value":"","confidence":0}},"lineItems":[]}'
    );
  }
  return common.join(' ');
}

function sanitizeOcr_(data, kind) {
  data = data || {};
  const out = { fields: {}, lineItems: [] };

  Object.keys(data.fields || {}).forEach(function(k) {
    const x = data.fields[k] || {};
    const value = String(x.value || '').trim();
    const confidence = Math.max(0, Math.min(100, Number(x.confidence || 0)));
    if (value) out.fields[k] = { value: value, confidence: confidence };
  });

  if (kind === '1a' || kind === '1b') {
    out.lineItems = (data.lineItems || []).slice(0, 100).map(function(x) {
      const suggested = String(x.kind || 'review').toLowerCase();
      return {
        code: String(x.code || '').trim(),
        name: String(x.name || '').trim(),
        unit: String(x.unit || '').trim(),
        quantity: String(x.quantity || '').trim(),
        expiry: String(x.expiry || '').trim(),
        kind: ['1a', '1b'].indexOf(suggested) >= 0 ? suggested : 'review',
        confidence: Math.max(0, Math.min(100, Number(x.confidence || 0)))
      };
    }).filter(function(x) { return x.name; });
  }

  return out;
}

function validateRecord_(kind, f, confidence) {
  const warnings = [];
  const required = {
    '1a': ['name', 'receivedAt', 'weight', 'supplier'],
    '1b': ['name', 'receivedAt', 'weight', 'supplier', 'expiry'],
    '2': ['date', 'meal', 'dish', 'ingredients', 'servings', 'prepDone', 'cookDone'],
    '3': ['date', 'meal', 'dish', 'servings', 'splitDone', 'eatStart'],
    'sample': ['date', 'sampleName', 'meal', 'servings', 'amount', 'unit', 'temperature', 'takenAt']
  }[kind] || [];

  required.forEach(function(k) {
    if (!String(f[k] || '').trim()) warnings.push('Thiếu ' + k);
  });

  if (confidence < APP.OCR_REVIEW_THRESHOLD) warnings.push('OCR dưới 95%');

  if ((kind === '1a' || kind === '1b') && f.receivedAt) {
    const v = String(f.receivedAt);
    if (v.indexOf('T') < 0 && !/\d{1,2}:\d{2}/.test(v)) {
      warnings.push('Thiếu giờ nhập');
    }
  }

  if (kind === 'sample') {
    const unit = String(f.unit || '').toLowerCase();
    const amount = Number(f.amount || 0);
    const temp = Number(f.temperature);
    if (unit === 'g' && amount < 100) warnings.push('Mẫu đặc dưới 100 g');
    if (unit === 'ml' && amount < 150) warnings.push('Mẫu lỏng dưới 150 ml');
    if (isFinite(temp) && (temp < 2 || temp > 8)) warnings.push('Nhiệt độ ngoài 2-8°C');
  }

  return warnings;
}

function recordRow_(id, kind, f, status, confidence, warnings, itemCode) {
  if (kind === '1a' || kind === '1b') {
    return {
      'ID': id,
      'Nhóm thực phẩm': kind === '1a' ? '1a - Tươi sống/đông lạnh' : '1b - Khô/bao gói/phụ gia',
      'Tên thực phẩm': f.name || '',
      'Thời gian nhập': f.receivedAt || '',
      'Khối lượng': f.weight || '',
      'Đơn vị': f.unit || '',
      'Cơ sở SX/NCC': f.supplier || f.manufacturer || '',
      'Địa chỉ/Điện thoại': f.supplierContact || f.manufacturerAddress || '',
      'Người giao hàng': f.deliverer || '',
      'Chứng từ/Hóa đơn': f.invoice || '',
      'ĐK VS thú y': f.vetRegistration || '',
      'Giấy kiểm dịch': f.quarantine || '',
      'Hạn sử dụng': f.expiry || '',
      'Điều kiện bảo quản': f.storage || '',
      'Cảm quan': f.sensory || '',
      'Xét nghiệm nhanh': f.rapidTest || '',
      'Kết quả': f.result || '',
      'Biện pháp xử lý/Ghi chú': [f.action || '', itemCode ? 'Mã hàng ' + itemCode : '', warnings.join('; ')].filter(Boolean).join(' | '),
      'Độ tin cậy OCR (%)': confidence,
      'Trạng thái xác minh': status,
      'Người kiểm tra': f.checker || ''
    };
  }

  if (kind === '2') {
    return {
      'ID': id,
      'Ngày': f.date || '',
      'Ca/Bữa ăn': f.meal || '',
      'Tên món ăn': f.dish || '',
      'Nguyên liệu chính': f.ingredients || '',
      'Số lượng/Số suất': f.servings || '',
      'Thời gian sơ chế xong': f.prepDone || '',
      'Thời gian chế biến xong': f.cookDone || '',
      'Người tham gia chế biến': f.staffHygiene || '',
      'Trang thiết bị/Dụng cụ': f.equipment || '',
      'Khu vực chế biến/phụ trợ': f.area || '',
      'Cảm quan - Đạt': f.sensory || '',
      'Biện pháp xử lý/Ghi chú': [f.action || '', warnings.join('; ')].filter(Boolean).join(' | '),
      'Người kiểm tra': f.checker || '',
      'Trạng thái xác minh': status
    };
  }

  if (kind === '3') {
    return {
      'ID': id,
      'Ngày': f.date || '',
      'Ca/Bữa ăn': f.meal || '',
      'Tên món ăn': f.dish || '',
      'Số lượng suất': f.servings || '',
      'Thời gian chia xong': f.splitDone || '',
      'Thời gian bắt đầu ăn': f.eatStart || '',
      'Dụng cụ chia/chứa/che đậy/bảo quản': f.utensils || '',
      'Cảm quan - Đạt': f.sensory || '',
      'Biện pháp xử lý/Ghi chú': [f.action || '', warnings.join('; ')].filter(Boolean).join(' | '),
      'Người kiểm tra': f.checker || '',
      'Trạng thái xác minh': status
    };
  }

  return {
    'ID': id,
    'Tên mẫu thức ăn': f.sampleName || '',
    'Bữa ăn/Giờ ăn': f.meal || '',
    'Số lượng suất': f.servings || '',
    'Khối lượng/Thể tích mẫu': f.amount || '',
    'Đơn vị': f.unit || '',
    'Dụng cụ chứa mẫu': f.container || '',
    'Nhiệt độ bảo quản (°C)': f.temperature || '',
    'Thời gian lấy mẫu': f.takenAt || '',
    'Thời gian hủy mẫu': f.destroyAt || '',
    'Tình trạng mẫu/Ghi chú': [f.condition || '', warnings.join('; ')].filter(Boolean).join(' | '),
    'Người lưu mẫu': f.keeper || '',
    'Người hủy mẫu': f.destroyer || '',
    'Niêm phong': f.sealed || '',
    'Trạng thái xác minh': status
  };
}

function sheetForKind_(kind) {
  if (kind === '1a' || kind === '1b') return APP.SHEETS.STEP1;
  if (kind === '2') return APP.SHEETS.STEP2;
  if (kind === '3') return APP.SHEETS.STEP3;
  return APP.SHEETS.SAMPLE;
}

function normalizeKind_(kind) {
  kind = String(kind || '').toLowerCase();
  if (kind === 'a') kind = '1a';
  if (kind === 'b') kind = '1b';
  if (kind === 's2') kind = '2';
  if (kind === 's3') kind = '3';
  return ['1a', '1b', '2', '3', 'sample'].indexOf(kind) >= 0 ? kind : '1a';
}

function appendByHeader_(sheetName, row) {
  const ss = SpreadsheetApp.openById(APP.SHEET_ID);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Không tìm thấy sheet: ' + sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  sh.appendRow(headers.map(function(h) {
    return Object.prototype.hasOwnProperty.call(row, h) ? row[h] : '';
  }));
}

function readObjects_(sheetName, limit) {
  const sh = SpreadsheetApp.openById(APP.SHEET_ID).getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  const rows = sh.getDataRange().getDisplayValues();
  const headers = rows.shift();
  const data = rows.slice(Math.max(0, rows.length - (limit || rows.length)));
  return data.map(function(r) {
    const o = {};
    headers.forEach(function(h, i) { o[h] = r[i]; });
    return o;
  });
}

function ensureSetup_() {
  const ss = SpreadsheetApp.openById(APP.SHEET_ID);
  const defs = {};
  defs[APP.SHEETS.CONFIG] = ['Khóa', 'Giá trị', 'Ghi chú'];
  Object.keys(defs).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(defs[name]);
  });
}

function expiryStatus_(value) {
  const d = daysLeft_(value);
  if (d < 0) return 'QUÁ HẠN';
  if (d <= 7) return 'SẮP HẾT HẠN';
  return 'CÒN HẠN';
}

function daysLeft_(value) {
  const d = normalizeDate_(value);
  if (!d) return 99999;
  const target = new Date(d + 'T23:59:59+07:00').getTime();
  return Math.ceil((target - Date.now()) / 86400000);
}

function normalizeDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, APP.TZ, 'yyyy-MM-dd');
  }
  const s = String(value).trim();
  const iso = s.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  const vi = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})/);
  if (vi) return vi[3] + '-' + ('0' + vi[2]).slice(-2) + '-' + ('0' + vi[1]).slice(-2);
  return '';
}

function reportBounds_(period) {
  const now = new Date();
  const today = Utilities.formatDate(now, APP.TZ, 'yyyy-MM-dd');
  if (period === 'week') {
    const day = Number(Utilities.formatDate(now, APP.TZ, 'u'));
    const start = new Date(now.getTime() - (day - 1) * 86400000);
    const end = new Date(start.getTime() + 6 * 86400000);
    return {
      label: 'Tuần',
      start: Utilities.formatDate(start, APP.TZ, 'yyyy-MM-dd'),
      end: Utilities.formatDate(end, APP.TZ, 'yyyy-MM-dd')
    };
  }
  if (period === 'month') {
    return {
      label: 'Tháng',
      start: Utilities.formatDate(now, APP.TZ, 'yyyy-MM') + '-01',
      end: Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0), APP.TZ, 'yyyy-MM-dd')
    };
  }
  return { label: 'Ngày', start: today, end: today };
}

function today_() {
  return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');
}

function newId_() {
  return Utilities.getUuid();
}
