const PROP = PropertiesService.getScriptProperties();

function cfg_() {
  const id = PROP.getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Missing SPREADSHEET_ID in Script Properties');
  const ss = SpreadsheetApp.openById(id);
  const config = {};
  const sh = ss.getSheetByName('Config');
  if (sh) {
    const vals = sh.getDataRange().getDisplayValues();
    vals.slice(1).forEach(r => { if (r[0]) config[r[0]] = r[1] || ''; });
  }
  return { ss, config };
}

function user_() {
  return (Session.getActiveUser().getEmail() || '').toLowerCase().trim();
}

function allowed_(config) {
  const u = user_();
  const list = (config.ALLOWED_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return !!u && list.includes(u);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function rows_(ss, name, limit) {
  const sh = ss.getSheetByName(name);
  if (!sh) return [];
  const v = sh.getDataRange().getDisplayValues();
  if (v.length < 2) return [];
  const h = v[0];
  return v.slice(1, limit ? limit + 1 : undefined).filter(r => r.some(Boolean)).map(r => {
    const o = {};
    h.forEach((k, i) => { if (k) o[k] = r[i] ?? ''; });
    return o;
  });
}

function doGet(e) {
  try {
    const { ss, config } = cfg_();
    const action = String((e && e.parameter && e.parameter.action) || 'ping');

    if (action === 'ping') return json_({ ok:true, app:config.APP_NAME || 'School Health Assistant', mode:config.APP_MODE || 'DEMO', writes:config.ALLOW_WRITES === 'TRUE' });

    if (!allowed_(config)) return json_({ ok:false, error:'FORBIDDEN', message:'Google account is not allowlisted.' });

    if (action === 'dashboard') {
      return json_({
        ok:true,
        counts:{
          students: rows_(ss,'Students').length,
          tasks: rows_(ss,'Tasks').filter(x => x.Status === 'OPEN').length,
          inventory: rows_(ss,'Inventory').length,
          medications: rows_(ss,'MedicationOrders').filter(x => x.Status === 'ACTIVE').length
        }
      });
    }

    const allowedReads = {
      students:'Students',
      inventory:'Inventory',
      tasks:'Tasks',
      vaccinations:'Vaccinations',
      screenings:'HealthScreenings',
      medicationOrders:'MedicationOrders'
    };
    if (allowedReads[action]) return json_({ ok:true, data:rows_(ss, allowedReads[action], 500) });

    return json_({ ok:false, error:'UNKNOWN_ACTION' });
  } catch (err) {
    return json_({ ok:false, error:'SERVER_ERROR', message:String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    const { ss, config } = cfg_();
    if (!allowed_(config)) return json_({ ok:false, error:'FORBIDDEN' });
    if (config.ALLOW_WRITES !== 'TRUE') return json_({ ok:false, error:'READ_ONLY', message:'Writes are disabled in Config.' });

    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.confirmed !== true) return json_({ ok:false, error:'CONFIRM_REQUIRED' });

    const action = String(body.action || '');
    if (action === 'appendMedicationLog') {
      const sh = ss.getSheetByName('MedicationLog');
      const id = Utilities.getUuid();
      sh.appendRow([id, body.orderId||'', body.studentId||'', body.scheduledTime||'', new Date(), user_(), body.status||'GIVEN', body.note||'']);
      audit_(ss, user_(), 'APPEND', 'MedicationLog', id, 'Confirmed write from GitHub Pages');
      return json_({ ok:true, id });
    }

    if (action === 'completeTask') {
      const sh = ss.getSheetByName('Tasks');
      const values = sh.getDataRange().getValues();
      for (let i=1;i<values.length;i++) {
        if (String(values[i][0]) === String(body.taskId)) {
          sh.getRange(i+1, 6).setValue('DONE');
          audit_(ss, user_(), 'UPDATE', 'Tasks', body.taskId, 'Task completed from GitHub Pages');
          return json_({ ok:true, id:body.taskId });
        }
      }
      return json_({ ok:false, error:'NOT_FOUND' });
    }

    return json_({ ok:false, error:'WRITE_ACTION_NOT_ALLOWED' });
  } catch (err) {
    return json_({ ok:false, error:'SERVER_ERROR', message:String(err && err.message || err) });
  }
}

function audit_(ss, actor, action, entity, id, note) {
  const sh = ss.getSheetByName('AuditLog');
  if (!sh) return;
  sh.appendRow([Utilities.getUuid(), new Date(), actor, action, entity, id, '', '', note]);
}
