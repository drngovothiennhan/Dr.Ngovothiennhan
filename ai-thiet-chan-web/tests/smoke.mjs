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
  const home=await fetch(`http://127.0.0.1:${port}/`); const html=await home.text();
  if(!home.ok||!html.includes('A.I THIỆT CHẨN')) throw new Error('home gate failed');
  const manifest=await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`).then(r=>r.json());
  if(manifest.display!=='standalone'||!Array.isArray(manifest.icons)||manifest.icons.length===0) throw new Error('PWA manifest gate failed');
  const sw=await fetch(`http://127.0.0.1:${port}/sw.js`).then(r=>r.text());
  if(!sw.includes("url.pathname.startsWith('/api/')")) throw new Error('service worker API bypass missing');
  const noKey=await fetch(`http://127.0.0.1:${port}/api/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({image:'data:image/jpeg;base64,'+'a'.repeat(200)})});
  if(noKey.status!==428) throw new Error(`expected 428 without AI key, got ${noKey.status}`);
  await scanPublic(path.join(root,'public'));
  const serverText=await readFile(path.join(root,'server.mjs'),'utf8');
  if(/appdeploy/i.test(serverText)) throw new Error('legacy platform reference: server.mjs');
  console.log('SMOKE PASS: independent web, PWA shell, API gates, no legacy platform references');
} finally {
  child.kill('SIGTERM');
}
