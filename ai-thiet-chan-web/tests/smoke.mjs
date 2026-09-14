import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const port=3217;
const child=spawn(process.execPath,['--import','./runtime-guard.mjs','server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),GEMINI_API_KEY:''},stdio:['ignore','pipe','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitForHealth(){for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`,{cache:'no-store'});if(r.ok)return r.json();}catch{}await sleep(250);}throw new Error('health timeout');}
async function scanPublic(dir){const entries=await readdir(dir,{withFileTypes:true});for(const entry of entries){const full=path.join(dir,entry.name);if(entry.isDirectory())await scanPublic(full);else if(/\.(mjs|js|html|css|json|webmanifest|svg)$/i.test(entry.name)){const text=await readFile(full,'utf8');if(/appdeploy/i.test(text))throw new Error(`legacy platform reference: ${path.relative(root,full)}`);}}}

try{
  const health=await waitForHealth();
  if(!health.ok) throw new Error('health not ok');
  if(health.architecture!=='independent-web'||health.legacyPlatform!==false) throw new Error('architecture gate failed');
  if(health.version!=='2.5.0') throw new Error(`wrong version: ${health.version}`);
  if(health.sharedProvider!==true||health.clientSuppliedKeyAccepted!==false) throw new Error('shared provider gate failed');
  if(!Array.isArray(health.assessmentModes)||!health.assessmentModes.includes('normal')||!health.assessmentModes.includes('general')) throw new Error('assessment modes gate failed');
  if(!Array.isArray(health.generalAssessmentViews)||!health.generalAssessmentViews.includes('top')||!health.generalAssessmentViews.includes('bottom')) throw new Error('dual view gate failed');
  if(health.caseCollection?.mode!=='automatic'||health.caseCollection?.history!==true||health.caseCollection?.deduplicate!=='sha256-composite') throw new Error('automatic dual-view case collection gate failed');
  if(!String(health.knowledgeVersion||'').startsWith('thiet-chan-kb-')) throw new Error('knowledge version missing');
  if(Number(health.knowledgeSources)!==2||Number(health.openSourceReferences)!==5) throw new Error('knowledge/source gate failed');

  const home=await fetch(`http://127.0.0.1:${port}/`);const html=await home.text();
  if(!home.ok||!html.includes('A.I THIỆT CHẨN')) throw new Error('home gate failed');
  for(const marker of ['normalModeBtn','generalModeBtn','topCameraBtn','bottomCameraBtn','topFileInput','bottomFileInput','switchCameraBtn','bottomResultSection','Lịch sử ca']) if(!html.includes(marker)) throw new Error(`dual-view UI missing: ${marker}`);
  for(const marker of ['settingsBtn','settingsDialog','settingsNormalMode','settingsGeneralMode','Cài đặt']) if(!html.includes(marker)) throw new Error(`settings UI missing: ${marker}`);
  for(const marker of ['capture-frame-guide','qualityTitle','qualityTotal','qualityGeneral','qualityQc','qualityConfidence','qualityDevice','Giới hạn sử dụng y tế']) if(!html.includes(marker)) throw new Error(`quality UI missing: ${marker}`);
  for(const marker of ['toggleHistoryBtn','historyPanel','startInquiryBtn','inquiryProgress','Vấn chẩn · Thập vấn','không phải chẩn đoán xác định']) if(!html.includes(marker)) throw new Error(`consultation/history UI missing: ${marker}`);
  if(!html.includes('/settings.css')||!html.includes('/settings.js')||!html.includes('/quality-dashboard.css')||!html.includes('/quality-dashboard.js')||!html.includes('/capture-metadata.js')||!html.includes('/consultation.js')) throw new Error('quality/settings/capture/consultation assets missing');
  if(!html.includes('camera sau')||!html.includes('mạch máu/tĩnh mạch dưới lưỡi')) throw new Error('capture guidance missing');
  if(html.includes('exportMlBtn')||html.includes('Xuất mẫu máy học')) throw new Error('manual ML export must stay removed');
  if(!html.includes('lưu tự động vào kho dữ liệu học máy')) throw new Error('automatic collection disclosure missing');
  if(!html.includes('không phải sensitivity/specificity')) throw new Error('clinical confidence boundary missing');
  if(!html.includes('không lưu raw user-agent')) throw new Error('capture metadata privacy disclosure missing');

  const appJs=await fetch(`http://127.0.0.1:${port}/app.js`).then(r=>r.text());
  for(const marker of ["mode:'normal'","images:{top:emptyImage(),bottom:emptyImage()}","openCamera('top')","openCamera('bottom')",'bottomImage','bottomQc']) if(!appJs.includes(marker)) throw new Error(`dual-view client marker missing: ${marker}`);
  if(!appJs.includes("previous==='environment'?'user':'environment'")) throw new Error('camera switch missing');
  if(!appJs.includes('laplacianVariance')) throw new Error('enhanced QC missing');
  if(!appJs.includes('loadHistory')||!appJs.includes("'/api/cases?limit=30'")) throw new Error('history client missing');
  if(appJs.includes('exportMlSample')||appJs.includes('ai-thiet-chan-training-sample-v1')) throw new Error('manual export code must be absent');
  if(appJs.includes('aiThietChanGeminiKey')||appJs.includes('x-gemini-key')) throw new Error('client Gemini key path must be absent');

  const captureMeta=await fetch(`http://127.0.0.1:${port}/capture-metadata.js`).then(r=>r.text());
  if(captureMeta.includes('raw user')) throw new Error('raw user agent must not be stored');
  if(!captureMeta.includes('capture-context-v1')||!captureMeta.includes('deviceClass')||!captureMeta.includes('viewportClass')||!captureMeta.includes("url.includes('/api/analyze')")) throw new Error('capture metadata behavior gate failed');

  const consultationJs=await fetch(`http://127.0.0.1:${port}/consultation.js`).then(r=>r.text());
  for(const marker of ['questions=[','Hàn – nhiệt','Mồ hôi','Đại – tiểu tiện','Bệnh cũ – thuốc','Khởi phát – diễn tiến','[THAP_VAN_CONTEXT]','Nhận định biện chứng tham khảo','toggleHistoryBtn']) if(!consultationJs.includes(marker)) throw new Error(`Thap van workflow missing: ${marker}`);
  if(!consultationJs.includes('questions.map')||!consultationJs.includes("url.includes('/api/chat')")) throw new Error('Thap van synthesis path missing');

  const settingsJs=await fetch(`http://127.0.0.1:${port}/settings.js`).then(r=>r.text());
  if(!settingsJs.includes('aiThietChanDefaultMode')||!settingsJs.includes("applyMode('general')")||!settingsJs.includes("applyMode('normal')")) throw new Error('settings behavior gate failed');

  const qualityJs=await fetch(`http://127.0.0.1:${port}/quality-dashboard.js`).then(r=>r.text());
  for(const marker of ["'/api/cases?limit=100'",'navigator.mediaDevices?.getUserMedia','qualityConfidence','Ca đạt QC tối thiểu','chưa có nhãn đồng thuận chuyên gia']) if(!qualityJs.includes(marker)) throw new Error(`quality dashboard behavior missing: ${marker}`);

  const runtimeGuard=await readFile(path.join(root,'runtime-guard.mjs'),'utf8');
  if(!runtimeGuard.includes("generativelanguage.googleapis.com")||!runtimeGuard.includes('45_000')||!runtimeGuard.includes(".supabase.co")||!runtimeGuard.includes('15_000')) throw new Error('runtime upstream guard missing');

  const serverText=await readFile(path.join(root,'server.mjs'),'utf8');
  for(const marker of ['ai_thiet_chan_store_case_v2','ai_thiet_chan_list_cases_v2','tongue-dual-view-feature-vector-v1','bottomImage','sublingual-vessel-description','sha256-composite']) if(!serverText.includes(marker)) throw new Error(`server dual-view marker missing: ${marker}`);
  if(/appdeploy/i.test(serverText)||serverText.includes("req.get('x-gemini-key')")) throw new Error('legacy/client-key server path detected');

  const noKey=await fetch(`http://127.0.0.1:${port}/api/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'general',topImage:'data:image/jpeg;base64,'+'a'.repeat(200),bottomImage:'data:image/jpeg;base64,'+'b'.repeat(200)})});
  if(noKey.status!==428) throw new Error(`expected analyze 428 without shared key, got ${noKey.status}`);
  const casesWithoutKey=await fetch(`http://127.0.0.1:${port}/api/cases`);
  if(casesWithoutKey.status!==428) throw new Error(`expected case history 428 without shared key, got ${casesWithoutKey.status}`);

  const manifest=await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`).then(r=>r.json());
  if(manifest.display!=='standalone'||!Array.isArray(manifest.icons)||manifest.icons.length===0) throw new Error('PWA manifest gate failed');
  const sw=await fetch(`http://127.0.0.1:${port}/sw.js`).then(r=>r.text());
  if(!sw.includes("url.pathname.startsWith('/api/')")||!sw.includes('ai-thiet-chan-v2.5.4')||!sw.includes('/dual-view.css')||!sw.includes('/settings.css')||!sw.includes('/settings.js')||!sw.includes('/quality-dashboard.css')||!sw.includes('/quality-dashboard.js')||!sw.includes('/capture-metadata.js')||!sw.includes('/consultation.js')) throw new Error('service worker gate failed');

  await scanPublic(path.join(root,'public'));
  console.log('SMOKE PASS: v2.5.0 dual-view assessment with collapsed history and deterministic Thap van consultation before reference synthesis');
} finally { child.kill('SIGTERM'); }
