import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const port = 3217;
const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '' }, stdio: ['ignore','pipe','pipe'] });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitForHealth(){
  for(let i=0;i<40;i++){
    try{ const r=await fetch(`http://127.0.0.1:${port}/api/health`,{cache:'no-store'}); if(r.ok) return r.json(); }catch{}
    await sleep(250);
  }
  throw new Error('health timeout');
}

async function scanPublic(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  for(const entry of entries){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) await scanPublic(full);
    else if(/\.(mjs|js|html|css|json|webmanifest|svg)$/i.test(entry.name)){
      const text=await readFile(full,'utf8');
      if(/appdeploy/i.test(text)) throw new Error(`legacy platform reference: ${path.relative(root,full)}`);
    }
  }
}

try{
  const health=await waitForHealth();
  if(!health.ok) throw new Error('health not ok');
  if(health.architecture!=='independent-web') throw new Error('wrong architecture');
  if(health.legacyPlatform!==false) throw new Error('legacy platform flag is not false');
  if(health.version!=='2.3.0') throw new Error(`wrong version: ${health.version}`);
  if(health.sharedProvider!==true) throw new Error('shared provider gate failed');
  if(health.clientSuppliedKeyAccepted!==false) throw new Error('client key must be disabled');
  if(!String(health.knowledgeVersion||'').startsWith('thiet-chan-kb-')) throw new Error('knowledge version missing');
  if(Number(health.knowledgeSources)!==2) throw new Error('knowledge sources gate failed');
  if(Number(health.openSourceReferences)!==5) throw new Error('open source references gate failed');

  const home=await fetch(`http://127.0.0.1:${port}/`); const html=await home.text();
  if(!home.ok||!html.includes('A.I THIỆT CHẨN')) throw new Error('home gate failed');
  if(!html.includes('switchCameraBtn')) throw new Error('camera switch control missing');
  if(!html.includes('theoryBox')) throw new Error('theory assessment panel missing');
  if(!html.includes('exportMlBtn')) throw new Error('ML export control missing');
  if(!html.includes('/open-source.html')) throw new Error('open source public notice missing');
  if(html.includes('geminiKeyInput')||html.includes('settingsDialog')) throw new Error('client key UI must be removed');

  const appJs=await fetch(`http://127.0.0.1:${port}/app.js`).then(r=>r.text());
  if(!appJs.includes("facingMode: 'environment'")) throw new Error('rear camera default missing');
  if(!appJs.includes("previous==='environment'?'user':'environment'")) throw new Error('front/rear camera switching missing');
  if(!appJs.includes('laplacianVariance')) throw new Error('enhanced focus QC missing');
  if(!appJs.includes('ai-thiet-chan-training-sample-v1')) throw new Error('ML sample export schema missing');
  if(appJs.includes('aiThietChanGeminiKey')||appJs.includes('x-gemini-key')) throw new Error('client Gemini key path must be absent');

  const knowledge=await readFile(path.join(root,'knowledge.mjs'),'utf8');
  for(const marker of ['Chất lưỡi đỏ + rêu vàng khô/táo','Thấp nhiệt trung trở','Vị âm khuy hư','Tỳ Vị hư hàn']){
    if(!knowledge.includes(marker)) throw new Error(`knowledge marker missing: ${marker}`);
  }

  const sources=await fetch(`http://127.0.0.1:${port}/api/sources`).then(r=>r.json());
  if(!sources.ok||!Array.isArray(sources.references)||sources.references.length!==5) throw new Error('sources endpoint gate failed');
  for(const name of ['TongueDiagnosis.AI','OpenCV','Segment Anything','ONNX Runtime','TensorFlow.js']){
    if(!sources.references.some(v=>v.name===name)) throw new Error(`source missing: ${name}`);
  }

  const manifest=await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`).then(r=>r.json());
  if(manifest.display!=='standalone'||!Array.isArray(manifest.icons)||manifest.icons.length===0) throw new Error('PWA manifest gate failed');
  const sw=await fetch(`http://127.0.0.1:${port}/sw.js`).then(r=>r.text());
  if(!sw.includes("url.pathname.startsWith('/api/')")) throw new Error('service worker API bypass missing');
  if(!sw.includes('ai-thiet-chan-v2.3.0')) throw new Error('service worker cache version gate failed');
  if(!sw.includes('/open-source.html')) throw new Error('open-source page cache missing');

  const noKey=await fetch(`http://127.0.0.1:${port}/api/analyze`,{method:'POST',headers:{'content-type':'application/json','x-gemini-key':'should-not-be-accepted'},body:JSON.stringify({image:'data:image/jpeg;base64,'+'a'.repeat(200)})});
  if(noKey.status!==428) throw new Error(`client key bypass detected, expected 428 got ${noKey.status}`);

  await scanPublic(path.join(root,'public'));
  const serverText=await readFile(path.join(root,'server.mjs'),'utf8');
  if(/appdeploy/i.test(serverText)) throw new Error('legacy platform reference: server.mjs');
  if(serverText.includes("req.get('x-gemini-key')")) throw new Error('server still accepts client Gemini key');
  if(!serverText.includes('tongue-feature-vector-v1')) throw new Error('ML feature vector missing');
  console.log('SMOKE PASS: v2.3.0 shared Gemini gateway, source notices, enhanced QC and ML-ready export');
} finally {
  child.kill('SIGTERM');
}
