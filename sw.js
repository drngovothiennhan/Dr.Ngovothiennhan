/* App Y tế VK — Service Worker (miễn phí, chỉ cache tài nguyên tĩnh).
   Dữ liệu Google (Sheets/Drive/Apps Script) KHÔNG bao giờ được cache. */
const VERSION='2026.10.03.V2.4.0-ATTP';
const CACHE='yte-vk-'+VERSION;
const SHELL=['./','index.html','layout-v3.css','attp-v2.css','google-sheets-connector.js','v2-workflows.js','layout-v3.js','attp-v2.js','kitchen-templates.js','integration-vk.js','attp-core.js','attp-import.js','manifest.webmanifest','icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL).catch(()=>{})).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k.startsWith('yte-vk-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET')return;
  const sameOrigin=u.origin===location.origin,cdn=u.hostname==='cdn.jsdelivr.net';
  if(!sameOrigin&&!cdn)return; // Google API, Apps Script, OAuth: để trình duyệt xử lý
  if(u.pathname.endsWith('/version.json'))return; // luôn lấy bản mới
  e.respondWith(
    fetch(r).then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy))}return res})
      .catch(()=>caches.match(r).then(m=>m||caches.match('index.html')))
  );
});
