// Google Sheets connector for School Health Assistant
// Public-safe source: no access token, password, service-account key, or health data here.
// Configure OAuth client ID in the browser localStorage or replace at deployment time.

const DEFAULT_GOOGLE_CLIENT_ID = '1074784573482-dvc8m31rhmhv4uucas7hq6bdd30jcusm.apps.googleusercontent.com';
const DEFAULT_SHEET_ID = '15UIjrBO0yHBU5jwzFYUYeMiEcKxKWQ6CRR9ZktQ3wG4';
const APP_FOLDER_ID = '1xfcLkDysWdNKjQ2USVHrh8MBnYF6M4wQ';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const GoogleSheetsConnector = (() => {
  let tokenClient = null;
  let accessToken = null;

  function getConfig() {
    return {
      clientId: localStorage.getItem('sha_google_client_id') || DEFAULT_GOOGLE_CLIENT_ID,
      sheetId: localStorage.getItem('sha_sheet_id') || DEFAULT_SHEET_ID
    };
  }

  function saveConfig(clientId, sheetId) {
    localStorage.setItem('sha_google_client_id', clientId.trim());
    localStorage.setItem('sha_sheet_id', (sheetId.trim() || DEFAULT_SHEET_ID));
  }

  function ready() {
    const c = getConfig();
    return Boolean(window.google?.accounts?.oauth2 && c.clientId && c.sheetId);
  }

  function connect() {
    const c = getConfig();
    if (!c.clientId) throw new Error('Chưa cấu hình Google OAuth Client ID');
    if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services chưa tải xong');

    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: c.clientId,
        scope: SHEETS_SCOPE + ' ' + DRIVE_FILE_SCOPE,
        callback: (resp) => {
          if (resp?.error) return reject(new Error(resp.error));
          accessToken = resp.access_token;
          resolve(resp);
        }
      });
      tokenClient.requestAccessToken({prompt: accessToken ? '' : 'consent'});
    });
  }

  function disconnect() {
    if (accessToken && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
  }

  async function api(path, options={}) {
    if (!accessToken) await connect();
    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error('Google Sheets API ' + res.status + ': ' + body);
    }
    return res.json();
  }

  async function readRange(range) {
    const {sheetId} = getConfig();
    if (!sheetId) throw new Error('Chưa cấu hình Spreadsheet ID');
    return api(encodeURIComponent(sheetId) + '/values/' + encodeURIComponent(range));
  }

  async function appendRows(range, rows) {
    const {sheetId} = getConfig();
    if (!sheetId) throw new Error('Chưa cấu hình Spreadsheet ID');
    const path = encodeURIComponent(sheetId) + '/values/' + encodeURIComponent(range) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
    return api(path, {
      method:'POST',
      body: JSON.stringify({values: rows})
    });
  }

  async function appendAudit(action, entityType, entityId, note='') {
    const now = new Date().toISOString();
    return appendRows('AuditLog!A:K', [[
      'AUD-' + Date.now(), now, 'CURRENT_GOOGLE_USER', 'NVYT',
      action, entityType, entityId || '', '', '', 'GITHUB_PAGES', note
    ]]);
  }

  return {getConfig,saveConfig,ready,connect,disconnect,readRange,appendRows,appendAudit,DEFAULT_GOOGLE_CLIENT_ID,DEFAULT_SHEET_ID,APP_FOLDER_ID};
})();